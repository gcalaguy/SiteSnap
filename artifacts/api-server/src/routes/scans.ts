import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, scansTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";
import { generatePlyThumbnailFromUrl } from "../lib/plyThumbnail";
import { logger } from "../lib/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

// GET /api/scans — list scans for the company, optionally filtered by projectId
router.get(
  "/scans",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectIdRaw = req.query.projectId;
    const projectId = projectIdRaw ? parseInt(String(projectIdRaw), 10) : undefined;

    if (projectIdRaw !== undefined && isNaN(projectId!)) {
      throw new BadRequestError("Invalid projectId");
    }

    const conditions = [eq(scansTable.companyId, req.companyId!)];
    if (projectId !== undefined) {
      conditions.push(eq(scansTable.projectId, projectId));
    }

    const scans = await db
      .select()
      .from(scansTable)
      .where(and(...conditions))
      .orderBy(scansTable.createdAt);

    res.json(scans);
  }),
);

// POST /api/scans — register a scan record after presigned upload
const CreateScanBody = z.object({
  objectPath: z.string().min(1).refine(
    (p) => p.startsWith("/objects/"),
    { message: "objectPath must be a valid object storage path (must start with /objects/)" }
  ),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive().optional(),
  sourceType: z.enum(["file", "video_capture"]).optional().default("file"),
  projectId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).optional().nullable(),
});

router.post(
  "/scans",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = CreateScanBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { objectPath, fileName, fileSizeBytes, sourceType, projectId, name } = parsed.data;

    const [scan] = await db.insert(scansTable).values({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      objectPath,
      fileName,
      fileSizeBytes: fileSizeBytes ?? null,
      sourceType,
      status: "ready",
      projectId: projectId ?? null,
      name: name ?? null,
      thumbnailPath: null,
    }).returning();

    res.status(201).json(scan);

    // Fire-and-forget: generate thumbnail server-side after responding
    (async () => {
      try {
        const signedUrl = await objectStorageService.getObjectEntityReadURL(objectPath, 300);
        const pngBuf = await generatePlyThumbnailFromUrl(signedUrl);
        if (pngBuf) {
          const thumbPath = await objectStorageService.uploadBuffer(pngBuf, "image/png");
          await db.update(scansTable)
            .set({ thumbnailPath: thumbPath })
            .where(eq(scansTable.id, scan!.id));
          logger.info({ scanId: scan!.id, thumbPath }, "scan thumbnail generated");
        }
      } catch (err) {
        logger.warn({ err, scanId: scan!.id }, "scan thumbnail generation failed (non-fatal)");
      }
    })();
  }),
);

// PATCH /api/scans/:id — rename a scan
const UpdateScanBody = z.object({
  name: z.string().min(1).max(200),
});

router.patch(
  "/scans/:id",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");

    const parsed = UpdateScanBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const [existing] = await db
      .select()
      .from(scansTable)
      .where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) throw new NotFoundError("Scan not found");

    const [updated] = await db
      .update(scansTable)
      .set({ name: parsed.data.name })
      .where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)))
      .returning();

    res.json(updated);
  }),
);

// DELETE /api/scans/:id — delete a scan record
router.delete(
  "/scans/:id",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");

    const [existing] = await db
      .select()
      .from(scansTable)
      .where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) throw new NotFoundError("Scan not found");

    await db.delete(scansTable).where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)));

    res.status(204).send();
  }),
);

// GET /api/scans/:id/url — get a 15-minute signed read URL for the scan file
router.get(
  "/scans/:id/url",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");

    const [scan] = await db
      .select()
      .from(scansTable)
      .where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)))
      .limit(1);

    if (!scan) throw new NotFoundError("Scan not found");

    const signedUrl = await objectStorageService.getObjectEntityReadURL(scan.objectPath, 900);

    res.json({ url: signedUrl, scan });
  }),
);

// GET /api/scans/:id/thumbnail-url — get a signed read URL for the scan thumbnail
router.get(
  "/scans/:id/thumbnail-url",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");

    const [scan] = await db
      .select()
      .from(scansTable)
      .where(and(eq(scansTable.id, id), eq(scansTable.companyId, req.companyId!)))
      .limit(1);

    if (!scan) throw new NotFoundError("Scan not found");
    if (!scan.thumbnailPath) throw new NotFoundError("Scan has no thumbnail");

    const url = await objectStorageService.getObjectEntityReadURL(scan.thumbnailPath, 900);

    res.json({ url });
  }),
);

export default router;
