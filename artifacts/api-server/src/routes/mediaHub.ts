import { Router } from "express";
import { z } from "zod/v4";
import { db, mediaHubPhotosTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
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

async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project ?? null;
}

// POST /api/media/presigned-url
router.post(
  "/media/presigned-url",
  requireAuth,
  requireCompany,
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
