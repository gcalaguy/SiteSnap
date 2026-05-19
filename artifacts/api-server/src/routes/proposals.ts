import { Router } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import {
  db,
  builderEstimatesTable,
  builderEstimateItemsTable,
  estimateTemplatesTable,
  estimateTemplateItemsTable,
  proposalsTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";

import { z } from "zod";

const router = Router();
router.use(requireFeature("Proposals"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ItemShape = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().default(1),
  unitCost: z.coerce.number().min(0).default(0),
  margin: z.coerce.number().min(0).max(100).default(0),
  sortOrder: z.coerce.number().int().optional().default(0),
});

async function getEstimateWithItems(estimateId: number, companyId: number) {
  const [estimate] = await db
    .select()
    .from(builderEstimatesTable)
    .where(
      and(
        eq(builderEstimatesTable.id, estimateId),
        eq(builderEstimatesTable.companyId, companyId),
      ),
    );
  if (!estimate) return null;

  const items = await db
    .select()
    .from(builderEstimateItemsTable)
    .where(eq(builderEstimateItemsTable.estimateId, estimateId))
    .orderBy(asc(builderEstimateItemsTable.sortOrder), asc(builderEstimateItemsTable.id));

  return { ...estimate, items };
}

// ─── Builder Estimates CRUD ───────────────────────────────────────────────────

// GET /builder-estimates
router.get("/builder-estimates", requireAuth, requireCompany, async (req, res) => {
  const estimates = await db
    .select()
    .from(builderEstimatesTable)
    .where(eq(builderEstimatesTable.companyId, req.companyId!))
    .orderBy(desc(builderEstimatesTable.createdAt));
  res.json(estimates);
});

// GET /builder-estimates/:id
router.get("/builder-estimates/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = await getEstimateWithItems(id, req.companyId!);
  if (!data) { res.status(404).json({ error: "Not found" }); return; }
  res.json(data);
});

