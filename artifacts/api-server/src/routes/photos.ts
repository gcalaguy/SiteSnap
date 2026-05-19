import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyReportPhotosTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { z } from "zod";

const router = Router({ mergeParams: true });

const AddPhotoBody = z.object({
  objectPath: z.string().min(1),
  caption: z.string().optional(),
});

// GET /projects/:projectId/daily-reports/:reportId/photos
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const reportId = parseInt(req.params.reportId as string);
  if (isNaN(reportId)) {
    res.status(400).json({ error: "Invalid reportId" });
    return;
  }

  const photos = await db
    .select()
    .from(dailyReportPhotosTable)
    .where(eq(dailyReportPhotosTable.reportId, reportId))
    .orderBy(dailyReportPhotosTable.uploadedAt);

  res.json(photos);
});

// POST /projects/:projectId/daily-reports/:reportId/photos
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const reportId = parseInt(req.params.reportId as string);
  if (isNaN(reportId)) {
    res.status(400).json({ error: "Invalid reportId" });
    return;
  }

  const parsed = AddPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
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
});

// DELETE /projects/:projectId/daily-reports/:reportId/photos/:photoId
router.delete("/:photoId", requireAuth, requireCompany, async (req, res) => {
  const reportId = parseInt(req.params.reportId as string);
  const photoId = parseInt(req.params.photoId as string);
  if (isNaN(reportId) || isNaN(photoId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  await db
    .delete(dailyReportPhotosTable)
    .where(
      and(
        eq(dailyReportPhotosTable.id, photoId),
        eq(dailyReportPhotosTable.reportId, reportId),
      ),
    );

  res.status(204).send();
});

export default router;
