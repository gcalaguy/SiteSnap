import { Router } from "express";
import { z } from "zod/v4";
import { db, mediaHubPhotosTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { assertProjectInCompany as verifyProjectAccess, canAccessProject } from "../lib/projectAccess";
import { BadRequestError } from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const PresignedUrlBody = z.object({
  fileType: z.string().min(1),
  fileName: z.string().min(1).optional(),
});

const SavePhotoBody = z.object({
  projectId: z.number().int().positive(),
  imageUrl: z.string().min(1),
  roomLocation: z.string().nullable().optional(),
  markupData: z.unknown().nullable().optional(),
});

// POST /api/media/presigned-url
router.post(
  "/media/presigned-url",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const parsed = PresignedUrlBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid body", parsed.error.flatten());
    }
    try {
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
      res.json({
        uploadURL,
        objectPath,
        fileType: parsed.data.fileType,
        fileName: parsed.data.fileName ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "media-hub presigned-url failed");
      res.status(500).json({ error: "Failed to generate presigned URL" });
    }
  }),
);

// POST /api/media/save-photo
router.post(
  "/media/save-photo",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const parsed = SavePhotoBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid body", parsed.error.flatten());
    }
    const { projectId, imageUrl, roomLocation, markupData } = parsed.data;
    const uploadedById = req.userId ?? null;

    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    try {
      await objectStorage.trySetCompanyReadAcl(
        imageUrl,
        String(req.userId!),
        String(req.companyId!),
      );
    } catch (err) {
      req.log.error({ err }, "Rejected photo with invalid or already-owned object path");
      res.status(400).json({ error: "Invalid photo reference" });
      return;
    }

    const [photo] = await db
      .insert(mediaHubPhotosTable)
      .values({
        projectId,
        uploadedById,
        imageUrl,
        roomLocation: roomLocation ?? null,
        markupData: markupData ?? null,
      })
      .returning();

    res.status(201).json(photo);
  }),
);

export default router;