// POST /builder-estimates
router.post("/builder-estimates", requireAuth, requireCompany, async (req, res) => {
  const Body = z.object({
    title: z.string().min(1),
    projectId: z.coerce.number().int().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
    items: z.array(ItemShape).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { items = [], ...rest } = parsed.data;

  const [estimate] = await db
    .insert(builderEstimatesTable)
    .values({ companyId: req.companyId!, ...rest })
    .returning();

  if (items.length > 0) {
    await db.insert(builderEstimateItemsTable).values(
      items.map((item, i) => ({
        estimateId: estimate.id,
        name: item.name,
        description: item.description ?? null,
        quantity: String(item.quantity),
        unitCost: String(item.unitCost),
        margin: String(item.margin),
        sortOrder: item.sortOrder ?? i,
      })),
    );
  }

  const data = await getEstimateWithItems(estimate.id, req.companyId!);
  res.status(201).json(data);
});

// PATCH /builder-estimates/:id
router.patch("/builder-estimates/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    title: z.string().min(1).optional(),
    projectId: z.coerce.number().int().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [updated] = await db
    .update(builderEstimatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(builderEstimatesTable.id, id), eq(builderEstimatesTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const data = await getEstimateWithItems(id, req.companyId!);
  res.json(data);
});

// DELETE /builder-estimates/:id
router.delete("/builder-estimates/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(builderEstimateItemsTable).where(eq(builderEstimateItemsTable.estimateId, id));
  await db.delete(proposalsTable).where(eq(proposalsTable.builderEstimateId, id));
  const [deleted] = await db
    .delete(builderEstimatesTable)
    .where(and(eq(builderEstimatesTable.id, id), eq(builderEstimatesTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ─── Line Items ───────────────────────────────────────────────────────────────

// POST /builder-estimates/:id/items
router.post("/builder-estimates/:id/items", requireAuth, requireCompany, async (req, res) => {
  const estimateId = parseInt(req.params.id as string);
  if (isNaN(estimateId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [estimate] = await db
    .select({ id: builderEstimatesTable.id })
    .from(builderEstimatesTable)
    .where(and(eq(builderEstimatesTable.id, estimateId), eq(builderEstimatesTable.companyId, req.companyId!)));
  if (!estimate) { res.status(404).json({ error: "Estimate not found" }); return; }

  const parsed = ItemShape.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { quantity, unitCost, margin, sortOrder, ...rest } = parsed.data;
  const [item] = await db
    .insert(builderEstimateItemsTable)
    .values({
      estimateId,
      quantity: String(quantity),
      unitCost: String(unitCost),
      margin: String(margin),
      sortOrder: sortOrder ?? 0,
      ...rest,
    })
    .returning();

  res.status(201).json(item);
});

// PATCH /builder-estimates/:id/items/:itemId
router.patch("/builder-estimates/:id/items/:itemId", requireAuth, requireCompany, async (req, res) => {
  const estimateId = parseInt(req.params.id as string);
  const itemId = parseInt(req.params.itemId as string);
  if (isNaN(estimateId) || isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ItemShape.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.quantity !== undefined) updates.quantity = String(parsed.data.quantity);
  if (parsed.data.unitCost !== undefined) updates.unitCost = String(parsed.data.unitCost);
  if (parsed.data.margin !== undefined) updates.margin = String(parsed.data.margin);
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

  const [item] = await db
    .update(builderEstimateItemsTable)
    .set(updates as any)
    .where(and(eq(builderEstimateItemsTable.id, itemId), eq(builderEstimateItemsTable.estimateId, estimateId)))
    .returning();

  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(item);
});

// DELETE /builder-estimates/:id/items/:itemId
router.delete("/builder-estimates/:id/items/:itemId", requireAuth, requireCompany, async (req, res) => {
  const estimateId = parseInt(req.params.id as string);
  const itemId = parseInt(req.params.itemId as string);
  if (isNaN(estimateId) || isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(builderEstimateItemsTable)
    .where(and(eq(builderEstimateItemsTable.id, itemId), eq(builderEstimateItemsTable.estimateId, estimateId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Item not found" }); return; }
  res.status(204).send();
});

// POST /builder-estimates/:id/convert — create proposal from estimate
router.post("/builder-estimates/:id/convert", requireAuth, requireCompany, async (req, res) => {
  const estimateId = parseInt(req.params.id as string);
  if (isNaN(estimateId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [estimate] = await db
    .select()
    .from(builderEstimatesTable)
    .where(and(eq(builderEstimatesTable.id, estimateId), eq(builderEstimatesTable.companyId, req.companyId!)));
  if (!estimate) { res.status(404).json({ error: "Estimate not found" }); return; }

  const Body = z.object({
    clientName: z.string().optional().nullable(),
    clientEmail: z.string().email().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [proposal] = await db
    .insert(proposalsTable)
    .values({
      companyId: req.companyId!,
      builderEstimateId: estimateId,
      title: estimate.title,
      status: "draft",
      ...parsed.data,
    })
    .returning();

  res.status(201).json(proposal);
});

// ─── Estimate Templates ───────────────────────────────────────────────────────

// GET /estimate-templates
router.get("/estimate-templates", requireAuth, requireCompany, async (req, res) => {
  const templates = await db
    .select()
    .from(estimateTemplatesTable)
    .where(eq(estimateTemplatesTable.companyId, req.companyId!))
    .orderBy(asc(estimateTemplatesTable.name));
  res.json(templates);
});

// POST /estimate-templates — save current estimate as template
router.post("/estimate-templates", requireAuth, requireCompany, async (req, res) => {
  const Body = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    items: z.array(ItemShape).min(1),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { items, ...rest } = parsed.data;

  const [template] = await db
    .insert(estimateTemplatesTable)
    .values({ companyId: req.companyId!, ...rest })
    .returning();

  await db.insert(estimateTemplateItemsTable).values(
    items.map((item, i) => ({
      templateId: template.id,
      name: item.name,
      description: item.description ?? null,
      quantity: String(item.quantity),
      unitCost: String(item.unitCost),
      margin: String(item.margin),
      sortOrder: item.sortOrder ?? i,
    })),
  );

  const templateItems = await db
    .select()
    .from(estimateTemplateItemsTable)
    .where(eq(estimateTemplateItemsTable.templateId, template.id))
    .orderBy(asc(estimateTemplateItemsTable.sortOrder));

  res.status(201).json({ ...template, items: templateItems });
});

// GET /estimate-templates/:id/items
router.get("/estimate-templates/:id/items", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [template] = await db
    .select()
    .from(estimateTemplatesTable)
    .where(and(eq(estimateTemplatesTable.id, id), eq(estimateTemplatesTable.companyId, req.companyId!)));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const items = await db
    .select()
    .from(estimateTemplateItemsTable)
    .where(eq(estimateTemplateItemsTable.templateId, id))
    .orderBy(asc(estimateTemplateItemsTable.sortOrder));

  res.json({ ...template, items });
});

// DELETE /estimate-templates/:id
router.delete("/estimate-templates/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(estimateTemplateItemsTable).where(eq(estimateTemplateItemsTable.templateId, id));
  const [deleted] = await db
    .delete(estimateTemplatesTable)
    .where(and(eq(estimateTemplatesTable.id, id), eq(estimateTemplatesTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ─── Proposals ────────────────────────────────────────────────────────────────

// GET /proposals
router.get("/proposals", requireAuth, requireCompany, async (req, res) => {
  const proposals = await db
    .select()
    .from(proposalsTable)
    .where(eq(proposalsTable.companyId, req.companyId!))
    .orderBy(desc(proposalsTable.createdAt));
  res.json(proposals);
});

// GET /proposals/:id
router.get("/proposals/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [proposal] = await db
    .select()
    .from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.companyId, req.companyId!)));
  if (!proposal) { res.status(404).json({ error: "Not found" }); return; }

  const estimate = await getEstimateWithItems(proposal.builderEstimateId, req.companyId!);
  res.json({ ...proposal, estimate });
});

// PATCH /proposals/:id
router.patch("/proposals/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    title: z.string().min(1).optional(),
    clientName: z.string().optional().nullable(),
    clientEmail: z.string().email().optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [updated] = await db
    .update(proposalsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// POST /proposals/:id/approve — simulate e-signature approval
router.post("/proposals/:id/approve", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    approvedByName: z.string().min(1),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [updated] = await db
    .update(proposalsTable)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedByName: parsed.data.approvedByName,
      updatedAt: new Date(),
    })
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// DELETE /proposals/:id
router.delete("/proposals/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
