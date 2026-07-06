import { Router } from "express";
import { eq, and, desc, gte, lte, or, ilike, sql } from "drizzle-orm";
import {
  db,
  inventoryAssetsTable,
  assetSchedulesTable,
  inventoryMaterialsTable,
  toolCheckoutsTable,
  projectsTable,
  usersTable,
  contactsTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { asyncHandler } from "../lib/asyncHandler";
import { z } from "zod";

const router = Router();
router.use(requireFeature("INVENTORY"));

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const AssetBody = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["fleet", "heavy_equipment", "small_tool"]),
  assetType: z.string().max(50).optional().default("other"),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.string().max(4).optional(),
  serialNumber: z.string().max(100).optional(),
  status: z.enum(["available", "in_use", "maintenance", "retired"]).optional().default("available"),
  photoUrl: z.string().max(1000).optional(),
  dailyCost: z.number().min(0).optional(),
  lastKnownLat: z.number().min(-90).max(90).optional(),
  lastKnownLng: z.number().min(-180).max(180).optional(),
  notes: z.string().max(2000).optional(),
});

const ScheduleBody = z.object({
  assetId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  assignedToUserId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#D4AF37"),
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional().default("scheduled"),
});

const MaterialBody = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["lumber", "concrete", "gravel", "safety_gear", "hardware", "plumbing", "electrical", "other"]),
  unit: z.enum(["bags", "cubic_yards", "board_feet", "each", "lbs", "gallons", "boxes", "rolls", "sheets"]),
  quantityOnHand: z.number().min(0).optional().default(0),
  reorderThreshold: z.number().min(0).optional(),
  reorderQty: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const CheckoutBody = z.object({
  assetId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  checkedOutToUserId: z.number().int().positive().optional(),
  checkedOutToContactId: z.number().int().positive().optional(),
  checkedOutToName: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  expectedReturnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePage(raw: unknown) {
  const n = parseInt(String(raw ?? "1"), 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

function parseLimit(raw: unknown, max = 100) {
  const n = parseInt(String(raw ?? "50"), 10);
  return isNaN(n) || n < 1 ? 50 : Math.min(n, max);
}

function stockStatus(qty: string | null, threshold: string | null): "in_stock" | "low_stock" | "out_of_stock" {
  const q = parseFloat(qty ?? "0");
  if (q <= 0) return "out_of_stock";
  if (threshold !== null) {
    const t = parseFloat(threshold);
    if (q <= t) return "low_stock";
  }
  return "in_stock";
}

// ─── Assets ───────────────────────────────────────────────────────────────────

// GET /inventory/assets
router.get("/inventory/assets", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [
    eq(inventoryAssetsTable.companyId, companyId) as any,
  ];

  if (category && ["fleet", "heavy_equipment", "small_tool"].includes(category)) {
    conditions.push(eq(inventoryAssetsTable.category, category) as any);
  }

  let baseQuery = db
    .select()
    .from(inventoryAssetsTable)
    .where(
      search
        ? and(
            and(...conditions),
            or(
              ilike(inventoryAssetsTable.name, `%${search}%`),
              ilike(inventoryAssetsTable.serialNumber, `%${search}%`),
            ),
          )
        : and(...conditions),
    )
    .$dynamic();

  const [rows, countResult] = await Promise.all([
    baseQuery
      .orderBy(inventoryAssetsTable.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryAssetsTable)
      .where(
        search
          ? and(
              and(...conditions),
              or(
                ilike(inventoryAssetsTable.name, `%${search}%`),
                ilike(inventoryAssetsTable.serialNumber, `%${search}%`),
              ),
            )
          : and(...conditions),
      ),
  ]);

  res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
}));

// POST /inventory/assets
router.post("/inventory/assets", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const parsed = AssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { dailyCost, lastKnownLat, lastKnownLng, ...rest } = parsed.data;
  const [asset] = await db
    .insert(inventoryAssetsTable)
    .values({
      companyId: req.companyId!,
      ...rest,
      dailyCost: dailyCost != null ? String(dailyCost) : undefined,
      lastKnownLat: lastKnownLat != null ? String(lastKnownLat) : undefined,
      lastKnownLng: lastKnownLng != null ? String(lastKnownLng) : undefined,
    })
    .returning();
  res.status(201).json(asset);
}));

