import { Router } from "express";
import { z } from "zod/v4";
import { db, costAnalysesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { assertProjectInCompany as verifyProjectAccess } from "../lib/projectAccess";
import { CreateCostAnalysisBody } from "@workspace/api-zod";

const UpdateCostAnalysisBody = z.object({
  periodLabel: z.string().min(1).optional(),
  labourCost: z.number().nonnegative().optional(),
  materialsCost: z.number().nonnegative().optional(),
  equipmentCost: z.number().nonnegative().optional(),
  otherCost: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  aiAnalysis: z.string().nullable().optional(),
});

const router = Router({ mergeParams: true });

// GET /projects/:projectId/cost-analyses
router.get("/", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const analyses = await db
    .select()
    .from(costAnalysesTable)
    .where(eq(costAnalysesTable.projectId, projectId));

  res.json(analyses);
}))

// POST /projects/:projectId/cost-analyses
router.post("/", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = CreateCostAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const { labourCost, materialsCost, equipmentCost, otherCost } = parsed.data;
  const totalCost = labourCost + materialsCost + equipmentCost + otherCost;

  const [analysis] = await db
    .insert(costAnalysesTable)
    .values({
      ...parsed.data,
      projectId,
      labourCost: labourCost.toString(),
      materialsCost: materialsCost.toString(),
      equipmentCost: equipmentCost.toString(),
      otherCost: otherCost.toString(),
      totalCost: totalCost.toString(),
    })
    .returning();

  res.status(201).json(analysis);
}))

// PUT /projects/:projectId/cost-analyses/:analysisId
router.put("/:analysisId", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const analysisId = parseInt(req.params.analysisId as string);
  const parsed = UpdateCostAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Fetch current values so we can recalculate totalCost even on partial updates
  const [existing] = await db
    .select()
    .from(costAnalysesTable)
    .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Cost analysis not found" }); return; }

  const labourCost = parsed.data.labourCost ?? parseFloat(existing.labourCost);
  const materialsCost = parsed.data.materialsCost ?? parseFloat(existing.materialsCost);
  const equipmentCost = parsed.data.equipmentCost ?? parseFloat(existing.equipmentCost);
  const otherCost = parsed.data.otherCost ?? parseFloat(existing.otherCost);
  const recalculatedTotal = labourCost + materialsCost + equipmentCost + otherCost;

  const updateData: Record<string, unknown> = { ...parsed.data };
  updateData.labourCost = labourCost.toString();
  updateData.materialsCost = materialsCost.toString();
  updateData.equipmentCost = equipmentCost.toString();
  updateData.otherCost = otherCost.toString();
  updateData.totalCost = recalculatedTotal.toString();

  const [analysis] = await db
    .update(costAnalysesTable)
    .set(updateData)
    .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)))
    .returning();
  if (!analysis) { res.status(404).json({ error: "Cost analysis not found" }); return; }
  res.json(analysis);
}))

// DELETE /projects/:projectId/cost-analyses/:analysisId
router.delete("/:analysisId", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const analysisId = parseInt(req.params.analysisId as string);
  await db
    .delete(costAnalysesTable)
    .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)));
  res.json({ ok: true });
}))

// GET /projects/:projectId/cost-analyses/:analysisId
router.get("/:analysisId", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const analysisId = parseInt(req.params.analysisId as string);

  const [analysis] = await db
    .select()
    .from(costAnalysesTable)
    .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)))
    .limit(1);

  if (!analysis) { res.status(404).json({ error: "Cost analysis not found" }); return; }
  res.json(analysis);
}))

export default router;
