import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { createReadStream } from "fs";
import fs from "fs";
import path from "path";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission, ObjectAccessGroupType } from "../lib/objectAcl";
import { requireAuth, requireCompany } from "../lib/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Allowlist of MIME types accepted for authenticated uploads.
// Excludes executables, scripts, and server-side code that could create XSS/RCE
// vectors if ever served back to users.
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

// Ensure local upload directory exists as a fallback / safety net.
const localUploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

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
  requireAuth,
  requireCompany,
  diskUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const mimeType = req.file.mimetype || "";
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File type not permitted", code: "INVALID_FILE_TYPE" });
      return;
    }
    if (req.file.size > MAX_UPLOAD_BYTES) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File exceeds maximum size of 100 MB", code: "FILE_TOO_LARGE" });
      return;
    }
    try {
      const objectPath = await objectStorageService.uploadStream(createReadStream(req.file.path), mimeType);
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: String(req.userId!),
        visibility: "private",
        aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: String(req.companyId!) }, permission: ObjectPermission.READ }],
      });
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading file to storage");
      res.status(500).json({ error: "Failed to upload file" });
    } finally {
      await cleanupUpload(req.file?.path);
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
router.post("/storage/uploads/request-url", requireAuth, requireCompany, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(contentType)) {
      res.status(400).json({ error: "File type not permitted", code: "INVALID_FILE_TYPE" });
      return;
    }
    if (size > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "File exceeds maximum size of 100 MB", code: "FILE_TOO_LARGE" });
      return;
    }

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
 * POST /storage/uploads/company-asset
 *
 * Server-side multipart upload for company assets (logo, quote template,
 * invoice template).  Accepts a single file (field name "file") and returns
 * the canonical /objects/... path.  The client then calls the appropriate
 * PATCH endpoint to store the path on the company row.
 *
 * This avoids the unreliable client-side presigned-URL flow which can hang
 * when the GCS PUT stalls or CORS fails in the Replit proxy environment.
 */
router.post(
  "/storage/uploads/company-asset",
  requireAuth,
  requireCompany,
  diskUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const mimeType = req.file.mimetype || "";
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File type not permitted", code: "INVALID_FILE_TYPE" });
      return;
    }
    if (req.file.size > MAX_UPLOAD_BYTES) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File exceeds maximum size of 100 MB", code: "FILE_TOO_LARGE" });
      return;
    }
    try {
      const objectPath = await objectStorageService.uploadStream(createReadStream(req.file.path), mimeType);
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: String(req.userId!),
        visibility: "private",
        aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: String(req.companyId!) }, permission: ObjectPermission.READ }],
      });
      res.status(200).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading company asset to storage");
      res.status(500).json({ error: "Failed to upload company asset" });
    } finally {
      await cleanupUpload(req.file?.path);
    }
  },
);

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
 * GET /storage/objects/*path/signed-url
 *
 * Return a signed URL for a private object. This is used for inline image
 * previews in the browser where the auth cookie is not available (e.g. <img>
 * tags in external contexts). The endpoint performs the same ownership check
 * as the direct download endpoint.
 *
 * Must be mounted BEFORE the wildcard `*path` route below so that paths
 * ending in `/signed-url` are matched here first.
 */
router.get(
  "/storage/objects/*path/signed-url",
  requireAuth,
  requireCompany,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId: req.userId != null ? String(req.userId) : undefined,
        objectFile,
        requestedPermission: ObjectPermission.READ,
        fallbackCompanyId: req.companyId != null ? String(req.companyId) : undefined,
      });

      if (!canAccess) {
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

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId: req.userId != null ? String(req.userId) : undefined,
        objectFile,
        requestedPermission: ObjectPermission.READ,
        fallbackCompanyId: req.companyId != null ? String(req.companyId) : undefined,
      });

      if (!canAccess) {
        res.status(404).json({ error: "Object not found" });
        return;
      }

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

export default router;
