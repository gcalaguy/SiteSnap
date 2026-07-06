import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyReportPhotosTable, projectsTable, dailyReportsTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod";

const router = Router({ mergeParams: true });
const objectStorageService = new ObjectStorageService();

/** Verify the report belongs to this company via project ownership */
async function verifyReportAccess(reportId: number, projectId: number, companyId: number) {
  const [report] = await db
    .select({ id: dailyReportsTable.id })
    .from(dailyReportsTable)
    .innerJoin(projectsTable, and(eq(projectsTable.id, dailyReportsTable.projectId), eq(projectsTable.companyId, companyId)))
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.projectId, projectId)))
    .limit(1);
  return report ?? null;
}

const AddPhotoBody = z.object({
  objectPath: z.string().min(1),
  caption: z.string().optional(),
});

// GET /projects/:projectId/daily-reports/:reportId/photos
router.get("/", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewPhotos"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);
  if (isNaN(reportId) || isNaN(projectId)) {
    res.status(400).json({ error: "Invalid reportId" });
    return;
  }

  const report = await verifyReportAccess(reportId, projectId, req.companyId!);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const photos = await db
    .select()
    .from(dailyReportPhotosTable)
    .where(eq(dailyReportPhotosTable.reportId, reportId))
    .orderBy(dailyReportPhotosTable.uploadedAt);

  res.json(photos);
}))

// POST /projects/:projectId/daily-reports/:reportId/photos
router.post("/", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewPhotos"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);
  if (isNaN(reportId) || isNaN(projectId)) {
    res.status(400).json({ error: "Invalid reportId" });
    return;
  }

  const report = await verifyReportAccess(reportId, projectId, req.companyId!);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const parsed = AddPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  try {
    await objectStorageService.trySetCompanyReadAcl(
      parsed.data.objectPath,
      String(req.userId!),
      String(req.companyId!),
    );
  } catch (err) {
    req.log.warn({ err }, "Rejected photo with invalid or already-owned object path");
    res.status(400).json({ error: "Invalid photo reference" });
    return;
  }

  const [photo] = await db
    .insert(dailyReportPhotosTable)
    .values({
      reportId,
      objectPath: parsed.data.objectPath,
      caption: parsed.data.caption ?? null,
    })
    .returning();

  res.status(201).json(photo);
}))

// DELETE /projects/:projectId/daily-reports/:reportId/photos/:photoId
router.delete("/:photoId", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewPhotos"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);
  const photoId = parseInt(req.params.photoId as string);
  if (isNaN(reportId) || isNaN(photoId) || isNaN(projectId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const report = await verifyReportAccess(reportId, projectId, req.companyId!);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  await db
    .delete(dailyReportPhotosTable)
    .where(
      and(
        eq(dailyReportPhotosTable.id, photoId),
        eq(dailyReportPhotosTable.reportId, reportId),
      ),
    );

  res.status(204).send();
}))

export default router;