// PATCH /inventory/assets/:id
router.patch("/inventory/assets/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const existing = await db
    .select()
    .from(inventoryAssetsTable)
    .where(and(eq(inventoryAssetsTable.id, id), eq(inventoryAssetsTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing[0]) { res.status(404).json({ error: "Asset not found" }); return; }

  const parsed = AssetBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { dailyCost, lastKnownLat, lastKnownLng, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (dailyCost != null) updates.dailyCost = String(dailyCost);
  if (lastKnownLat != null) updates.lastKnownLat = String(lastKnownLat);
  if (lastKnownLng != null) updates.lastKnownLng = String(lastKnownLng);

  const [updated] = await db
    .update(inventoryAssetsTable)
    .set(updates)
    .where(eq(inventoryAssetsTable.id, id))
    .returning();
  res.json(updated);
}));

// DELETE /inventory/assets/:id
router.delete("/inventory/assets/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(inventoryAssetsTable)
    .where(and(eq(inventoryAssetsTable.id, id), eq(inventoryAssetsTable.companyId, req.companyId!)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json({ ok: true });
}));

// ─── Asset Schedules (Dispatch Board) ────────────────────────────────────────

// GET /inventory/schedules?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/inventory/schedules", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

  const conditions = [eq(assetSchedulesTable.companyId, companyId)];
  // Overlapping date range: schedule.startDate <= endDate AND schedule.endDate >= startDate
  if (startDate) conditions.push(lte(assetSchedulesTable.startDate, endDate ?? "9999-12-31") as any);
  if (endDate) conditions.push(gte(assetSchedulesTable.endDate, startDate ?? "0001-01-01") as any);

  const rows = await db
    .select({
      id: assetSchedulesTable.id,
      assetId: assetSchedulesTable.assetId,
      assetName: inventoryAssetsTable.name,
      assetCategory: inventoryAssetsTable.category,
      assetType: inventoryAssetsTable.assetType,
      projectId: assetSchedulesTable.projectId,
      projectName: projectsTable.name,
      assignedToUserId: assetSchedulesTable.assignedToUserId,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      startDate: assetSchedulesTable.startDate,
      endDate: assetSchedulesTable.endDate,
      notes: assetSchedulesTable.notes,
      color: assetSchedulesTable.color,
      status: assetSchedulesTable.status,
      createdAt: assetSchedulesTable.createdAt,
    })
    .from(assetSchedulesTable)
    .leftJoin(inventoryAssetsTable, eq(assetSchedulesTable.assetId, inventoryAssetsTable.id))
    .leftJoin(projectsTable, eq(assetSchedulesTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(assetSchedulesTable.assignedToUserId, usersTable.id))
    .where(and(...conditions))
    .orderBy(assetSchedulesTable.startDate);

  res.json(rows);
}));

// POST /inventory/schedules
router.post("/inventory/schedules", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const parsed = ScheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Verify asset belongs to this company
  const [asset] = await db
    .select({ id: inventoryAssetsTable.id })
    .from(inventoryAssetsTable)
    .where(and(
      eq(inventoryAssetsTable.id, parsed.data.assetId),
      eq(inventoryAssetsTable.companyId, req.companyId!),
    ))
    .limit(1);
  if (!asset) { res.status(400).json({ error: "Asset not found" }); return; }

  const [schedule] = await db
    .insert(assetSchedulesTable)
    .values({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      ...parsed.data,
    })
    .returning();
  res.status(201).json(schedule);
}));

// PATCH /inventory/schedules/:id
router.patch("/inventory/schedules/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(assetSchedulesTable)
    .where(and(eq(assetSchedulesTable.id, id), eq(assetSchedulesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

  const parsed = ScheduleBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [updated] = await db
    .update(assetSchedulesTable)
    .set(parsed.data)
    .where(eq(assetSchedulesTable.id, id))
    .returning();
  res.json(updated);
}));

// DELETE /inventory/schedules/:id
router.delete("/inventory/schedules/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(assetSchedulesTable)
    .where(and(eq(assetSchedulesTable.id, id), eq(assetSchedulesTable.companyId, req.companyId!)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Schedule not found" }); return; }
  res.json({ ok: true });
}));

// ─── Materials ────────────────────────────────────────────────────────────────

// GET /inventory/materials?category=lumber&search=
router.get("/inventory/materials", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);
  const offset = (page - 1) * limit;

  const VALID_CATEGORIES = ["lumber", "concrete", "gravel", "safety_gear", "hardware", "plumbing", "electrical", "other"];

  const baseConditions: any[] = [eq(inventoryMaterialsTable.companyId, companyId)];
  if (category && VALID_CATEGORIES.includes(category)) {
    baseConditions.push(eq(inventoryMaterialsTable.category, category));
  }

  const whereClause = search
    ? and(...baseConditions, ilike(inventoryMaterialsTable.name, `%${search}%`))
    : and(...baseConditions);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(inventoryMaterialsTable)
      .where(whereClause)
      .orderBy(inventoryMaterialsTable.category, inventoryMaterialsTable.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryMaterialsTable)
      .where(whereClause),
  ]);

  // Compute derived stockStatus server-side
  const enriched = rows.map((r) => ({
    ...r,
    stockStatus: stockStatus(r.quantityOnHand, r.reorderThreshold),
  }));

  res.json({ data: enriched, total: countResult[0]?.count ?? 0, page, limit });
}));

