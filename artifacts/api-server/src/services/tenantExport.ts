import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const objectStorageService = new ObjectStorageService();

// ── Table registry ────────────────────────────────────────────────────────────
// This is the single source of truth for "what belongs to a tenant", shared by
// both the export and the delete flow so the two can never drift apart again.
// Every table name below was verified against lib/db/src/schema/*.ts.

/**
 * Tables with a `company_id` column that carries `ON DELETE CASCADE` straight
 * to `companies`. Exported generically here; left for `DELETE FROM companies`
 * to cascade during the delete step — no explicit delete needed.
 */
const DIRECT_TENANT_TABLES = [
  "projects", "daily_reports", "expenses", "rfis", "contacts", "leads",
  "invitations", "project_members", "worker_schedules", "time_entries",
  "timesheets", "quotes", "invoices", "subscriptions", "form_submissions",
  "scans", "estimates", "builder_estimates", "estimate_templates",
  "tradehub_posts", "job_postings", "payments", "change_orders",
  "estimator_cost_models", "estimator_addons", "equipment", "schedule_events",
  "inspections", "inspection_alerts", "project_notes", "audit_logs",
  "ai_compliance_directives", "provider_tokens", "conversations",
  "worker_documents", "permits", "inventory_assets", "asset_schedules",
  "inventory_materials", "tool_checkouts", "worker_credentials",
  "cor_audit_trail", "cor_voice_action_logs", "cor_audit_packages",
  "cor_audit_log_entries", "policy_documents", "policy_signoffs",
  "subcontractors", "subcontractor_docs", "capa_tickets",
  "credential_alert_logs", "external_auditor_tokens", "document_chunks",
] as const;

/**
 * Direct `company_id` columns that do NOT cascade (verified: no
 * `onDelete: "cascade"` on the FK). These would throw an FK violation on
 * `DELETE FROM companies` unless handled first. `tradehub_profiles` is
 * user-owned and cross-tenant, so it's detached (company_id set to NULL)
 * rather than deleted.
 */
const NON_CASCADING_EXCEPTIONS: Array<{ table: string; action: "delete" | "detach" }> = [
  { table: "quickbooks_connections", action: "delete" },
  { table: "proposals", action: "delete" },
  { table: "file_attachments", action: "delete" },
  { table: "estimator_actuals", action: "delete" },
  { table: "tradehub_profiles", action: "detach" },
];

/**
 * Tables scoped only indirectly (no `company_id` column of their own) —
 * resolved via a one-hop join to a direct tenant table. Deleted explicitly,
 * before their parent is cascade-deleted, matching the existing convention
 * in this route of not relying on multi-hop cascade chains.
 */
