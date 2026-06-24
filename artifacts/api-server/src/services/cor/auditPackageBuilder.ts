import crypto from "crypto";
import JSZip from "jszip";
import { db, pool } from "@workspace/db";
import {
  corAuditTrailTable,
  corVoiceActionLogsTable,
  corAuditPackagesTable,
  corAuditLogEntriesTable,
  usersTable,
  companiesTable,
  projectsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import { logger } from "../../lib/logger";

// ── IHSA Element catalogue (14 elements, Ontario COR) ─────────────────────────

export const IHSA_ELEMENTS = [
  { key: "element_1",  num: "01", name: "Management Leadership & Commitment",         folder: "01_Management_Leadership" },
  { key: "element_2",  num: "02", name: "Hazard Identification, Assessment & Control",folder: "02_Hazard_ID_Assessment" },
  { key: "element_3",  num: "03", name: "Hazard Control Measures",                    folder: "03_Hazard_Control" },
  { key: "element_4",  num: "04", name: "Ongoing Inspections",                        folder: "04_Ongoing_Inspections" },
  { key: "element_5",  num: "05", name: "Qualifications, Orientations & Training",    folder: "05_Training_Qualifications" },
  { key: "element_6",  num: "06", name: "Emergency Response",                         folder: "06_Emergency_Response" },
  { key: "element_7",  num: "07", name: "Incident Reporting & Investigation",         folder: "07_Incident_Reporting" },
  { key: "element_8",  num: "08", name: "Program Administration",                     folder: "08_Program_Administration" },
  { key: "element_9",  num: "09", name: "Worker Participation",                       folder: "09_Worker_Participation" },
  { key: "element_10", num: "10", name: "Workplace Housekeeping",                     folder: "10_Workplace_Housekeeping" },
  { key: "element_11", num: "11", name: "Environmental Protection",                   folder: "11_Environmental_Protection" },
  { key: "element_12", num: "12", name: "Safety Equipment & First Aid",               folder: "12_Safety_Equipment_First_Aid" },
  { key: "element_13", num: "13", name: "Fire Safety & Fire Extinguishers",           folder: "13_Fire_Safety" },
  { key: "element_14", num: "14", name: "WHMIS & Controlled Products",                folder: "14_WHMIS" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  companyId: number;
  userId: number;
  label: string;
  periodStart?: string;
  periodEnd?: string;
  projectIds?: number[];
}

export interface ElementSummary {
  element: string;
  name: string;
  score: number;
  totalEntries: number;
  failCount: number;
  passCount: number;
}

export interface PackageMeta {
  packageId: number;
  label: string;
  generatedAt: string;
  totalEntries: number;
  totalInspections: number;
  totalWorkers: number;
  elementSummary: ElementSummary[];
  checksum: string;
  fileSizeBytes: number;
  zipBuffer: Buffer;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split("T")[0];
}

// ── Chain-hash tamper-evident log ─────────────────────────────────────────────

const GENESIS_SEED = "SITESNAP_COR_GENESIS_V1";

async function getPrevChainHash(companyId: number): Promise<string> {
  const { rows } = await pool.query<{ chain_hash: string }>(
    `SELECT chain_hash FROM cor_audit_log_entries
     WHERE company_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [companyId],
  );
  return rows[0]?.chain_hash ?? GENESIS_SEED;
}

export interface AuditLogEvent {
  companyId: number;
  packageId?: number;
  eventType: string;
  actorUserId?: number;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
}

export async function appendAuditLogEntry(event: AuditLogEvent): Promise<string> {
  const prevHash = await getPrevChainHash(event.companyId);
  const now = new Date().toISOString();

  const payload = JSON.stringify({
    eventType: event.eventType,
    actorUserId: event.actorUserId ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    metadata: event.metadata ?? null,
    createdAt: now,
  });

  const chainHash = crypto
    .createHash("sha256")
    .update(prevHash + payload)
    .digest("hex");

  await pool.query(
    `INSERT INTO cor_audit_log_entries
       (company_id, package_id, event_type, actor_user_id, entity_type, entity_id, metadata, chain_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.companyId,
      event.packageId ?? null,
      event.eventType,
      event.actorUserId ?? null,
      event.entityType ?? null,
      event.entityId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      chainHash,
      now,
    ],
  );

  return chainHash;
}

// ── Main build function ───────────────────────────────────────────────────────

export async function buildAuditPackage(opts: BuildOptions): Promise<PackageMeta> {
  const { companyId, userId, label, periodStart, periodEnd, projectIds } = opts;

  // ── 0. Create package record ──────────────────────────────────────────────
  const [pkgRow] = await db
    .insert(corAuditPackagesTable)
    .values({
      companyId,
      generatedByUserId: userId,
      label,
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      status: "generating",
    })
    .returning({ id: corAuditPackagesTable.id });

  const packageId = pkgRow.id;

  try {
    // ── 1. Fetch company & user info ──────────────────────────────────────
    const [company] = await db
      .select({ name: companiesTable.name, province: companiesTable.province })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId));

    const [actor] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const generatedAt = new Date().toISOString();

    // ── 2. Fetch audit trail entries ─────────────────────────────────────
    const auditConditions = [eq(corAuditTrailTable.companyId, companyId)];
    if (periodStart) auditConditions.push(gte(corAuditTrailTable.createdAt, new Date(periodStart)));
    if (periodEnd)   auditConditions.push(lte(corAuditTrailTable.createdAt, new Date(periodEnd)));
    if (projectIds?.length) auditConditions.push(inArray(corAuditTrailTable.projectId, projectIds));

    const auditEntries = await db
      .select({
        id: corAuditTrailTable.id,
        projectId: corAuditTrailTable.projectId,
        projectName: projectsTable.name,
        submittedByUserId: corAuditTrailTable.submittedByUserId,
        submitterFirst: usersTable.firstName,
        submitterLast: usersTable.lastName,
        sourceType: corAuditTrailTable.sourceType,
        sourceRecordId: corAuditTrailTable.sourceRecordId,
        ihsaElement: corAuditTrailTable.ihsaElement,
        ihsaElementName: corAuditTrailTable.ihsaElementName,
        findingType: corAuditTrailTable.findingType,
        findingDescription: corAuditTrailTable.findingDescription,
        complianceScore: corAuditTrailTable.complianceScore,
        evidenceSnapshot: corAuditTrailTable.evidenceSnapshot,
        createdAt: corAuditTrailTable.createdAt,
      })
      .from(corAuditTrailTable)
      .leftJoin(projectsTable, eq(corAuditTrailTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(corAuditTrailTable.submittedByUserId, usersTable.id))
      .where(and(...auditConditions))
      .orderBy(corAuditTrailTable.ihsaElement, corAuditTrailTable.createdAt);

    // ── 3. Fetch inspections ─────────────────────────────────────────────
    const inspectionConditions: string[] = [];
    const inspParams: unknown[] = [companyId];
    if (periodStart) { inspParams.push(periodStart); inspectionConditions.push(`i.date >= $${inspParams.length}`); }
    if (periodEnd)   { inspParams.push(periodEnd);   inspectionConditions.push(`i.date <= $${inspParams.length}`); }
    if (projectIds?.length) {
      inspParams.push(projectIds);
      inspectionConditions.push(`i.project_id = ANY($${inspParams.length})`);
    }

    const whereClause = inspectionConditions.length
      ? "AND " + inspectionConditions.join(" AND ")
      : "";

    const { rows: inspections } = await pool.query<{
      id: number; project_name: string; inspection_type: string; date: string;
      status: string; score: number; inspector_first: string; inspector_last: string;
      item_name: string; item_status: string; severity: string; comment: string;
    }>(
      `SELECT i.id, p.name AS project_name, i.inspection_type, i.date,
              i.status, i.score,
              u.first_name AS inspector_first, u.last_name AS inspector_last,
              ii.item_name, ii.status AS item_status, ii.severity, ii.comment
       FROM inspections i
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN users u ON u.id = i.inspector_id
       LEFT JOIN inspection_items ii ON ii.inspection_id = i.id
       WHERE i.company_id = $1 ${whereClause}
       ORDER BY i.id, ii.id`,
      inspParams,
    );

    // Group inspection items under their inspection
    const inspectionMap = new Map<number, { meta: Record<string, unknown>; items: Record<string, unknown>[] }>();
    for (const row of inspections) {
      if (!inspectionMap.has(row.id)) {
        inspectionMap.set(row.id, {
          meta: {
            id: row.id,
            projectName: row.project_name,
            inspectionType: row.inspection_type,
            date: formatDate(row.date),
            status: row.status,
            score: row.score,
            inspector: `${row.inspector_first ?? ""} ${row.inspector_last ?? ""}`.trim(),
          },
          items: [],
        });
      }
      if (row.item_name) {
        inspectionMap.get(row.id)!.items.push({
          item: row.item_name,
          status: row.item_status,
          severity: row.severity,
          comment: row.comment,
        });
      }
    }

    const allInspections = Array.from(inspectionMap.values());

    // ── 4. Fetch voice logs ──────────────────────────────────────────────
    const voiceLogs = await db
      .select({
        id: corVoiceActionLogsTable.id,
        projectName: projectsTable.name,
        submitterFirst: usersTable.firstName,
        submitterLast: usersTable.lastName,
        rawTranscript: corVoiceActionLogsTable.rawTranscript,
        riskLevel: corVoiceActionLogsTable.riskLevel,
        ihsaElement: corVoiceActionLogsTable.ihsaElement,
        dueDate: corVoiceActionLogsTable.dueDate,
        correctedTaskId: corVoiceActionLogsTable.correctedTaskId,
        aiClassification: corVoiceActionLogsTable.aiClassification,
        createdAt: corVoiceActionLogsTable.createdAt,
      })
      .from(corVoiceActionLogsTable)
      .leftJoin(projectsTable, eq(corVoiceActionLogsTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(corVoiceActionLogsTable.submittedByUserId, usersTable.id))
      .where(eq(corVoiceActionLogsTable.companyId, companyId))
      .orderBy(corVoiceActionLogsTable.createdAt);

    // ── 5. Fetch training matrix ─────────────────────────────────────────
    const { rows: credRows } = await pool.query<{
      user_id: number; first_name: string; last_name: string; email: string;
      role: string; credential_type: string; status: string;
      issue_date: string; expiration_date: string; certificate_number: string; issued_by: string;
    }>(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email,
              m.role,
              wc.credential_type, wc.status,
              wc.issue_date, wc.expiration_date,
              wc.certificate_number, wc.issued_by
       FROM user_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN worker_credentials wc ON wc.user_id = m.user_id AND wc.company_id = m.company_id
       WHERE m.company_id = $1
       ORDER BY u.last_name, u.first_name, wc.credential_type`,
      [companyId],
    );

    const workerSet = new Set(credRows.map((r) => r.user_id));

    // ── 6. Build per-element data ────────────────────────────────────────
    const elementMap = new Map<string, typeof auditEntries>();
    for (const entry of auditEntries) {
      const key = entry.ihsaElement ?? "element_4";
      if (!elementMap.has(key)) elementMap.set(key, []);
      elementMap.get(key)!.push(entry);
    }

    // ── 7. Compute element summaries ─────────────────────────────────────
    const elementSummary: ElementSummary[] = IHSA_ELEMENTS.map((el) => {
      const entries = elementMap.get(el.key) ?? [];
      const fails = entries.filter((e) => e.findingType === "fail").length;
      const passes = entries.filter((e) => e.findingType === "pass").length;
      const avg = entries.length === 0
        ? 100
        : Math.round(entries.reduce((s, e) => s + (e.complianceScore ?? 0), 0) / entries.length);
      return { element: el.key, name: el.name, score: avg, totalEntries: entries.length, failCount: fails, passCount: passes };
    });

    const overallScore = elementSummary.length === 0 ? 100
      : Math.round(elementSummary.reduce((s, e) => s + e.score, 0) / elementSummary.length);

    // ── 8. Assemble ZIP ───────────────────────────────────────────────────
    const zip = new JSZip();
    const packageName = `COR_Audit_Package_${company?.name?.replace(/[^a-zA-Z0-9]/g, "_") ?? "Company"}_${generatedAt.slice(0, 10)}`;
    const root = zip.folder(packageName)!;

    // File checksums for manifest
    const fileChecksums: Record<string, string> = {};

    function addFile(folder: JSZip, name: string, content: string): void {
      folder.file(name, content);
      fileChecksums[name] = crypto.createHash("sha256").update(content).digest("hex");
    }

    // ── 8a. Cover JSON ──
    const coverData = {
      packageName,
      label,
      company: company?.name ?? "Unknown",
      province: company?.province ?? "",
      generatedAt,
      generatedBy: actor ? `${actor.firstName} ${actor.lastName} <${actor.email}>` : `User #${userId}`,
      periodStart: periodStart ?? "All time",
      periodEnd: periodEnd ?? "All time",
      overallCorScore: overallScore,
      totalAuditEntries: auditEntries.length,
      totalInspections: allInspections.length,
      totalWorkers: workerSet.size,
      ihsaElementsCovered: elementSummary.filter((e) => e.totalEntries > 0).length,
      disclaimer: "This package is generated by SiteSnap and is intended for internal COR audit preparation. The chain hash log provides tamper-evidence for external auditor verification.",
    };
    const coverFolder = root.folder("00_COVER")!;
    addFile(coverFolder, "audit_package_cover.json", JSON.stringify(coverData, null, 2));

    // ── 8b. Per-element folders ──
    for (const el of IHSA_ELEMENTS) {
      const entries = elementMap.get(el.key) ?? [];
      const summary = elementSummary.find((s) => s.element === el.key)!;
      const folder = root.folder(el.folder)!;

      const elementSummaryDoc = {
        element: el.key,
        elementNumber: el.num,
        name: el.name,
        overallScore: summary.score,
        totalEntries: summary.totalEntries,
        passCount: summary.passCount,
        failCount: summary.failCount,
        complianceStatus: summary.score >= 80 ? "COMPLIANT" : summary.score >= 60 ? "NEEDS_ATTENTION" : "NON_COMPLIANT",
      };
      addFile(folder, "element_summary.json", JSON.stringify(elementSummaryDoc, null, 2));

      if (entries.length > 0) {
        const csvRows = entries.map((e) => ({
          Entry_ID: e.id,
          Date: formatDate(e.createdAt as Date),
          Project: e.projectName ?? "",
          Source_Type: e.sourceType,
          Source_Record_ID: e.sourceRecordId,
          IHSA_Element: e.ihsaElement,
          Finding_Type: e.findingType,
          Compliance_Score: e.complianceScore,
          Description: e.findingDescription,
          Submitted_By: e.submitterFirst ? `${e.submitterFirst} ${e.submitterLast}` : "",
        }));
        addFile(folder, "audit_entries.csv", toCsv(csvRows));

        // Full JSON with evidence snapshots for auditor reference
        const fullJson = entries.map((e) => ({
          ...e,
          createdAt: formatDate(e.createdAt as Date),
        }));
        addFile(folder, "audit_entries_full.json", JSON.stringify(fullJson, null, 2));
      } else {
        addFile(folder, "NO_EVIDENCE_ON_FILE.txt",
          `No audit trail entries recorded for ${el.name} in this period.\n` +
          `This gap should be addressed before the formal IHSA COR audit.\n`);
      }

      // Attach relevant inspections to element_4 (Ongoing Inspections)
      if (el.key === "element_4" && allInspections.length > 0) {
        const inspFolder = folder.folder("inspections")!;
        const inspSummary = allInspections.map(({ meta, items }) => ({
          ...meta,
          itemCount: items.length,
          failCount: items.filter((i) => i.status === "fail").length,
          items,
        }));
        addFile(inspFolder, "all_inspections.json", JSON.stringify(inspSummary, null, 2));

        const inspCsvRows = allInspections.flatMap(({ meta, items }) =>
          items.map((item) => ({
            Inspection_ID: meta["id"],
            Project: meta["projectName"],
            Type: meta["inspectionType"],
            Date: meta["date"],
            Inspector: meta["inspector"],
            Item: item["item"],
            Status: item["status"],
            Severity: item["severity"],
            Comment: item["comment"],
          })),
        );
        if (inspCsvRows.length > 0) {
          addFile(inspFolder, "inspection_items.csv", toCsv(inspCsvRows));
        }
      }

      // Attach voice logs to relevant elements
      const elementVoiceLogs = voiceLogs.filter((v) => v.ihsaElement === el.key);
      if (elementVoiceLogs.length > 0) {
        const vlFolder = folder.folder("voice_observations")!;
        const vlCsvRows = elementVoiceLogs.map((v) => ({
          Log_ID: v.id,
          Date: formatDate(v.createdAt as Date),
          Project: v.projectName ?? "",
          Submitted_By: v.submitterFirst ? `${v.submitterFirst} ${v.submitterLast}` : "",
          Risk_Level: v.riskLevel,
          Transcript: v.rawTranscript,
          Due_Date: formatDate(v.dueDate as string),
          Corrective_Task_ID: v.correctedTaskId ?? "",
        }));
        addFile(vlFolder, "voice_observations.csv", toCsv(vlCsvRows));
      }
    }

    // ── 8c. Training Matrix folder ──
    const trainingFolder = root.folder("TRAINING_MATRIX")!;

    const credentialTypes = [
      "working_at_heights", "whmis", "cor_training",
      "first_aid", "fall_protection", "confined_space", "elevated_work_platform",
    ];
    const CRED_LABELS: Record<string, string> = {
      working_at_heights: "Working at Heights",
      whmis: "WHMIS",
      cor_training: "COR Training",
      first_aid: "First Aid",
      fall_protection: "Fall Protection",
      confined_space: "Confined Space Entry",
      elevated_work_platform: "Elevated Work Platform",
    };

    // Build per-worker credential map
    const workerCredMap = new Map<number, { meta: Record<string, string>; creds: Map<string, typeof credRows[0]> }>();
    for (const row of credRows) {
      if (!workerCredMap.has(row.user_id)) {
        workerCredMap.set(row.user_id, {
          meta: { firstName: row.first_name, lastName: row.last_name, email: row.email, role: row.role },
          creds: new Map(),
        });
      }
      if (row.credential_type) {
        workerCredMap.get(row.user_id)!.creds.set(row.credential_type, row);
      }
    }

    // Matrix CSV: one row per worker, one column per credential type
    const matrixRows = Array.from(workerCredMap.values()).map(({ meta, creds }) => {
      const row: Record<string, string> = {
        Worker: `${meta.firstName} ${meta.lastName}`,
        Email: meta.email,
        Role: meta.role,
      };
      const now = new Date();
      let blockCount = 0;
      let warnCount = 0;

      for (const ct of credentialTypes) {
        const c = creds.get(ct);
        if (!c) {
          row[CRED_LABELS[ct]] = "MISSING";
          blockCount++;
        } else if (c.status === "expired" || c.status === "revoked") {
          row[CRED_LABELS[ct]] = `${c.status.toUpperCase()} (exp ${formatDate(c.expiration_date)})`;
          blockCount++;
        } else if (c.expiration_date) {
          const daysLeft = Math.ceil((new Date(c.expiration_date).getTime() - now.getTime()) / 86_400_000);
          if (daysLeft < 0) {
            row[CRED_LABELS[ct]] = `EXPIRED (${formatDate(c.expiration_date)})`;
            blockCount++;
          } else if (daysLeft < 30) {
            row[CRED_LABELS[ct]] = `EXPIRING SOON (${daysLeft}d)`;
            warnCount++;
          } else {
            row[CRED_LABELS[ct]] = `ACTIVE (exp ${formatDate(c.expiration_date)})`;
          }
        } else {
          row[CRED_LABELS[ct]] = c.status === "active" ? "ACTIVE" : c.status.toUpperCase();
        }
      }

      row["Deployment_Status"] = blockCount > 0 ? "BLOCKED" : warnCount > 0 ? "WARNING" : "ELIGIBLE";
      row["Block_Count"] = String(blockCount);
      row["Warning_Count"] = String(warnCount);
      return row;
    });

    addFile(trainingFolder, "worker_credentials_matrix.csv", toCsv(matrixRows));

    // Full credential detail JSON
    const credDetailJson = Array.from(workerCredMap.entries()).map(([uid, { meta, creds }]) => ({
      userId: uid,
      ...meta,
      credentials: Array.from(creds.values()).map((c) => ({
        type: c.credential_type,
        label: CRED_LABELS[c.credential_type] ?? c.credential_type,
        status: c.status,
        certificateNumber: c.certificate_number,
        issueDate: formatDate(c.issue_date),
        expirationDate: formatDate(c.expiration_date),
        issuedBy: c.issued_by,
      })),
    }));
    addFile(trainingFolder, "worker_credentials_full.json", JSON.stringify(credDetailJson, null, 2));

    // Eligibility report
    const eligibilityRows = matrixRows.map((r) => ({
      Worker: r["Worker"],
      Email: r["Email"],
      Role: r["Role"],
      Deployment_Status: r["Deployment_Status"],
      Block_Count: r["Block_Count"],
      Warning_Count: r["Warning_Count"],
    }));
    addFile(trainingFolder, "deployment_eligibility_report.csv", toCsv(eligibilityRows));

    // ── 8d. Overall summary CSV ──
    const overviewFolder = root.folder("OVERVIEW")!;
    const overviewRows = elementSummary.map((e) => ({
      Element_Code: e.element,
      IHSA_Element_Name: e.name,
      Compliance_Score: e.score,
      Status: e.score >= 80 ? "COMPLIANT" : e.score >= 60 ? "NEEDS_ATTENTION" : "NON_COMPLIANT",
      Total_Entries: e.totalEntries,
      Pass_Count: e.passCount,
      Fail_Count: e.failCount,
      Coverage: e.totalEntries > 0 ? "EVIDENCED" : "NO_EVIDENCE",
    }));
    addFile(overviewFolder, "element_scores_by_ihsa.csv", toCsv(overviewRows));
    addFile(overviewFolder, "element_scores_by_ihsa.json", JSON.stringify({
      generatedAt,
      label,
      company: company?.name,
      overallScore,
      elements: overviewRows,
    }, null, 2));

    // Voice logs master list
    if (voiceLogs.length > 0) {
      const vlAllRows = voiceLogs.map((v) => ({
        Log_ID: v.id,
        Date: formatDate(v.createdAt as Date),
        Project: v.projectName ?? "",
        Submitted_By: v.submitterFirst ? `${v.submitterFirst} ${v.submitterLast}` : "",
        IHSA_Element: v.ihsaElement ?? "",
        Risk_Level: v.riskLevel,
        Transcript: v.rawTranscript,
        Due_Date: formatDate(v.dueDate as string),
        Task_Created: v.correctedTaskId ? "Yes" : "No",
      }));
      addFile(overviewFolder, "all_voice_observations.csv", toCsv(vlAllRows));
    }

    // ── 8e. Tamper-evident generation log ──────────────────────────────────
    const logFolder = root.folder("00_VERIFICATION_LOG")!;

    // Build the chain log entries for this package generation
    const chainEntries: Record<string, unknown>[] = [];
    const prevHash = await getPrevChainHash(companyId);
    let runningHash = prevHash;

    const logEvents = [
      { type: "PACKAGE_GENERATION_STARTED", meta: { label, periodStart, periodEnd, totalAuditEntries: auditEntries.length } },
      { type: "AUDIT_TRAIL_COMPILED",       meta: { count: auditEntries.length, elementsCovered: elementSummary.filter(e => e.totalEntries > 0).length } },
      { type: "INSPECTIONS_COMPILED",       meta: { count: allInspections.length } },
      { type: "VOICE_LOGS_COMPILED",        meta: { count: voiceLogs.length } },
      { type: "TRAINING_MATRIX_COMPILED",   meta: { workerCount: workerSet.size } },
      { type: "PACKAGE_GENERATION_COMPLETE", meta: { overallScore, checksum: "PENDING" } },
    ];

    for (const evt of logEvents) {
      const payload = JSON.stringify({ eventType: evt.type, actorUserId: userId, metadata: evt.meta, createdAt: generatedAt });
      runningHash = crypto.createHash("sha256").update(runningHash + payload).digest("hex");
      chainEntries.push({ eventType: evt.type, chainHash: runningHash, metadata: evt.meta, timestamp: generatedAt });
    }

    const verificationLog = {
      packageName,
      genesisHashSeed: GENESIS_SEED,
      previousChainHash: prevHash,
      chainEntries,
      verificationInstructions: [
        "1. Starting from 'previousChainHash', compute SHA-256 of (prevHash + JSON.stringify(entry fields)) for each entry in order.",
        "2. Each computed hash must exactly match the 'chainHash' field of that entry.",
        "3. Any mismatch indicates the log has been altered.",
        "4. The genesis hash seed SITESNAP_COR_GENESIS_V1 is used as the initial prev hash if no prior entries exist.",
      ],
      generatedAt,
      generatedBy: actor ? `${actor.firstName} ${actor.lastName} <${actor.email}>` : `User #${userId}`,
    };
    addFile(logFolder, "generation_log.json", JSON.stringify(verificationLog, null, 2));

    // ── 8f. Manifest (checksums of all files) ──
    const manifestData = {
      packageName,
      generatedAt,
      algorithm: "SHA-256",
      files: fileChecksums,
    };
    const manifestContent = JSON.stringify(manifestData, null, 2);
    root.folder("00_VERIFICATION_LOG")!.file("manifest.json", manifestContent);
    const packageChecksum = crypto.createHash("sha256").update(manifestContent).digest("hex");

    // ── 9. Generate ZIP buffer ─────────────────────────────────────────────
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    // ── 10. Update package record ─────────────────────────────────────────
    await db
      .update(corAuditPackagesTable)
      .set({
        status: "ready",
        fileSizeBytes: zipBuffer.length,
        totalEntries: auditEntries.length,
        totalInspections: allInspections.length,
        totalWorkers: workerSet.size,
        elementSummary: elementSummary,
        checksum: packageChecksum,
        generatedAt: new Date(),
      })
      .where(eq(corAuditPackagesTable.id, packageId));

    // ── 11. Write tamper-evident log to DB ────────────────────────────────
    await appendAuditLogEntry({
      companyId,
      packageId,
      eventType: "PACKAGE_GENERATED",
      actorUserId: userId,
      entityType: "cor_audit_package",
      entityId: packageId,
      metadata: {
        label,
        overallScore,
        totalEntries: auditEntries.length,
        totalInspections: allInspections.length,
        totalWorkers: workerSet.size,
        checksum: packageChecksum,
        fileSizeBytes: zipBuffer.length,
      },
    });

    logger.info({ packageId, companyId, userId, totalEntries: auditEntries.length }, "COR audit package generated");

    return {
      packageId,
      label,
      generatedAt,
      totalEntries: auditEntries.length,
      totalInspections: allInspections.length,
      totalWorkers: workerSet.size,
      elementSummary,
      checksum: packageChecksum,
      fileSizeBytes: zipBuffer.length,
      zipBuffer,
    };
  } catch (err) {
    // Mark package as failed
    await db
      .update(corAuditPackagesTable)
      .set({ status: "failed", errorMessage: err instanceof Error ? err.message : "Unknown error" })
      .where(eq(corAuditPackagesTable.id, packageId));

    await appendAuditLogEntry({
      companyId,
      packageId,
      eventType: "PACKAGE_GENERATION_FAILED",
      actorUserId: userId,
      metadata: { error: err instanceof Error ? err.message : "Unknown" },
    });

    throw err;
  }
}

// ── Package history helper ────────────────────────────────────────────────────

export async function listAuditPackages(companyId: number) {
  return db
    .select({
      id: corAuditPackagesTable.id,
      label: corAuditPackagesTable.label,
      status: corAuditPackagesTable.status,
      periodStart: corAuditPackagesTable.periodStart,
      periodEnd: corAuditPackagesTable.periodEnd,
      fileSizeBytes: corAuditPackagesTable.fileSizeBytes,
      totalEntries: corAuditPackagesTable.totalEntries,
      totalInspections: corAuditPackagesTable.totalInspections,
      totalWorkers: corAuditPackagesTable.totalWorkers,
      checksum: corAuditPackagesTable.checksum,
      elementSummary: corAuditPackagesTable.elementSummary,
      generatedAt: corAuditPackagesTable.generatedAt,
      createdAt: corAuditPackagesTable.createdAt,
      generatedByFirst: usersTable.firstName,
      generatedByLast: usersTable.lastName,
    })
    .from(corAuditPackagesTable)
    .leftJoin(usersTable, eq(corAuditPackagesTable.generatedByUserId, usersTable.id))
    .where(eq(corAuditPackagesTable.companyId, companyId))
    .orderBy(desc(corAuditPackagesTable.createdAt))
    .limit(20);
}

export async function getPackageVerificationLog(companyId: number, packageId: number) {
  const entries = await db
    .select()
    .from(corAuditLogEntriesTable)
    .where(
      and(
        eq(corAuditLogEntriesTable.companyId, companyId),
        eq(corAuditLogEntriesTable.packageId, packageId),
      ),
    )
    .orderBy(corAuditLogEntriesTable.createdAt);

  return entries;
}
