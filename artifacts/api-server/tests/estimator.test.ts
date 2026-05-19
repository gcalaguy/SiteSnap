import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, companiesTable, usersTable, estimatorCostModelsTable, estimatorAddonsTable, estimatesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { countCostModelReferences, countAddonReferences } from "../src/routes/estimator";

/**
 * Integration tests for cost-model / add-on deletion safeguard.
 *
 * These hit the real dev database (DATABASE_URL) and clean up everything
 * they create so the suite is idempotent.
 */

let companyId: number;
let userId: number;
let modelId: number;
let addonId: number;
let estimateIds: number[] = [];

beforeAll(async () => {
  // 1. Create a test company
  const [company] = await db
    .insert(companiesTable)
    .values({
      name: "Test Estimator Safeguard Co",
      province: "ON",
      city: "Toronto",
    })
    .returning();
  companyId = company.id;

  // 2. Create a test user
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `test_clerk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email: `test-estimator-safeguard-${Date.now()}@example.com`,
      firstName: "Test",
      lastName: "User",
      activeCompanyId: companyId,
    })
    .returning();
  userId = user.id;

  // 3. Create a cost model
  const [model] = await db
    .insert(estimatorCostModelsTable)
    .values({
      projectType: "test_safeguard",
      finishLevel: "standard",
      name: "Test Safeguard Model",
      baseCostPerSqft: "100",
      laborCostPerSqft: "40",
      materialCostPerSqft: "50",
      overheadPct: "10",
      contingencyPct: "10",
    })
    .returning();
  modelId = model.id;

  // 4. Create an add-on
  const [addon] = await db
    .insert(estimatorAddonsTable)
    .values({
      name: "Test Safeguard Add-on",
      addonKey: `test_addon_${Date.now()}`,
      costType: "flat",
      amount: "500",
    })
    .returning();
  addonId = addon.id;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  if (estimateIds.length > 0) {
    await db
      .delete(estimatesTable)
      .where(inArray(estimatesTable.id, estimateIds));
  }
  if (addonId) {
    await db
      .delete(estimatorAddonsTable)
      .where(eq(estimatorAddonsTable.id, addonId));
  }
  if (modelId) {
    await db
      .delete(estimatorCostModelsTable)
      .where(eq(estimatorCostModelsTable.id, modelId));
  }
  if (userId) {
    await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId));
  }
  if (companyId) {
    await db
      .delete(companiesTable)
      .where(eq(companiesTable.id, companyId));
  }
});

async function seedEstimates() {
  const results = await db
    .insert(estimatesTable)
    .values([
      {
        companyId,
        createdByUserId: userId,
        title: "Estimate A",
        sourceType: "smart",
        status: "ready",
        result: {
          costModelUsed: { id: modelId, name: "Test", projectType: "test", finishLevel: "standard", notes: null },
          _params: { project_type: "test", square_feet: 1000, finish_level: "standard", addons: [] },
        },
      },
      {
        companyId,
        createdByUserId: userId,
        title: "Estimate B",
        sourceType: "smart",
        status: "ready",
        result: {
          costModelUsed: { id: modelId, name: "Test", projectType: "test", finishLevel: "standard", notes: null },
          _params: { project_type: "test", square_feet: 2000, finish_level: "standard", addons: [] },
        },
      },
      {
        companyId,
        createdByUserId: userId,
        title: "Estimate C with addon",
        sourceType: "scan",
        status: "ready",
        result: {
          costModelUsed: { id: 99999, name: "Other", projectType: "other", finishLevel: "basic", notes: null },
          _params: { project_type: "test", square_feet: 1500, finish_level: "standard", addons: ["test_addon_not_exist"] },
        },
      },
    ])
    .returning();
  estimateIds = results.map((e) => e.id);

  // Also add an estimate that references the addon via _params.addons
  const [addon] = await db
    .select({ addonKey: estimatorAddonsTable.addonKey })
    .from(estimatorAddonsTable)
    .where(eq(estimatorAddonsTable.id, addonId))
    .limit(1);

  const [addonEstimate] = await db
    .insert(estimatesTable)
    .values({
      companyId,
      createdByUserId: userId,
      title: "Estimate D with real addon",
      sourceType: "smart",
      status: "ready",
      result: {
        costModelUsed: { id: 99999, name: "Other", projectType: "other", finishLevel: "basic", notes: null },
        _params: { project_type: "test", square_feet: 1500, finish_level: "standard", addons: [addon.addonKey] },
      },
    })
    .returning();
  estimateIds.push(addonEstimate.id);
}

describe("countCostModelReferences", () => {
  it("returns 0 when no estimates reference the model", async () => {
    const count = await countCostModelReferences(modelId, companyId);
    expect(count).toBe(0);
  });

  it("returns correct count after seeding estimates", async () => {
    await seedEstimates();
    const count = await countCostModelReferences(modelId, companyId);
    expect(count).toBe(2);
  });

  it("returns 0 for a non-existent model", async () => {
    const count = await countCostModelReferences(999999, companyId);
    expect(count).toBe(0);
  });
});

describe("countAddonReferences", () => {
  it("returns correct count for the seeded addon", async () => {
    // Estimates already seeded by the previous describe block
    const count = await countAddonReferences(addonId, companyId);
    expect(count).toBe(1);
  });

  it("returns 0 for a non-existent addon", async () => {
    const count = await countAddonReferences(999999, companyId);
    expect(count).toBe(0);
  });
});

describe("cross-company isolation", () => {
  it("does not count estimates from a different company", async () => {
    const count = await countCostModelReferences(modelId, 999999);
    expect(count).toBe(0);
  });
});

describe("addon reference counting with multiple matches", () => {
  it("counts all estimates that reference the addon", async () => {
    // Already seeded with 1 addon estimate in beforeAll + seedEstimates
    const count = await countAddonReferences(addonId, companyId);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