const INDIRECT_TENANT_TABLES: Array<{ file: string; whereSql: (companyId: number) => ReturnType<typeof sql> }> = [
  { file: "cost_analyses", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "tasks", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "project_documents", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "client_portal_tokens", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "client_portal_uploads", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "client_portal_messages", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "daily_logs", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "site_photos", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "safety_signoffs", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "media_hub_photos", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "notifications", whereSql: (id) => sql`project_id IN (SELECT id FROM projects WHERE company_id = ${id})` },
  { file: "daily_report_photos", whereSql: (id) => sql`report_id IN (SELECT id FROM daily_reports WHERE company_id = ${id})` },
  { file: "inspection_items", whereSql: (id) => sql`inspection_id IN (SELECT id FROM inspections WHERE company_id = ${id})` },
  { file: "lead_activities", whereSql: (id) => sql`lead_id IN (SELECT id FROM leads WHERE company_id = ${id})` },
  // tradehub_media also holds owner_type='profile' rows (user-owned, cross-tenant —
  // same reasoning as the tradehub_profiles "detach" exception below), so this must
  // stay scoped to owner_type='post' rather than sweeping in every row.
  { file: "tradehub_media", whereSql: (id) => sql`owner_type = 'post' AND owner_id IN (SELECT id FROM tradehub_posts WHERE company_id = ${id})` },
  { file: "tradehub_comments", whereSql: (id) => sql`post_id IN (SELECT id FROM tradehub_posts WHERE company_id = ${id})` },
  { file: "tradehub_reactions", whereSql: (id) => sql`post_id IN (SELECT id FROM tradehub_posts WHERE company_id = ${id})` },
  { file: "tradehub_job_applications", whereSql: (id) => sql`post_id IN (SELECT id FROM tradehub_posts WHERE company_id = ${id})` },
  { file: "job_posting_applications", whereSql: (id) => sql`job_posting_id IN (SELECT id FROM job_postings WHERE company_id = ${id})` },
  { file: "submission_photos", whereSql: (id) => sql`submission_id IN (SELECT id FROM form_submissions WHERE company_id = ${id})` },
  { file: "submission_comments", whereSql: (id) => sql`submission_id IN (SELECT id FROM form_submissions WHERE company_id = ${id})` },
  { file: "schedule_event_assignees", whereSql: (id) => sql`event_id IN (SELECT id FROM schedule_events WHERE company_id = ${id})` },
  { file: "builder_estimate_items", whereSql: (id) => sql`estimate_id IN (SELECT id FROM builder_estimates WHERE company_id = ${id})` },
  { file: "estimate_template_items", whereSql: (id) => sql`template_id IN (SELECT id FROM estimate_templates WHERE company_id = ${id})` },
  { file: "messages", whereSql: (id) => sql`conversation_id IN (SELECT id FROM conversations WHERE company_id = ${id})` },
];

/** table → column(s) holding a canonical `/objects/...` storage path, for attachment bundling + cleanup. */
const ATTACHMENT_COLUMNS: Record<string, string[]> = {
  file_attachments: ["object_path"],
  project_documents: ["object_path"],
  daily_report_photos: ["object_path"],
  scans: ["object_path", "thumbnail_path"],
  expenses: ["receipt_object_path"],
  submission_photos: ["object_path"],
  tradehub_media: ["object_path"],
  client_portal_uploads: ["object_path"],
  worker_documents: ["file_path"],
  permits: ["file_url"],
  policy_documents: ["file_url"],
  subcontractor_docs: ["document_url"],
  worker_credentials: ["document_url"],
};

type Row = Record<string, unknown>;
type QueryRunner = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Row[] }> };

