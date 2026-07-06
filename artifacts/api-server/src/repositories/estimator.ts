import {
  db,
  estimatorCostModelsTable,
  estimatorAddonsTable,
  estimatorActualsTable,
  estimatesTable,
  quotesTable,
  companiesTable,
  type EstimatorCostModel,
  type EstimatorAddon,
} from "@workspace/db";
import { eq, and, desc, count, inArray, sql, isNull } from "drizzle-orm";

// ── Cost Models ────────────────────────────────────────────────────────────────

export async function listCostModelsForCompany(companyId: number): Promise<EstimatorCostModel[]> {
  return db
    .select()
    .from(estimatorCostModelsTable)
    .where(eq(estimatorCostModelsTable.companyId, companyId))
    .orderBy(estimatorCostModelsTable.projectType, estimatorCostModelsTable.finishLevel);
}

export async function getCompanyEstimatorConfig(companyId: number): Promise<unknown | null> {
  const [company] = await db
    .select({ estimatorConfig: companiesTable.estimatorConfig })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return company?.estimatorConfig ?? null;
}

export interface CostModelInput {
  projectType: string;
  finishLevel: "basic" | "standard" | "premium" | "luxury";
  name: string;
  baseCostPerSqft: string;
  laborCostPerSqft: string;
  materialCostPerSqft: string;
  overheadPct: string;
  contingencyPct: string;
  notes: string | null;
}

