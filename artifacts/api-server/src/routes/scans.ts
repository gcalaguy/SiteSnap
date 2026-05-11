import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, scansTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

// POST /api/scans — register a scan record after presigned upload
const CreateScanBody = z.object({
  objectPath: z.string().min(1).refine(
    (p) => p.startsWith("/objects/"),
    { message: "objectPath must be a valid object storage path (must start with /objects/)" }
  ),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive().optional(),
});

router.post(
  "/scans",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = CreateScanBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { objectPath, fileName, fileSizeBytes } = parsed.data;

    const [scan] = await db.insert(scansTable).values({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      objectPath,
      fileName,
      fileSizeBytes: fileSizeBytes ?? null,
    }).returning();

    res.status(201).json(scan);
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

export default router;