async function selectDirect(tx: QueryRunner, table: string, companyId: number): Promise<Row[]> {
  const result = await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE company_id = ${companyId}`);
  return result.rows;
}

async function selectMemberships(tx: QueryRunner, companyId: number): Promise<Row[]> {
  const result = await tx.execute(sql`
    SELECT um.user_id, um.company_id, um.role, um.is_active, um.permissions, um.created_at,
           u.email, u.first_name, u.last_name
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.company_id = ${companyId}
  `);
  return result.rows;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function addAttachments(zip: JSZip, table: string, rows: Row[]): Promise<void> {
  const columns = ATTACHMENT_COLUMNS[table];
  if (!columns) return;
  for (const row of rows) {
    for (const col of columns) {
      const objectPath = row[col];
      if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) continue;
      try {
        const file = await objectStorageService.getObjectEntityFile(objectPath);
        const [buffer] = await file.download();
        const name = safeFileName(`${row.id ?? ""}_${objectPath.split("/").pop()}`);
        zip.file(`attachments/${table}/${name}`, buffer as Buffer);
      } catch (err) {
        logger.warn({ err, table, objectPath }, "tenantExport: failed to download attachment, skipping");
      }
    }
  }
}

export interface TenantExportResult {
  zipBuffer: Buffer;
  sha256: string;
  rowCounts: Record<string, number>;
  manifest: Record<string, unknown>;
}

/** Builds a ZIP of every row belonging to `companyId`, plus referenced attachment files. */
export async function buildTenantExport(
  tx: QueryRunner,
  companyId: number,
  exportedByUserId: number,
): Promise<TenantExportResult> {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) {
    throw new Error(`buildTenantExport: company ${companyId} not found`);
  }

  const zip = new JSZip();
  const rowCounts: Record<string, number> = {};

  zip.file("company.json", JSON.stringify(company, null, 2));

  const memberships = await selectMemberships(tx, companyId);
  zip.file("user_memberships.json", JSON.stringify(memberships, null, 2));
  rowCounts.user_memberships = memberships.length;

  for (const table of DIRECT_TENANT_TABLES) {
    const rows = await selectDirect(tx, table, companyId);
    zip.file(`${table}.json`, JSON.stringify(rows, null, 2));
    rowCounts[table] = rows.length;
    await addAttachments(zip, table, rows);
  }

  for (const spec of INDIRECT_TENANT_TABLES) {
    const result = await tx.execute(sql`SELECT * FROM ${sql.identifier(spec.file)} WHERE ${spec.whereSql(companyId)}`);
    zip.file(`${spec.file}.json`, JSON.stringify(result.rows, null, 2));
    rowCounts[spec.file] = result.rows.length;
    await addAttachments(zip, spec.file, result.rows);
  }

  for (const exception of NON_CASCADING_EXCEPTIONS) {
    const rows = await selectDirect(tx, exception.table, companyId);
    zip.file(`${exception.table}.json`, JSON.stringify(rows, null, 2));
    rowCounts[exception.table] = rows.length;
    await addAttachments(zip, exception.table, rows);
  }

  const manifest = {
    companyId,
    companyName: company.name,
    exportedAt: new Date().toISOString(),
    exportedByUserId,
    rowCounts,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const sha256 = createHash("sha256").update(zipBuffer).digest("hex");

  return { zipBuffer, sha256, rowCounts, manifest };
}

export interface TenantDeleteResult {
  deletedObjectPaths: string[];
}

/**
 * Deletes every row belonging to `companyId`. Must run inside a transaction
 * that also deletes the `companies` row itself (not done here) — the ~50
 * tables in DIRECT_TENANT_TABLES are left to that final cascade. Returns the
 * object-storage paths that should be deleted by the caller *after* the
 * transaction commits (storage deletes aren't rollback-able, so they must
 * not happen until the DB delete is durable).
 */
export async function deleteTenantData(tx: QueryRunner, companyId: number): Promise<TenantDeleteResult> {
  const deletedObjectPaths: string[] = [];

  for (const table of Object.keys(ATTACHMENT_COLUMNS)) {
    const columns = ATTACHMENT_COLUMNS[table];
    const indirectSpec = INDIRECT_TENANT_TABLES.find((s) => s.file === table);
    const rows = indirectSpec
      ? (await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE ${indirectSpec.whereSql(companyId)}`)).rows
      : await selectDirect(tx, table, companyId);
    for (const row of rows) {
      for (const col of columns) {
        const objectPath = row[col];
        if (typeof objectPath === "string" && objectPath.startsWith("/objects/")) {
          deletedObjectPaths.push(objectPath);
        }
      }
    }
  }

  for (const spec of INDIRECT_TENANT_TABLES) {
    await tx.execute(sql`DELETE FROM ${sql.identifier(spec.file)} WHERE ${spec.whereSql(companyId)}`);
  }

  for (const exception of NON_CASCADING_EXCEPTIONS) {
    if (exception.action === "delete") {
      await tx.execute(sql`DELETE FROM ${sql.identifier(exception.table)} WHERE company_id = ${companyId}`);
    } else {
      await tx.execute(sql`UPDATE ${sql.identifier(exception.table)} SET company_id = NULL WHERE company_id = ${companyId}`);
    }
  }

  // DIRECT_TENANT_TABLES are intentionally not deleted here — they cascade
  // automatically when the caller deletes the `companies` row.

  return { deletedObjectPaths };
}

/** Best-effort storage cleanup — call only after the delete transaction has committed. */
export async function purgeObjectStoragePaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await objectStorageService.deleteObjectByPath(path);
    } catch (err) {
      logger.warn({ err, path }, "tenantExport: failed to delete object storage file post-delete");
    }
  }
}
