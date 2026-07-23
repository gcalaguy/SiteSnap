import { db, costCatalogTable, type CostCatalogItem } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

export interface CostCatalogItemInput {
  category: string;
  itemName: string;
  description: string | null;
  unitType: "sqft" | "linft" | "hour" | "flat" | "unit";
  costPrice: string;
  unitPrice: string;
  defaultMarkupPercent: string;
  projectTypeMultiplier: string | null;
}

export async function listCostCatalogForCompany(companyId: number): Promise<CostCatalogItem[]> {
  return db
    .select()
    .from(costCatalogTable)
    .where(eq(costCatalogTable.companyId, companyId))
    .orderBy(costCatalogTable.category, costCatalogTable.itemName);
}

export async function insertCostCatalogItem(
  companyId: number,
  data: CostCatalogItemInput,
): Promise<CostCatalogItem> {
  const [item] = await db
    .insert(costCatalogTable)
    .values({ ...data, companyId, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return item;
}

export async function insertCostCatalogItems(
  companyId: number,
  items: CostCatalogItemInput[],
): Promise<CostCatalogItem[]> {
  if (!items.length) return [];
  return db
    .insert(costCatalogTable)
    .values(items.map((data) => ({ ...data, companyId, createdAt: new Date(), updatedAt: new Date() })))
    .returning();
}

export async function updateCostCatalogItem(
  id: number,
  companyId: number,
  data: Record<string, unknown>,
): Promise<CostCatalogItem | null> {
  const [item] = await db
    .update(costCatalogTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(costCatalogTable.id, id), eq(costCatalogTable.companyId, companyId)))
    .returning();
  return item ?? null;
}

export async function deleteCostCatalogItem(id: number, companyId: number): Promise<number | null> {
  const [deleted] = await db
    .delete(costCatalogTable)
    .where(and(eq(costCatalogTable.id, id), eq(costCatalogTable.companyId, companyId)))
    .returning({ id: costCatalogTable.id });
  return deleted?.id ?? null;
}

// ── Seed provisioning (used once globally, then cloned per company) ──────────

export async function hasGlobalCostCatalogTemplates(): Promise<boolean> {
  const rows = await db
    .select({ id: costCatalogTable.id })
    .from(costCatalogTable)
    .where(isNull(costCatalogTable.companyId))
    .limit(1);
  return rows.length > 0;
}

export async function insertGlobalCostCatalogTemplates(items: CostCatalogItemInput[]): Promise<void> {
  await db.insert(costCatalogTable).values(
    items.map((item) => ({ ...item, companyId: null, createdAt: new Date(), updatedAt: new Date() })),
  );
}

export async function hasCompanyCostCatalog(companyId: number): Promise<boolean> {
  const rows = await db
    .select({ id: costCatalogTable.id })
    .from(costCatalogTable)
    .where(eq(costCatalogTable.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}

export async function getAllGlobalCostCatalogTemplates(): Promise<CostCatalogItem[]> {
  return db.select().from(costCatalogTable).where(isNull(costCatalogTable.companyId));
}

export async function insertCompanyCostCatalog(companyId: number, templates: CostCatalogItem[]): Promise<void> {
  if (!templates.length) return;
  await db.insert(costCatalogTable).values(
    templates.map((t) => ({
      companyId,
      category: t.category,
      itemName: t.itemName,
      description: t.description,
      unitType: t.unitType,
      costPrice: t.costPrice,
      unitPrice: t.unitPrice,
      defaultMarkupPercent: t.defaultMarkupPercent,
      projectTypeMultiplier: t.projectTypeMultiplier,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}
