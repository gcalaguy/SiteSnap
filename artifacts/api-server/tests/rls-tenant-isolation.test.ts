/**
 * PHASE 0 TEST VECTORS — Row-Level Security tenant isolation (Phase 5 gate)
 *
 * These are the tests that migration 0050's fallback-removal follow-up is
 * gated on (see lib/db/migrations/0050_rls_tenant_isolation_phase5.sql). Two
 * things are being proven here, on real Postgres via a real transaction —
 * not mocked:
 *
 *   1. METADATA SWEEP — every table migration 0050 touches actually has
 *      rowsecurity=true, forcerowsecurity=true, and a `tenant_isolation`
 *      policy attached. This is the cheap, exhaustive check: it covers all
 *      73 newly-gated tables + the original 4, with no per-table fixtures.
 *
 *   2. BEHAVIORAL SAMPLE — for one table per classification bucket (direct
 *      company_id, indirect-via-parent-FK, nullable global/override, and an
 *      original-4 table now under FORCE), actually insert two companies'
 *      worth of data and prove that `withTenantCtx(companyA, …)` cannot see
 *      companyB's rows, while `withTenantCtx(companyB, …)` cannot see
 *      companyA's — using the raw pool client (bypassing app-level `WHERE
 *      company_id = …` filters entirely), so this is proving Postgres RLS
 *      itself is enforcing isolation, not just careful application code.
 *
 * WHAT THIS DOES NOT YET PROVE: that removing the `current_tenant_id() IS
 * NULL` fallback is safe. Section 3 documents the two tables (user_memberships,
 * subscriptions) that are read inside requireAuth() before any tenant context
 * exists — those must keep the fallback, or a pre-auth query, indefinitely.
 * Do not strip the fallback from the other tables until every route path has
 * been confirmed to always set tenant context first (this file doesn't test
 * that — it tests that RLS enforces isolation *when* context is set).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, withTenantCtx, companiesTable, contactsTable, projectsTable, tasksTable, estimatorCostModelsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

// ── Full table list from migration 0050 (kept in sync by hand — if you add a
// table to the migration, add it here too) ──────────────────────────────────
const STANDARD_DIRECT_TABLES = [
  "ai_compliance_directives", "asset_schedules", "audit_logs", "builder_estimates",
  "capa_tickets", "change_orders", "contacts", "conversations",
  "cor_audit_log_entries", "cor_audit_packages", "cor_audit_trail", "cor_voice_action_logs",
  "credential_alert_logs", "daily_reports", "document_chunks", "equipment",
  "estimates", "estimate_templates", "estimator_actuals", "expenses",
  "external_auditor_tokens", "file_attachments", "form_submissions", "inspection_alerts",
  "inspections", "inventory_assets", "inventory_materials", "invitations",
  "job_postings", "leads", "payments", "permits",
  "policy_documents", "policy_signoffs", "project_members", "project_notes",
  "proposals", "provider_tokens", "quickbooks_connections", "rfis",
  "scans", "schedule_events", "subcontractor_docs", "subcontractors",
  "subscriptions", "time_entries", "tool_checkouts", "user_memberships",
  "worker_credentials", "worker_documents", "worker_schedules",
];
const SPECIAL_NULLABLE_TABLES = ["estimator_cost_models", "estimator_addons"];
const INDIRECT_TABLES = [
  "lead_activities", "daily_report_photos", "submission_photos", "submission_comments",
  "builder_estimate_items", "estimate_template_items", "job_posting_applications",
  "schedule_event_assignees", "inspection_items", "messages",
  "cost_analyses", "tasks", "project_documents", "client_portal_tokens",
  "client_portal_uploads", "client_portal_messages", "daily_logs", "site_photos",
  "safety_signoffs", "media_hub_photos",
];
const ORIGINAL_FOUR = ["projects", "invoices", "quotes", "timesheets"];

const ALL_GATED_TABLES = [
  ...STANDARD_DIRECT_TABLES,
  ...SPECIAL_NULLABLE_TABLES,
  ...INDIRECT_TABLES,
  ...ORIGINAL_FOUR,
];

// Tables that must NEVER lose the `current_tenant_id() IS NULL` fallback —
// see the migration 0050 header comment for why (read inside requireAuth,
// before tenant context exists).
const NEVER_RESTRICT_FULLY = ["user_memberships", "subscriptions"];

describe("Phase 0 — RLS metadata sweep (all 77 gated tables)", () => {
  it("every gated table has rowsecurity + forcerowsecurity + a tenant_isolation policy", async () => {
    const { rows } = await pool.query<{
      tablename: string;
      rowsecurity: boolean;
      forcerowsecurity: boolean;
    }>(
      `SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [ALL_GATED_TABLES],
    );

    const byName = new Map(rows.map((r) => [r.tablename, r]));
    const missing: string[] = [];
    const notEnabled: string[] = [];
    const notForced: string[] = [];

    for (const table of ALL_GATED_TABLES) {
      const row = byName.get(table);
      if (!row) { missing.push(table); continue; }
      if (!row.rowsecurity) notEnabled.push(table);
      if (!row.forcerowsecurity) notForced.push(table);
    }

    expect(missing, `tables not found in pg_class: ${missing.join(", ")}`).toEqual([]);
    expect(notEnabled, `tables missing ENABLE ROW LEVEL SECURITY: ${notEnabled.join(", ")}`).toEqual([]);
    expect(notForced, `tables missing FORCE ROW LEVEL SECURITY: ${notForced.join(", ")}`).toEqual([]);
  });

  it("every gated table has a tenant_isolation policy", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename = ANY($1::text[])`,
      [ALL_GATED_TABLES],
    );
    const covered = new Set(rows.map((r) => r.tablename));
    const missing = ALL_GATED_TABLES.filter((t) => !covered.has(t));
    expect(missing, `tables missing a tenant_isolation policy: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("Phase 0 — behavioral sample: cross-tenant isolation via withTenantCtx", () => {
  let companyA: number;
  let companyB: number;

  beforeAll(async () => {
    const [a] = await db.insert(companiesTable).values({ name: `RLS Test A ${suffix}`, province: "ON", city: "Toronto" }).returning();
    const [b] = await db.insert(companiesTable).values({ name: `RLS Test B ${suffix}`, province: "BC", city: "Vancouver" }).returning();
    companyA = a.id;
    companyB = b.id;
  });

  afterAll(async () => {
    // FK cascades clean up every dependent row inserted below.
    await db.delete(companiesTable).where(eq(companiesTable.id, companyA));
    await db.delete(companiesTable).where(eq(companiesTable.id, companyB));
  });

  it("direct company_id table (contacts): tenant A cannot see tenant B's rows", async () => {
    await withTenantCtx(companyA, async (tx) => {
      await tx.insert(contactsTable).values({ companyId: companyA, name: `A-only ${suffix}` });
    });
    await withTenantCtx(companyB, async (tx) => {
      await tx.insert(contactsTable).values({ companyId: companyB, name: `B-only ${suffix}` });
    });

    const seenByA = await withTenantCtx(companyA, (tx) => tx.select().from(contactsTable));
    const seenByB = await withTenantCtx(companyB, (tx) => tx.select().from(contactsTable));

    expect(seenByA.every((c) => c.companyId === companyA)).toBe(true);
    expect(seenByA.some((c) => c.companyId === companyB)).toBe(false);
    expect(seenByB.every((c) => c.companyId === companyB)).toBe(true);
    expect(seenByB.some((c) => c.companyId === companyA)).toBe(false);
  });

  it("indirect join table (tasks -> projects.company_id): tenant A cannot see tenant B's tasks", async () => {
    const projA = await withTenantCtx(companyA, (tx) =>
      tx.insert(projectsTable).values({ companyId: companyA, name: "Proj A", address: "1 A St", city: "Toronto", province: "ON" }).returning());
    const projB = await withTenantCtx(companyB, (tx) =>
      tx.insert(projectsTable).values({ companyId: companyB, name: "Proj B", address: "1 B St", city: "Vancouver", province: "BC" }).returning());

    await withTenantCtx(companyA, (tx) => tx.insert(tasksTable).values({ projectId: projA[0].id, title: `A task ${suffix}` }));
    await withTenantCtx(companyB, (tx) => tx.insert(tasksTable).values({ projectId: projB[0].id, title: `B task ${suffix}` }));

    const seenByA = await withTenantCtx(companyA, (tx) => tx.select().from(tasksTable));
    const seenByB = await withTenantCtx(companyB, (tx) => tx.select().from(tasksTable));

    expect(seenByA.some((t) => t.projectId === projB[0].id)).toBe(false);
    expect(seenByB.some((t) => t.projectId === projA[0].id)).toBe(false);
    expect(seenByA.some((t) => t.projectId === projA[0].id)).toBe(true);
    expect(seenByB.some((t) => t.projectId === projB[0].id)).toBe(true);
  });

  it("nullable global-default table (estimator_cost_models): global rows visible to both, company rows isolated", async () => {
    const [globalModel] = await withTenantCtx(companyA, (tx) =>
      tx.insert(estimatorCostModelsTable).values({
        companyId: null,
        projectType: "test_global",
        finishLevel: "basic",
        name: `Global ${suffix}`,
        baseCostPerSqft: "1", laborCostPerSqft: "1", materialCostPerSqft: "1",
      }).returning());
    await withTenantCtx(companyA, (tx) =>
      tx.insert(estimatorCostModelsTable).values({
        companyId: companyA,
        projectType: "test_a_only",
        finishLevel: "basic",
        name: `A override ${suffix}`,
        baseCostPerSqft: "1", laborCostPerSqft: "1", materialCostPerSqft: "1",
      }));

    const seenByA = await withTenantCtx(companyA, (tx) => tx.select().from(estimatorCostModelsTable));
    const seenByB = await withTenantCtx(companyB, (tx) => tx.select().from(estimatorCostModelsTable));

    // Both tenants see the global default row...
    expect(seenByA.some((m) => m.id === globalModel.id)).toBe(true);
    expect(seenByB.some((m) => m.id === globalModel.id)).toBe(true);
    // ...but only company A sees its own override.
    expect(seenByA.some((m) => m.projectType === "test_a_only")).toBe(true);
    expect(seenByB.some((m) => m.projectType === "test_a_only")).toBe(false);

    await db.delete(estimatorCostModelsTable).where(eq(estimatorCostModelsTable.id, globalModel.id));
  });

  it("original-4 table now under FORCE (projects): isolation holds after switching ENABLE -> FORCE", async () => {
    await withTenantCtx(companyA, (tx) => tx.insert(projectsTable).values({ companyId: companyA, name: "Force test A", address: "x", city: "x", province: "ON" }));
    await withTenantCtx(companyB, (tx) => tx.insert(projectsTable).values({ companyId: companyB, name: "Force test B", address: "x", city: "x", province: "BC" }));

    const seenByA = await withTenantCtx(companyA, (tx) => tx.select().from(projectsTable));
    expect(seenByA.every((p) => p.companyId === companyA)).toBe(true);
  });

  it("no tenant context set: rows from both companies are visible (documented fallback, NOT the final state)", async () => {
    await withTenantCtx(companyA, (tx) => tx.insert(contactsTable).values({ companyId: companyA, name: `fallback-check-A ${suffix}` }));
    await withTenantCtx(companyB, (tx) => tx.insert(contactsTable).values({ companyId: companyB, name: `fallback-check-B ${suffix}` }));

    // db here is the un-scoped pool-backed instance (outside any withTenantCtx call).
    const all = await db.select().from(contactsTable).where(eq(contactsTable.name, `fallback-check-A ${suffix}`));
    const allB = await db.select().from(contactsTable).where(eq(contactsTable.name, `fallback-check-B ${suffix}`));
    expect(all.length).toBe(1);
    expect(allB.length).toBe(1);
  });
});

describe("Phase 0 — pre-auth-resolution tables must keep the NULL fallback", () => {
  it("user_memberships and subscriptions are documented as permanently-permissive-fallback", () => {
    // This is not a DB assertion — it's a guard against silently including these
    // two tables in a future fallback-removal migration. See migration 0050's
    // header comment: both are queried inside requireAuth(), before req.companyId
    // (and therefore any tenant context) has been resolved. Restricting them
    // without first reworking requireAuth would break login/session resolution
    // for every user on every request.
    expect(NEVER_RESTRICT_FULLY).toEqual(["user_memberships", "subscriptions"]);
  });
});