// POST /inventory/materials
router.post("/inventory/materials", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const parsed = MaterialBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { quantityOnHand, reorderThreshold, reorderQty, unitCost, ...rest } = parsed.data;
  const [material] = await db
    .insert(inventoryMaterialsTable)
    .values({
      companyId: req.companyId!,
      ...rest,
      quantityOnHand: String(quantityOnHand ?? 0),
      reorderThreshold: reorderThreshold != null ? String(reorderThreshold) : undefined,
      reorderQty: reorderQty != null ? String(reorderQty) : undefined,
      unitCost: unitCost != null ? String(unitCost) : undefined,
    })
    .returning();
  res.status(201).json({ ...material, stockStatus: stockStatus(material.quantityOnHand, material.reorderThreshold) });
}));

// PATCH /inventory/materials/:id
router.patch("/inventory/materials/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(inventoryMaterialsTable)
    .where(and(eq(inventoryMaterialsTable.id, id), eq(inventoryMaterialsTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Material not found" }); return; }

  const parsed = MaterialBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { quantityOnHand, reorderThreshold, reorderQty, unitCost, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (quantityOnHand != null) updates.quantityOnHand = String(quantityOnHand);
  if (reorderThreshold != null) updates.reorderThreshold = String(reorderThreshold);
  if (reorderQty != null) updates.reorderQty = String(reorderQty);
  if (unitCost != null) updates.unitCost = String(unitCost);

  const [updated] = await db
    .update(inventoryMaterialsTable)
    .set(updates)
    .where(eq(inventoryMaterialsTable.id, id))
    .returning();
  res.json({ ...updated, stockStatus: stockStatus(updated.quantityOnHand, updated.reorderThreshold) });
}));

// DELETE /inventory/materials/:id
router.delete("/inventory/materials/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(inventoryMaterialsTable)
    .where(and(eq(inventoryMaterialsTable.id, id), eq(inventoryMaterialsTable.companyId, req.companyId!)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Material not found" }); return; }
  res.json({ ok: true });
}));

// ─── Tool Checkouts ───────────────────────────────────────────────────────────

// GET /inventory/tool-checkouts?status=checked_out
router.get("/inventory/tool-checkouts", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const status = typeof req.query.status === "string" ? req.query.status : "checked_out";

  const rows = await db
    .select({
      id: toolCheckoutsTable.id,
      assetId: toolCheckoutsTable.assetId,
      assetName: inventoryAssetsTable.name,
      assetType: inventoryAssetsTable.assetType,
      assetPhotoUrl: inventoryAssetsTable.photoUrl,
      projectId: toolCheckoutsTable.projectId,
      projectName: projectsTable.name,
      checkedOutToUserId: toolCheckoutsTable.checkedOutToUserId,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      checkedOutToContactId: toolCheckoutsTable.checkedOutToContactId,
      contactName: contactsTable.name,
      checkedOutToName: toolCheckoutsTable.checkedOutToName,
      status: toolCheckoutsTable.status,
      notes: toolCheckoutsTable.notes,
      checkedOutAt: toolCheckoutsTable.checkedOutAt,
      expectedReturnDate: toolCheckoutsTable.expectedReturnDate,
      returnedAt: toolCheckoutsTable.returnedAt,
    })
    .from(toolCheckoutsTable)
    .leftJoin(inventoryAssetsTable, eq(toolCheckoutsTable.assetId, inventoryAssetsTable.id))
    .leftJoin(usersTable, eq(toolCheckoutsTable.checkedOutToUserId, usersTable.id))
    .leftJoin(contactsTable, eq(toolCheckoutsTable.checkedOutToContactId, contactsTable.id))
    .leftJoin(projectsTable, eq(toolCheckoutsTable.projectId, projectsTable.id))
    .where(and(
      eq(toolCheckoutsTable.companyId, companyId),
      status === "all"
        ? undefined
        : eq(toolCheckoutsTable.status, status),
    ) as any)
    .orderBy(desc(toolCheckoutsTable.checkedOutAt));

  res.json(rows);
}));

