import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer from "multer";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { requireAuth, requireCompany } from "../lib/auth";
import { db, fileAttachmentsTable, projectDocumentsTable, projectsTable, workerDocumentsTable, sitePhotosTable, dailyReportPhotosTable, dailyReportsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * POST /storage/uploads/file
 *
 * Accept a multipart/form-data file upload (field name: "file") from the
 * mobile client, upload it to private object storage server-side, and return
 * the canonical /objects/... path.
 *
 * This is preferred over client-side presigned-URL uploads because Expo Go
 * cannot reliably perform binary PUT requests to external GCS URLs.
 */
router.post(
  "/storage/uploads/file",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    try {
      const contentType = req.file.mimetype || "application/octet-stream";
      const objectPath = await objectStorageService.uploadBuffer(req.file.buffer, contentType);
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading file to storage");
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get(
  "/storage/objects/*path",
  requireAuth,
  requireCompany,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      // Verify ownership: objectPath must belong to this company via fileAttachments or projectDocuments
      const [fileAttachment] = await db
        .select({ id: fileAttachmentsTable.id })
        .from(fileAttachmentsTable)
        .where(and(eq(fileAttachmentsTable.objectPath, objectPath), eq(fileAttachmentsTable.companyId, req.companyId!)))
        .limit(1);

      let isOwner = !!fileAttachment;
      if (!isOwner) {
        const [projectDoc] = await db
          .select({ id: projectDocumentsTable.id })
          .from(projectDocumentsTable)
          .innerJoin(projectsTable, eq(projectsTable.id, projectDocumentsTable.projectId))
          .where(and(eq(projectDocumentsTable.objectPath, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!projectDoc;
      }

      // Also check worker documents vault
      if (!isOwner) {
        const [workerDoc] = await db
          .select({ id: workerDocumentsTable.id })
          .from(workerDocumentsTable)
          .where(and(eq(workerDocumentsTable.filePath, objectPath), eq(workerDocumentsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!workerDoc;
      }

      // Check site photos (field logs)
      if (!isOwner) {
        const [sitePhoto] = await db
          .select({ id: sitePhotosTable.id })
          .from(sitePhotosTable)
          .innerJoin(projectsTable, eq(projectsTable.id, sitePhotosTable.projectId))
          .where(and(eq(sitePhotosTable.imageUrl, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!sitePhoto;
      }

      // Check daily report photos
      if (!isOwner) {
        const [dailyReportPhoto] = await db
          .select({ id: dailyReportPhotosTable.id })
          .from(dailyReportPhotosTable)
          .innerJoin(dailyReportsTable, eq(dailyReportsTable.id, dailyReportPhotosTable.reportId))
          .innerJoin(projectsTable, eq(projectsTable.id, dailyReportsTable.projectId))
          .where(and(eq(dailyReportPhotosTable.objectPath, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!dailyReportPhoto;
      }

      if (!isOwner) {
        res.status(404).json({ error: "Object not found" });
        return;
      }

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

/**
 * GET /storage/objects/:path/signed-url
 *
 * Return a signed URL for a private object. This is used for inline image
 * previews in the browser where the auth cookie is not available (e.g. <img>
 * tags in external contexts). The endpoint performs the same ownership check
 * as the direct download endpoint.
 */
router.get(
  "/storage/objects/:path/signed-url",
  requireAuth,
  requireCompany,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const [fileAttachment] = await db
        .select({ id: fileAttachmentsTable.id })
        .from(fileAttachmentsTable)
        .where(and(eq(fileAttachmentsTable.objectPath, objectPath), eq(fileAttachmentsTable.companyId, req.companyId!)))
        .limit(1);

      let isOwner = !!fileAttachment;
      if (!isOwner) {
        const [projectDoc] = await db
          .select({ id: projectDocumentsTable.id })
          .from(projectDocumentsTable)
          .innerJoin(projectsTable, eq(projectsTable.id, projectDocumentsTable.projectId))
          .where(and(eq(projectDocumentsTable.objectPath, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!projectDoc;
      }

      if (!isOwner) {
        const [workerDoc] = await db
          .select({ id: workerDocumentsTable.id })
          .from(workerDocumentsTable)
          .where(and(eq(workerDocumentsTable.filePath, objectPath), eq(workerDocumentsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!workerDoc;
      }

      if (!isOwner) {
        const [sitePhoto] = await db
          .select({ id: sitePhotosTable.id })
          .from(sitePhotosTable)
          .innerJoin(projectsTable, eq(projectsTable.id, sitePhotosTable.projectId))
          .where(and(eq(sitePhotosTable.imageUrl, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!sitePhoto;
      }

      if (!isOwner) {
        const [dailyReportPhoto] = await db
          .select({ id: dailyReportPhotosTable.id })
          .from(dailyReportPhotosTable)
          .innerJoin(dailyReportsTable, eq(dailyReportsTable.id, dailyReportPhotosTable.reportId))
          .innerJoin(projectsTable, eq(projectsTable.id, dailyReportsTable.projectId))
          .where(and(eq(dailyReportPhotosTable.objectPath, objectPath), eq(projectsTable.companyId, req.companyId!)))
          .limit(1);
        isOwner = !!dailyReportPhoto;
      }

      if (!isOwner) {
        res.status(404).json({ error: "Object not found" });
        return;
      }

      const signedUrl = await objectStorageService.getObjectEntityReadURL(objectPath, 900);
      res.json({ url: signedUrl, objectPath });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error generating signed URL");
      res.status(500).json({ error: "Failed to generate signed URL" });
    }
  },
);

export default router;
