import { Router } from "express";
import { db, costAnalysesTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { CreateCostAnalysisBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project;
}

// GET /projects/:projectId/cost-analyses
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const analyses = await db
    .select()
    .from(costAnalysesTable)
    .where(eq(costAnalysesTable.projectId, projectId));

  res.json(analyses);
});

// POST /projects/:projectId/cost-analyses
router.post("/", requireAuth, requireCompany, async (req, res) => {
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
});

// GET /projects/:projectId/cost-analyses/:analysisId
router.get("/:analysisId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const analysisId = parseInt(req.params.analysisId as string);

  const [analysis] = await db
    .select()
    .from(costAnalysesTable)
    .where(and(eq(costAnalysesTable.id, analysisId), eq(costAnalysesTable.projectId, projectId)))
    .limit(1);

  if (!analysis) { res.status(404).json({ error: "Cost analysis not found" }); return; }
  res.json(analysis);
});

export default router;