export async function insertCostModel(
  companyId: number,
  data: CostModelInput,
): Promise<EstimatorCostModel> {
  const [model] = await db
    .insert(estimatorCostModelsTable)
    .values({ ...data, companyId, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return model;
}

export async function insertImportedCostModel(
  companyId: number,
  data: CostModelInput & { sourceType: "manual" | "quote" | "invoice"; sourceId: string | null },
): Promise<EstimatorCostModel> {
  const [model] = await db
    .insert(estimatorCostModelsTable)
    .values({ ...data, companyId, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return model;
}

export async function updateCostModel(
  id: number,
  companyId: number,
  data: Record<string, unknown>,
): Promise<EstimatorCostModel | null> {
  const [model] = await db
    .update(estimatorCostModelsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(estimatorCostModelsTable.id, id), eq(estimatorCostModelsTable.companyId, companyId)))
    .returning();
  return model ?? null;
}

export async function deleteCostModel(id: number, companyId: number): Promise<number | null> {
  const [deleted] = await db
    .delete(estimatorCostModelsTable)
    .where(and(eq(estimatorCostModelsTable.id, id), eq(estimatorCostModelsTable.companyId, companyId)))
    .returning({ id: estimatorCostModelsTable.id });
  return deleted?.id ?? null;
}

// Count saved smart/scan estimates that reference a given cost model
export async function countCostModelReferences(modelId: number, companyId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(estimatesTable)
    .where(
      and(
        eq(estimatesTable.companyId, companyId),
        inArray(estimatesTable.sourceType, ["smart", "scan"]),
        sql`${estimatesTable.result}::jsonb->'costModelUsed'->>'id' = ${String(modelId)}`
      )
    );
  return rows[0]?.count ?? 0;
}

export async function getCostModelByTypeAndFinish(
  companyId: number,
  projectType: string,
  finishLevel: string,
): Promise<EstimatorCostModel | null> {
  const [costModel] = await db
    .select()
    .from(estimatorCostModelsTable)
    .where(
      and(
        eq(estimatorCostModelsTable.companyId, companyId),
        eq(estimatorCostModelsTable.projectType, projectType),
        eq(estimatorCostModelsTable.finishLevel, finishLevel),
      ),
    )
    .limit(1);
  return costModel ?? null;
}

// ── Add-ons ──────────────────────────────────────────────────────────────────

export async function listAddonsForCompany(companyId: number): Promise<EstimatorAddon[]> {
  return db.select().from(estimatorAddonsTable).where(eq(estimatorAddonsTable.companyId, companyId));
}

export interface AddonInput {
  name: string;
  addonKey: string;
  description: string | null;
  costType: "flat" | "per_sqft";
  amount: string;
  applicableTypes: string | null;
}

export async function insertAddon(companyId: number, data: AddonInput): Promise<EstimatorAddon> {
  const [addon] = await db
    .insert(estimatorAddonsTable)
    .values({ ...data, companyId, createdAt: new Date() })
    .returning();
  return addon;
}

export async function updateAddon(
  id: number,
  companyId: number,
  data: Record<string, unknown>,
): Promise<EstimatorAddon | null> {
  const [addon] = await db
    .update(estimatorAddonsTable)
    .set(data)
    .where(and(eq(estimatorAddonsTable.id, id), eq(estimatorAddonsTable.companyId, companyId)))
    .returning();
  return addon ?? null;
}

export async function deleteAddon(id: number, companyId: number): Promise<boolean> {
  const [deleted] = await db
    .delete(estimatorAddonsTable)
    .where(and(eq(estimatorAddonsTable.id, id), eq(estimatorAddonsTable.companyId, companyId)))
    .returning({ id: estimatorAddonsTable.id });
  return !!deleted;
}

// Count saved smart/scan estimates that reference a given add-on
export async function countAddonReferences(addonId: number, companyId: number): Promise<number> {
  const [addon] = await db
    .select({ addonKey: estimatorAddonsTable.addonKey })
    .from(estimatorAddonsTable)
    .where(eq(estimatorAddonsTable.id, addonId))
    .limit(1);
  if (!addon) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(estimatesTable)
    .where(
      and(
        eq(estimatesTable.companyId, companyId),
        inArray(estimatesTable.sourceType, ["smart", "scan"]),
        sql`${estimatesTable.result}::jsonb->'_params'->'addons' @> ${JSON.stringify([addon.addonKey])}::jsonb`
      )
    );
  return rows[0]?.count ?? 0;
}

export async function getAddonsByKeysForCompany(
  companyId: number,
  keys: string[],
): Promise<EstimatorAddon[]> {
  if (keys.length === 0) return [];
  const all = await db.select().from(estimatorAddonsTable).where(eq(estimatorAddonsTable.companyId, companyId));
  return all.filter((a) => keys.includes(a.addonKey));
}

// ── Smart Estimates ────────────────────────────────────────────────────────────

export interface InsertEstimateInput {
  companyId: number;
  createdByUserId: number;
  title: string;
  scopeText: string | null;
  sourceType: "smart";
  status: "ready";
  result: Record<string, unknown>;
}

export async function insertEstimate(data: InsertEstimateInput) {
  const [estimate] = await db.insert(estimatesTable).values(data).returning();
  return estimate;
}

export async function listSmartEstimatesForCompany(companyId: number) {
  return db
    .select({
      id: estimatesTable.id,
      companyId: estimatesTable.companyId,
      createdByUserId: estimatesTable.createdByUserId,
      title: estimatesTable.title,
      scopeText: estimatesTable.scopeText,
      sourceType: estimatesTable.sourceType,
      sourceFilename: estimatesTable.sourceFilename,
      result: estimatesTable.result,
      status: estimatesTable.status,
      createdAt: estimatesTable.createdAt,
      updatedAt: estimatesTable.updatedAt,
    })
    .from(estimatesTable)
    .where(
      and(
        eq(estimatesTable.companyId, companyId),
        inArray(estimatesTable.sourceType, ["smart", "scan"]),
      ),
    )
    .orderBy(desc(estimatesTable.createdAt));
}

export async function getEstimateById(id: number, companyId: number) {
  const [estimate] = await db
    .select()
    .from(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.companyId, companyId)))
    .limit(1);
  return estimate ?? null;
}

// ── Actuals ────────────────────────────────────────────────────────────────────

export interface InsertActualInput {
  estimateId: number;
  companyId: number;
  estimatedCost: string;
  actualCost: string;
  variancePct: string;
  notes: string | null;
  recordedAt: Date;
}

export async function insertActual(data: InsertActualInput) {
  const [actual] = await db.insert(estimatorActualsTable).values(data).returning();
  return actual;
}

export async function listActualsForCompany(companyId: number) {
  return db
    .select()
    .from(estimatorActualsTable)
    .where(eq(estimatorActualsTable.companyId, companyId))
    .orderBy(desc(estimatorActualsTable.recordedAt));
}

// ── Quotes (estimator → quote conversion) ─────────────────────────────────────

export async function countQuotesForCompany(companyId: number): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(quotesTable)
    .where(eq(quotesTable.companyId, companyId));
  return result?.count ?? 0;
}