// POST /inventory/tool-checkouts  (check a tool out)
router.post("/inventory/tool-checkouts", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const parsed = CheckoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Ensure asset belongs to this company
  const [asset] = await db
    .select({ id: inventoryAssetsTable.id, category: inventoryAssetsTable.category })
    .from(inventoryAssetsTable)
    .where(and(
      eq(inventoryAssetsTable.id, parsed.data.assetId),
      eq(inventoryAssetsTable.companyId, req.companyId!),
    ))
    .limit(1);
  if (!asset) { res.status(400).json({ error: "Asset not found" }); return; }
  if (asset.category !== "small_tool") { res.status(400).json({ error: "Only small_tool assets can be checked out" }); return; }

  // Update asset status to in_use
  await db
    .update(inventoryAssetsTable)
    .set({ status: "in_use", updatedAt: new Date() })
    .where(eq(inventoryAssetsTable.id, asset.id));

  const [checkout] = await db
    .insert(toolCheckoutsTable)
    .values({
      companyId: req.companyId!,
      checkedOutByUserId: req.userId!,
      ...parsed.data,
    })
    .returning();
  res.status(201).json(checkout);
}));

// PATCH /inventory/tool-checkouts/:id/return  (return a tool)
router.patch("/inventory/tool-checkouts/:id/return", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [checkout] = await db
    .select()
    .from(toolCheckoutsTable)
    .where(and(eq(toolCheckoutsTable.id, id), eq(toolCheckoutsTable.companyId, req.companyId!)))
    .limit(1);
  if (!checkout) { res.status(404).json({ error: "Checkout not found" }); return; }
  if (checkout.status === "returned") { res.status(400).json({ error: "Already returned" }); return; }

  const [updated] = await db
    .update(toolCheckoutsTable)
    .set({ status: "returned", returnedAt: new Date(), returnedByUserId: req.userId! })
    .where(eq(toolCheckoutsTable.id, id))
    .returning();

  // Mark asset back as available
  await db
    .update(inventoryAssetsTable)
    .set({ status: "available", updatedAt: new Date() })
    .where(eq(inventoryAssetsTable.id, checkout.assetId));

  res.json(updated);
}));

// DELETE /inventory/tool-checkouts/:id
router.delete("/inventory/tool-checkouts/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(toolCheckoutsTable)
    .where(and(eq(toolCheckoutsTable.id, id), eq(toolCheckoutsTable.companyId, req.companyId!)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Checkout record not found" }); return; }
  res.json({ ok: true });
}));

// ─── Summary ──────────────────────────────────────────────────────────────────

// GET /inventory/summary — dashboard counts for sidebar badge
router.get("/inventory/summary", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;

  const [assetCounts, materialRows, activeCheckouts] = await Promise.all([
    db
      .select({
        category: inventoryAssetsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(inventoryAssetsTable)
      .where(eq(inventoryAssetsTable.companyId, companyId))
      .groupBy(inventoryAssetsTable.category),
    db
      .select({
        quantityOnHand: inventoryMaterialsTable.quantityOnHand,
        reorderThreshold: inventoryMaterialsTable.reorderThreshold,
      })
      .from(inventoryMaterialsTable)
      .where(eq(inventoryMaterialsTable.companyId, companyId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(toolCheckoutsTable)
      .where(and(
        eq(toolCheckoutsTable.companyId, companyId),
        eq(toolCheckoutsTable.status, "checked_out"),
      )),
  ]);

  const fleet = assetCounts.find((r) => r.category === "fleet")?.count ?? 0;
  const heavy = assetCounts.find((r) => r.category === "heavy_equipment")?.count ?? 0;
  const tools = assetCounts.find((r) => r.category === "small_tool")?.count ?? 0;
  const lowStock = materialRows.filter((r) => stockStatus(r.quantityOnHand, r.reorderThreshold) === "low_stock").length;
  const outOfStock = materialRows.filter((r) => stockStatus(r.quantityOnHand, r.reorderThreshold) === "out_of_stock").length;

  res.json({
    totalAssets: fleet + heavy + tools,
    fleetCount: fleet,
    heavyEquipmentCount: heavy,
    smallToolCount: tools,
    materialAlerts: lowStock + outOfStock,
    lowStock,
    outOfStock,
    activeCheckouts: activeCheckouts[0]?.count ?? 0,
  });
}));

export default router;