export interface InsertQuoteInput {
  companyId: number;
  projectId: null;
  quoteNumber: string;
  title: string;
  clientName: string;
  clientEmail: string | null;
  clientCompanyName: null;
  clientAddress: null;
  clientPhone: null;
  voiceInput: string | null;
  notes: string;
  lineItems: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  validUntil: null;
  createdByUserId: number;
  status: "draft";
  publicToken: string;
}

export async function insertQuote(data: InsertQuoteInput) {
  const [quote] = await db.insert(quotesTable).values(data).returning();
  return quote;
}

// ── Seed provisioning (used once globally, then cloned per company) ──────────

export async function hasGlobalCostModelTemplates(): Promise<boolean> {
  const rows = await db
    .select({ id: estimatorCostModelsTable.id })
    .from(estimatorCostModelsTable)
    .where(isNull(estimatorCostModelsTable.companyId))
    .limit(1);
  return rows.length > 0;
}

export async function insertGlobalCostModelTemplates(
  models: Omit<EstimatorCostModel, "id" | "createdAt" | "updatedAt" | "companyId" | "sourceType" | "sourceId">[],
): Promise<void> {
  await db.insert(estimatorCostModelsTable).values(
    models.map((m) => ({ ...m, companyId: null, sourceType: "manual" as const, sourceId: null, createdAt: new Date(), updatedAt: new Date() })),
  );
}

export async function hasGlobalAddonTemplates(): Promise<boolean> {
  const rows = await db
    .select({ id: estimatorAddonsTable.id })
    .from(estimatorAddonsTable)
    .where(isNull(estimatorAddonsTable.companyId))
    .limit(1);
  return rows.length > 0;
}

export async function insertGlobalAddonTemplates(
  addons: Omit<EstimatorAddon, "id" | "createdAt" | "companyId">[],
): Promise<void> {
  await db.insert(estimatorAddonsTable).values(
    addons.map((a) => ({ ...a, companyId: null, createdAt: new Date() })),
  );
}

export async function hasCompanyCostModels(companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: estimatorCostModelsTable.id })
    .from(estimatorCostModelsTable)
    .where(eq(estimatorCostModelsTable.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}

export async function getAllGlobalCostModelTemplates(): Promise<EstimatorCostModel[]> {
  return db.select().from(estimatorCostModelsTable).where(isNull(estimatorCostModelsTable.companyId));
}

export async function insertCompanyCostModels(companyId: number, templates: EstimatorCostModel[]): Promise<void> {
  if (!templates.length) return;
  await db.insert(estimatorCostModelsTable).values(
    templates.map((t) => ({
      companyId,
      projectType: t.projectType,
      finishLevel: t.finishLevel,
      name: t.name,
      baseCostPerSqft: t.baseCostPerSqft,
      laborCostPerSqft: t.laborCostPerSqft,
      materialCostPerSqft: t.materialCostPerSqft,
      overheadPct: t.overheadPct,
      contingencyPct: t.contingencyPct,
      notes: t.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

export async function hasCompanyAddons(companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: estimatorAddonsTable.id })
    .from(estimatorAddonsTable)
    .where(eq(estimatorAddonsTable.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}

export async function getAllGlobalAddonTemplates(): Promise<EstimatorAddon[]> {
  return db.select().from(estimatorAddonsTable).where(isNull(estimatorAddonsTable.companyId));
}

export async function insertCompanyAddons(companyId: number, templates: EstimatorAddon[]): Promise<void> {
  if (!templates.length) return;
  await db.insert(estimatorAddonsTable).values(
    templates.map((a) => ({
      companyId,
      name: a.name,
      addonKey: a.addonKey,
      description: a.description,
      costType: a.costType,
      amount: a.amount,
      applicableTypes: a.applicableTypes,
      createdAt: new Date(),
    })),
  );
}
