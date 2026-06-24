import { db } from "@workspace/db";
import {
  workerCredentialsTable,
  corAuditTrailTable,
  corVoiceActionLogsTable,
  policyDocumentsTable,
  policySignoffsTable,
  subcontractorsTable,
  subcontractorDocsTable,
  capaTicketsTable,
  credentialAlertLogsTable,
  inspectionsTable,
  projectsTable,
  usersTable,
  userMembershipsTable,
  subscriptionsTable,
  plansTable,
  companiesTable,
  type InsertWorkerCredential,
  type InsertCorAuditTrail,
  type InsertCorVoiceActionLog,
  type WorkerCredential,
  type CorAuditTrail,
  type CorVoiceActionLog,
  type PolicyDocument,
  type PolicySignoff,
  type InsertPolicyDocument,
  type Subcontractor,
  type SubcontractorDoc,
  type InsertSubcontractor,
  type InsertSubcontractorDoc,
  type CapaTicket,
  type InsertCapaTicket,
  externalAuditorTokensTable,
  type ExternalAuditorToken,
} from "@workspace/db";
import { eq, and, sql, desc, asc, inArray, ne, gte, lte, or, isNull, gt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomBytes } from "crypto";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface BlockItem {
  credentialType: string;
  reason: "missing" | "expired";
  expiresAt?: string | null;
}

export interface WarningItem {
  credentialType: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export interface EligibilityResult {
  eligible: boolean;
  blocks: BlockItem[];
  warnings: WarningItem[];
}

interface WorkerRow {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface WorkerCredentialMatrixEntry {
  user: WorkerRow;
  credentials: WorkerCredential[];
}

export interface CorDashboard {
  overallScore: number;
  totalEntries: number;
  scoreByElement: Array<{
    ihsaElement: string;
    ihsaElementName: string;
    averageScore: number;
    entryCount: number;
    failCount: number;
  }>;
  recentFindings: CorAuditTrail[];
}

// ── Admin / Owner-Foreman queries ─────────────────────────────────────────────

export async function getProjectCorDashboard(
  companyId: number,
  projectId: number,
): Promise<CorDashboard> {
  const rows = await db
    .select({
      ihsaElement: corAuditTrailTable.ihsaElement,
      ihsaElementName: corAuditTrailTable.ihsaElementName,
      averageScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
      entryCount: sql<number>`COUNT(*)::int`,
      failCount: sql<number>`SUM(CASE WHEN ${corAuditTrailTable.findingType} = 'fail' THEN 1 ELSE 0 END)::int`,
    })
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.projectId, projectId),
      ),
    )
    .groupBy(corAuditTrailTable.ihsaElement, corAuditTrailTable.ihsaElementName)
    .orderBy(asc(corAuditTrailTable.ihsaElement));

  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const overallScore =
    totalEntries === 0
      ? 100
      : Math.round(rows.reduce((s, r) => s + r.averageScore * r.entryCount, 0) / totalEntries);

  const recentFindings = await db
    .select()
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.projectId, projectId),
      ),
    )
    .orderBy(desc(corAuditTrailTable.createdAt))
    .limit(10);

  return {
    overallScore,
    totalEntries,
    scoreByElement: rows,
    recentFindings,
  };
}

export async function getCompanyCorSummary(companyId: number) {
  return db
    .select({
      projectId: corAuditTrailTable.projectId,
      overallScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
      entryCount: sql<number>`COUNT(*)::int`,
    })
    .from(corAuditTrailTable)
    .where(eq(corAuditTrailTable.companyId, companyId))
    .groupBy(corAuditTrailTable.projectId)
    .orderBy(asc(corAuditTrailTable.projectId));
}

export async function getCorAuditTrail(
  companyId: number,
  projectId: number,
  opts: {
    limit?: number;
    offset?: number;
    ihsaElement?: string;
    findingType?: string;
  } = {},
): Promise<{ rows: CorAuditTrail[]; total: number }> {
  const { limit = 50, offset = 0, ihsaElement, findingType } = opts;

  const conditions = [
    eq(corAuditTrailTable.companyId, companyId),
    eq(corAuditTrailTable.projectId, projectId),
    ...(ihsaElement ? [eq(corAuditTrailTable.ihsaElement, ihsaElement as any)] : []),
    ...(findingType ? [eq(corAuditTrailTable.findingType, findingType)] : []),
  ];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(corAuditTrailTable)
      .where(and(...conditions))
      .orderBy(desc(corAuditTrailTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(corAuditTrailTable)
      .where(and(...conditions)),
  ]);

  return { rows, total };
}

export async function getWorkerCredentialMatrix(
  companyId: number,
): Promise<WorkerCredentialMatrixEntry[]> {
  // Single query: all members of the company with a left-join on credentials
  const rows = await db
    .select({
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      credential: workerCredentialsTable,
    })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(userMembershipsTable.userId, usersTable.id))
    .leftJoin(
      workerCredentialsTable,
      and(
        eq(workerCredentialsTable.userId, usersTable.id),
        eq(workerCredentialsTable.companyId, companyId),
      ),
    )
    .where(eq(userMembershipsTable.companyId, companyId))
    .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));

  // Group into per-worker entries in memory (avoids N+1)
  const map = new Map<number, WorkerCredentialMatrixEntry>();
  for (const row of rows) {
    if (!map.has(row.userId)) {
      map.set(row.userId, {
        user: { id: row.userId, firstName: row.firstName, lastName: row.lastName, email: row.email },
        credentials: [],
      });
    }
    if (row.credential?.id) {
      map.get(row.userId)!.credentials.push(row.credential as WorkerCredential);
    }
  }

  return Array.from(map.values());
}

export async function getCredentialsForUser(
  companyId: number,
  userId: number,
): Promise<WorkerCredential[]> {
  return db
    .select()
    .from(workerCredentialsTable)
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        eq(workerCredentialsTable.userId, userId),
      ),
    )
    .orderBy(asc(workerCredentialsTable.credentialType));
}

export async function upsertWorkerCredential(
  data: InsertWorkerCredential,
): Promise<WorkerCredential> {
  const [row] = await db
    .insert(workerCredentialsTable)
    .values(data)
    .onConflictDoUpdate({
      target: [
        workerCredentialsTable.companyId,
        workerCredentialsTable.userId,
        workerCredentialsTable.credentialType,
      ],
      set: {
        certificateNumber: data.certificateNumber,
        issueDate: data.issueDate,
        expirationDate: data.expirationDate,
        status: data.status,
        documentUrl: data.documentUrl,
        issuedBy: data.issuedBy,
        notes: data.notes,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function checkWorkerDeploymentEligibility(
  companyId: number,
  userId: number,
  requiredCredentials: string[],
): Promise<EligibilityResult> {
  if (requiredCredentials.length === 0) {
    return { eligible: true, blocks: [], warnings: [] };
  }

  const credentials = await db
    .select()
    .from(workerCredentialsTable)
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        eq(workerCredentialsTable.userId, userId),
        inArray(workerCredentialsTable.credentialType, requiredCredentials as any[]),
      ),
    );

  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const blocks: BlockItem[] = [];
  const warnings: WarningItem[] = [];

  for (const required of requiredCredentials) {
    const cred = credentials.find((c) => c.credentialType === required);

    if (!cred || cred.status === "revoked") {
      blocks.push({ credentialType: required, reason: "missing" });
      continue;
    }

    if (cred.status === "expired") {
      blocks.push({
        credentialType: required,
        reason: "expired",
        expiresAt: cred.expirationDate,
      });
      continue;
    }

    if (cred.expirationDate) {
      const expiryDate = new Date(cred.expirationDate);
      const msUntilExpiry = expiryDate.getTime() - now.getTime();
      if (msUntilExpiry < 0) {
        blocks.push({
          credentialType: required,
          reason: "expired",
          expiresAt: cred.expirationDate,
        });
      } else if (msUntilExpiry < thirtyDaysMs) {
        warnings.push({
          credentialType: required,
          expiresAt: cred.expirationDate,
          daysUntilExpiry: Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  return {
    eligible: blocks.length === 0,
    blocks,
    warnings,
  };
}

export async function getVoiceLogsForProject(
  companyId: number,
  projectId: number,
): Promise<CorVoiceActionLog[]> {
  return db
    .select()
    .from(corVoiceActionLogsTable)
    .where(
      and(
        eq(corVoiceActionLogsTable.companyId, companyId),
        eq(corVoiceActionLogsTable.projectId, projectId),
      ),
    )
    .orderBy(desc(corVoiceActionLogsTable.createdAt));
}

// ── Worker self-scoped queries ─────────────────────────────────────────────────

export async function getMyCorAuditEntries(
  companyId: number,
  userId: number,
): Promise<CorAuditTrail[]> {
  return db
    .select()
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.submittedByUserId, userId),
      ),
    )
    .orderBy(desc(corAuditTrailTable.createdAt))
    .limit(100);
}

export async function getMyCredentials(
  companyId: number,
  userId: number,
): Promise<WorkerCredential[]> {
  return getCredentialsForUser(companyId, userId);
}

export async function getMyVoiceLogs(
  companyId: number,
  userId: number,
): Promise<CorVoiceActionLog[]> {
  return db
    .select()
    .from(corVoiceActionLogsTable)
    .where(
      and(
        eq(corVoiceActionLogsTable.companyId, companyId),
        eq(corVoiceActionLogsTable.submittedByUserId, userId),
      ),
    )
    .orderBy(desc(corVoiceActionLogsTable.createdAt));
}

// ── Shared write ──────────────────────────────────────────────────────────────

export async function upsertCorAuditEntry(
  data: InsertCorAuditTrail,
): Promise<CorAuditTrail> {
  const [row] = await db
    .insert(corAuditTrailTable)
    .values(data)
    .onConflictDoUpdate({
      target: [
        corAuditTrailTable.companyId,
        corAuditTrailTable.sourceType,
        corAuditTrailTable.sourceRecordId,
        corAuditTrailTable.ihsaElement,
      ],
      set: {
        findingType: data.findingType,
        findingDescription: data.findingDescription,
        complianceScore: data.complianceScore,
        evidenceSnapshot: data.evidenceSnapshot,
        submittedByUserId: data.submittedByUserId,
        createdAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function createVoiceActionLog(
  data: InsertCorVoiceActionLog,
): Promise<CorVoiceActionLog> {
  const [row] = await db.insert(corVoiceActionLogsTable).values(data).returning();
  return row;
}

// ── Plan / feature helpers ────────────────────────────────────────────────────

export async function isEnterprisePlanWithCorModule(companyId: number): Promise<boolean> {
  const [row] = await db
    .select({
      planSlug: plansTable.slug,
      activeFeatures: companiesTable.activeFeatures,
    })
    .from(subscriptionsTable)
    .innerJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
    .innerJoin(companiesTable, eq(companiesTable.id, companyId))
    .where(eq(subscriptionsTable.companyId, companyId))
    .limit(1);

  if (!row) return false;
  const isEnterprise = row.planSlug === "enterprise";
  const hasFlag = row.activeFeatures?.includes("COR_MODULE") ?? false;
  return isEnterprise && hasFlag;
}

export async function hasCorModuleFeature(companyId: number): Promise<boolean> {
  const [row] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  return row?.activeFeatures?.includes("COR_MODULE") ?? false;
}

// ── Policy Documents ──────────────────────────────────────────────────────────

export async function listPolicyDocuments(
  companyId: number,
  includeInactive = false,
): Promise<PolicyDocument[]> {
  const conditions = includeInactive
    ? [eq(policyDocumentsTable.companyId, companyId)]
    : [eq(policyDocumentsTable.companyId, companyId), eq(policyDocumentsTable.isActive, true)];

  return db
    .select()
    .from(policyDocumentsTable)
    .where(and(...conditions))
    .orderBy(asc(policyDocumentsTable.documentType), asc(policyDocumentsTable.title));
}

export async function createPolicyDocument(
  data: InsertPolicyDocument,
): Promise<PolicyDocument> {
  const [row] = await db.insert(policyDocumentsTable).values(data).returning();
  return row;
}

export async function archivePolicyDocument(
  companyId: number,
  id: number,
): Promise<PolicyDocument | null> {
  const [row] = await db
    .update(policyDocumentsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(policyDocumentsTable.companyId, companyId), eq(policyDocumentsTable.id, id)))
    .returning();
  return row ?? null;
}

// ── Policy Sign-offs ──────────────────────────────────────────────────────────

export interface SignoffWithDoc extends PolicySignoff {
  document: PolicyDocument;
  workerName: string;
  workerEmail: string;
}

export interface SignoffMatrixEntry {
  document: PolicyDocument;
  signoffs: Array<{
    userId: number;
    firstName: string;
    lastName: string;
    email: string;
    signedAt: string | null;
    isValid: boolean | null;
  }>;
  signedCount: number;
  totalWorkers: number;
  compliancePercent: number;
}

export async function signPolicyDocument(opts: {
  companyId: number;
  policyDocumentId: number;
  workerUserId: number;
  ipAddress?: string;
  userAgent?: string;
  signatureData?: string;
}): Promise<PolicySignoff> {
  const [row] = await db
    .insert(policySignoffsTable)
    .values({
      companyId: opts.companyId,
      policyDocumentId: opts.policyDocumentId,
      workerUserId: opts.workerUserId,
      signedAt: new Date(),
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      signatureData: opts.signatureData,
      isValid: true,
    })
    .onConflictDoUpdate({
      target: [policySignoffsTable.policyDocumentId, policySignoffsTable.workerUserId],
      set: {
        signedAt: new Date(),
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        signatureData: opts.signatureData,
        isValid: true,
      },
    })
    .returning();
  return row;
}

export async function getSignoffMatrix(companyId: number): Promise<SignoffMatrixEntry[]> {
  // All active documents for the company
  const docs = await listPolicyDocuments(companyId);
  if (!docs.length) return [];

  // All company members
  const members = await db
    .select({
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(userMembershipsTable.userId, usersTable.id))
    .where(eq(userMembershipsTable.companyId, companyId))
    .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));

  // All valid signoffs for this company
  const allSignoffs = await db
    .select()
    .from(policySignoffsTable)
    .where(
      and(
        eq(policySignoffsTable.companyId, companyId),
        eq(policySignoffsTable.isValid, true),
      ),
    );

  return docs.map((doc) => {
    const signedSet = new Map(
      allSignoffs
        .filter((s) => s.policyDocumentId === doc.id)
        .map((s) => [s.workerUserId, s]),
    );

    const entries = members.map((m) => {
      const signoff = signedSet.get(m.userId);
      return {
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        signedAt: signoff ? signoff.signedAt.toISOString() : null,
        isValid: signoff ? signoff.isValid : null,
      };
    });

    const signedCount = entries.filter((e) => e.signedAt !== null).length;

    return {
      document: doc,
      signoffs: entries,
      signedCount,
      totalWorkers: members.length,
      compliancePercent: members.length === 0 ? 100 : Math.round((signedCount / members.length) * 100),
    };
  });
}

export async function getMyPendingSignoffs(
  companyId: number,
  userId: number,
): Promise<PolicyDocument[]> {
  const activeDocs = await listPolicyDocuments(companyId);
  if (!activeDocs.length) return [];

  const signed = await db
    .select({
      docId: policySignoffsTable.policyDocumentId,
      signedAt: policySignoffsTable.signedAt,
    })
    .from(policySignoffsTable)
    .where(
      and(
        eq(policySignoffsTable.companyId, companyId),
        eq(policySignoffsTable.workerUserId, userId),
        eq(policySignoffsTable.isValid, true),
      ),
    );

  const signedMap = new Map(signed.map((s) => [s.docId, s.signedAt]));
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return activeDocs.filter((d) => {
    const signedAt = signedMap.get(d.id);
    if (!signedAt) return true; // never signed
    if (d.requiresAnnualRenewal && signedAt < oneYearAgo) return true; // renewal due
    return false;
  });
}

export async function getMySignoffs(
  companyId: number,
  userId: number,
): Promise<Array<{ signoff: PolicySignoff; document: PolicyDocument }>> {
  const rows = await db
    .select({
      signoff: policySignoffsTable,
      document: policyDocumentsTable,
    })
    .from(policySignoffsTable)
    .innerJoin(
      policyDocumentsTable,
      eq(policySignoffsTable.policyDocumentId, policyDocumentsTable.id),
    )
    .where(
      and(
        eq(policySignoffsTable.companyId, companyId),
        eq(policySignoffsTable.workerUserId, userId),
        eq(policySignoffsTable.isValid, true),
      ),
    )
    .orderBy(desc(policySignoffsTable.signedAt));

  return rows;
}

export async function getPolicySignoffSummary(
  companyId: number,
): Promise<{ totalDocs: number; signedAllCount: number; totalWorkers: number; overallPercent: number }> {
  const matrix = await getSignoffMatrix(companyId);
  if (!matrix.length) {
    return { totalDocs: 0, signedAllCount: 0, totalWorkers: 0, overallPercent: 100 };
  }
  const totalWorkers = matrix[0]?.totalWorkers ?? 0;

  // Count workers who have signed every document
  const signedAllCount = totalWorkers === 0 ? 0 : (() => {
    const allUserIds = matrix[0]?.signoffs.map((s) => s.userId) ?? [];
    return allUserIds.filter((uid) =>
      matrix.every((m) => m.signoffs.find((s) => s.userId === uid)?.signedAt !== null)
    ).length;
  })();

  const avgPercent = Math.round(
    matrix.reduce((s, m) => s + m.compliancePercent, 0) / matrix.length
  );

  return { totalDocs: matrix.length, signedAllCount, totalWorkers, overallPercent: avgPercent };
}

// Returns sign-off compliance aggregated per IHSA element — used to link
// worker acknowledgements as verifiable evidence on the COR element dashboard.
export interface SignoffElementEntry {
  ihsaElement: string;
  documentCount: number;
  avgCompliancePercent: number;
  lowestCompliancePercent: number;
  signedCount: number;
  totalWorkers: number;
}

export async function getSignoffElementCompliance(
  companyId: number,
): Promise<SignoffElementEntry[]> {
  const matrix = await getSignoffMatrix(companyId);
  if (!matrix.length) return [];

  const byElement = new Map<string, { pcts: number[]; signedSum: number; workers: number }>();
  for (const m of matrix) {
    const el = m.document.ihsaElement;
    if (!byElement.has(el)) byElement.set(el, { pcts: [], signedSum: 0, workers: m.totalWorkers });
    const entry = byElement.get(el)!;
    entry.pcts.push(m.compliancePercent);
    entry.signedSum += m.signedCount;
    entry.workers = Math.max(entry.workers, m.totalWorkers);
  }

  return Array.from(byElement.entries()).map(([element, { pcts, signedSum, workers }]) => ({
    ihsaElement: element,
    documentCount: pcts.length,
    avgCompliancePercent: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
    lowestCompliancePercent: Math.min(...pcts),
    signedCount: signedSum,
    totalWorkers: workers,
  }));
}

// ── Subcontractor Compliance ──────────────────────────────────────────────────

export interface SubcontractorWithDocs extends Subcontractor {
  docs: SubcontractorDoc[];
}

async function recomputeSubcontractorStatus(subcontractorId: number): Promise<void> {
  const docs = await db
    .select()
    .from(subcontractorDocsTable)
    .where(eq(subcontractorDocsTable.subcontractorId, subcontractorId));

  const today = new Date().toISOString().split("T")[0]!;

  // Auto-expire docs whose expiry date has passed
  for (const doc of docs) {
    if (doc.expiryDate && doc.expiryDate < today && doc.docStatus === "valid") {
      await db
        .update(subcontractorDocsTable)
        .set({ docStatus: "expired", updatedAt: new Date() })
        .where(eq(subcontractorDocsTable.id, doc.id));
      doc.docStatus = "expired";
    }
  }

  const getDoc = (type: string) => docs.find((d) => d.docType === type);
  const wsib = getDoc("wsib_clearance");
  const insurance = getDoc("insurance_certificate");

  let newStatus: "compliant" | "non_compliant" | "expired" | "pending";

  if (docs.length === 0) {
    newStatus = "pending";
  } else if (wsib?.docStatus === "expired" || insurance?.docStatus === "expired") {
    newStatus = "expired";
  } else if (
    !wsib || wsib.docStatus === "rejected" || wsib.docStatus === "pending" ||
    !insurance || insurance.docStatus === "rejected" || insurance.docStatus === "pending"
  ) {
    newStatus = "non_compliant";
  } else {
    newStatus = "compliant";
  }

  await db
    .update(subcontractorsTable)
    .set({ overallStatus: newStatus, lastReviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(subcontractorsTable.id, subcontractorId));
}

export async function listSubcontractors(companyId: number): Promise<SubcontractorWithDocs[]> {
  const subs = await db
    .select()
    .from(subcontractorsTable)
    .where(eq(subcontractorsTable.companyId, companyId))
    .orderBy(asc(subcontractorsTable.companyName));

  if (!subs.length) return [];

  const docs = await db
    .select()
    .from(subcontractorDocsTable)
    .where(eq(subcontractorDocsTable.companyId, companyId))
    .orderBy(asc(subcontractorDocsTable.docType));

  const docsBySub = new Map<number, SubcontractorDoc[]>();
  for (const doc of docs) {
    const arr = docsBySub.get(doc.subcontractorId) ?? [];
    arr.push(doc);
    docsBySub.set(doc.subcontractorId, arr);
  }

  return subs.map((s) => ({ ...s, docs: docsBySub.get(s.id) ?? [] }));
}

export async function createSubcontractor(data: InsertSubcontractor): Promise<Subcontractor> {
  const [row] = await db.insert(subcontractorsTable).values(data).returning();
  return row;
}

export async function updateSubcontractor(
  companyId: number,
  id: number,
  data: Partial<Pick<InsertSubcontractor, "companyName" | "contactName" | "contactEmail" | "contactPhone" | "tradeType" | "notes" | "invitedAt">>,
): Promise<Subcontractor | null> {
  const [row] = await db
    .update(subcontractorsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(subcontractorsTable.companyId, companyId), eq(subcontractorsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteSubcontractor(companyId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(subcontractorsTable)
    .where(and(eq(subcontractorsTable.companyId, companyId), eq(subcontractorsTable.id, id)));
  return (result.rowCount ?? 0) > 0;
}

export async function upsertSubcontractorDoc(data: InsertSubcontractorDoc): Promise<SubcontractorDoc> {
  const [row] = await db
    .insert(subcontractorDocsTable)
    .values(data)
    .onConflictDoUpdate({
      target: [subcontractorDocsTable.subcontractorId, subcontractorDocsTable.docType],
      set: {
        docStatus: data.docStatus,
        documentUrl: data.documentUrl,
        issueDate: data.issueDate,
        expiryDate: data.expiryDate,
        notes: data.notes,
        updatedAt: new Date(),
      },
    })
    .returning();

  await recomputeSubcontractorStatus(data.subcontractorId);
  return row;
}

export async function deleteSubcontractorDoc(
  companyId: number,
  subcontractorId: number,
  docId: number,
): Promise<boolean> {
  const result = await db
    .delete(subcontractorDocsTable)
    .where(
      and(
        eq(subcontractorDocsTable.companyId, companyId),
        eq(subcontractorDocsTable.subcontractorId, subcontractorId),
        eq(subcontractorDocsTable.id, docId),
      ),
    );
  await recomputeSubcontractorStatus(subcontractorId);
  return (result.rowCount ?? 0) > 0;
}

export async function getFlaggedSubcontractors(companyId: number): Promise<Subcontractor[]> {
  return db
    .select()
    .from(subcontractorsTable)
    .where(
      and(
        eq(subcontractorsTable.companyId, companyId),
        ne(subcontractorsTable.overallStatus, "compliant"),
        ne(subcontractorsTable.overallStatus, "pending"),
      ),
    )
    .orderBy(asc(subcontractorsTable.overallStatus), asc(subcontractorsTable.companyName));
}

export async function getSubcontractorSummary(
  companyId: number,
): Promise<{ total: number; compliant: number; expired: number; nonCompliant: number; pending: number }> {
  const rows = await db
    .select({
      status: subcontractorsTable.overallStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(subcontractorsTable)
    .where(eq(subcontractorsTable.companyId, companyId))
    .groupBy(subcontractorsTable.overallStatus);

  const counts = { total: 0, compliant: 0, expired: 0, nonCompliant: 0, pending: 0 };
  for (const row of rows) {
    const n = row.count;
    counts.total += n;
    if (row.status === "compliant") counts.compliant += n;
    else if (row.status === "expired") counts.expired += n;
    else if (row.status === "non_compliant") counts.nonCompliant += n;
    else if (row.status === "pending") counts.pending += n;
  }
  return counts;
}

// ── CAPA Tickets ──────────────────────────────────────────────────────────────

const assignedUserAlias = alias(usersTable, "assigned_user");
const createdByUserAlias = alias(usersTable, "created_by_user");

export interface CapaWithDetails extends CapaTicket {
  assignedToName: string | null;
  createdByName: string | null;
}

export async function listCapaTickets(
  companyId: number,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ data: CapaWithDetails[]; total: number }> {
  const conditions = [eq(capaTicketsTable.companyId, companyId)];
  if (opts.status && opts.status !== "all") {
    conditions.push(sql`${capaTicketsTable.status} = ${opts.status}`);
  }

  const where = and(...conditions);
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(capaTicketsTable)
    .where(where);

  const rows = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      createdByName: sql<string | null>`
        CASE WHEN ${createdByUserAlias.id} IS NOT NULL
          THEN ${createdByUserAlias.firstName} || ' ' || ${createdByUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(createdByUserAlias, eq(capaTicketsTable.createdByUserId, createdByUserAlias.id))
    .where(where)
    .orderBy(desc(capaTicketsTable.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return {
    data: rows.map((r) => ({ ...r.ticket, assignedToName: r.assignedToName, createdByName: r.createdByName })),
    total: totalRow?.count ?? 0,
  };
}

export async function getCapaTicket(
  companyId: number,
  id: number,
): Promise<CapaWithDetails | null> {
  const [row] = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      createdByName: sql<string | null>`
        CASE WHEN ${createdByUserAlias.id} IS NOT NULL
          THEN ${createdByUserAlias.firstName} || ' ' || ${createdByUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(createdByUserAlias, eq(capaTicketsTable.createdByUserId, createdByUserAlias.id))
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!row) return null;
  return { ...row.ticket, assignedToName: row.assignedToName, createdByName: row.createdByName };
}

export async function createCapaTicket(data: InsertCapaTicket): Promise<CapaTicket> {
  const [row] = await db.insert(capaTicketsTable).values(data).returning();
  return row;
}

export async function updateCapaTicket(
  companyId: number,
  id: number,
  data: Partial<Pick<InsertCapaTicket, "title" | "description" | "priority" | "status" | "assignedToUserId" | "dueDate" | "ihsaElement">>,
): Promise<CapaTicket | null> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return null;

  const [row] = await db
    .update(capaTicketsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function closeCapaTicket(
  companyId: number,
  id: number,
  opts: { closedByUserId: number; closureNotes: string; evidencePhotoUrl?: string },
): Promise<CapaTicket | null> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return null;

  const [row] = await db
    .update(capaTicketsTable)
    .set({
      status: "closed",
      isLocked: true,
      closedAt: new Date(),
      closedByUserId: opts.closedByUserId,
      closureNotes: opts.closureNotes,
      evidencePhotoUrl: opts.evidencePhotoUrl ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function voidCapaTicket(companyId: number, id: number): Promise<boolean> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return false;

  const result = await db
    .update(capaTicketsTable)
    .set({ status: "void", updatedAt: new Date() })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  return (result.rowCount ?? 0) > 0;
}

export async function maybeAutoCreateCapa(auditEntry: CorAuditTrail): Promise<CapaTicket | null> {
  if (auditEntry.findingType !== "fail") return null;
  // Inspections get per-item CAPAs created directly in the inspections route — skip here
  if (auditEntry.sourceType === "inspection") return null;

  // Idempotent — skip if a CAPA already exists for this audit entry (non-item CAPAs have null sourceItemRef)
  const [existing] = await db
    .select({ id: capaTicketsTable.id })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, auditEntry.companyId),
        sql`${capaTicketsTable.sourceType} = ${auditEntry.sourceType}`,
        eq(capaTicketsTable.sourceRecordId, auditEntry.id),
        isNull(capaTicketsTable.sourceItemRef),
      ),
    )
    .limit(1);

  if (existing) return null;

  const score = auditEntry.complianceScore;
  const priority: InsertCapaTicket["priority"] =
    score < 25 ? "critical" : score < 50 ? "high" : score < 75 ? "medium" : "low";

  const title = `[FAIL] ${auditEntry.ihsaElementName} — ${auditEntry.findingDescription.slice(0, 80)}${auditEntry.findingDescription.length > 80 ? "…" : ""}`;

  return createCapaTicket({
    companyId: auditEntry.companyId,
    projectId: auditEntry.projectId,
    title,
    description: auditEntry.findingDescription,
    sourceType: "audit_trail",
    sourceRecordId: auditEntry.id,
    ihsaElement: auditEntry.ihsaElement,
    priority,
    status: "open",
    createdByUserId: auditEntry.submittedByUserId ?? undefined,
  });
}

export async function getCapaSummary(companyId: number): Promise<{
  open: number;
  inProgress: number;
  pendingReview: number;
  closed: number;
  overdue: number;
}> {
  const today = new Date().toISOString().split("T")[0]!;

  const rows = await db
    .select({
      status: capaTicketsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(capaTicketsTable)
    .where(eq(capaTicketsTable.companyId, companyId))
    .groupBy(capaTicketsTable.status);

  const overdueRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        sql`${capaTicketsTable.status} IN ('open', 'in_progress', 'pending_review')`,
        sql`${capaTicketsTable.dueDate} IS NOT NULL AND ${capaTicketsTable.dueDate} < ${today}`,
      ),
    );

  const result = { open: 0, inProgress: 0, pendingReview: 0, closed: 0, overdue: overdueRows[0]?.count ?? 0 };
  for (const row of rows) {
    if (row.status === "open") result.open = row.count;
    else if (row.status === "in_progress") result.inProgress = row.count;
    else if (row.status === "pending_review") result.pendingReview = row.count;
    else if (row.status === "closed") result.closed = row.count;
  }
  return result;
}

// ── Credential Expiry Alerts ──────────────────────────────────────────────────

export interface ExpiringCredential {
  credentialId: number;
  companyId: number;
  userId: number;
  credentialType: string;
  expirationDate: string;
  daysRemaining: number;
  workerFirstName: string;
  workerLastName: string;
  workerEmail: string;
  companyResendApiKey: string | null;
  companyDigestFromEmail: string | null;
}

export async function getExpiringSoonCredentials(
  dayMin: number,
  dayMax: number,
): Promise<ExpiringCredential[]> {
  const today = new Date();
  const minDate = new Date(today.getTime() + dayMin * 86400000).toISOString().split("T")[0]!;
  const maxDate = new Date(today.getTime() + dayMax * 86400000).toISOString().split("T")[0]!;
  const todayStr = today.toISOString().split("T")[0]!;

  const rows = await db
    .select({
      credentialId: workerCredentialsTable.id,
      companyId: workerCredentialsTable.companyId,
      userId: workerCredentialsTable.userId,
      credentialType: workerCredentialsTable.credentialType,
      expirationDate: workerCredentialsTable.expirationDate,
      workerFirstName: usersTable.firstName,
      workerLastName: usersTable.lastName,
      workerEmail: usersTable.email,
      companyResendApiKey: companiesTable.resendApiKey,
      companyDigestFromEmail: companiesTable.digestFromEmail,
    })
    .from(workerCredentialsTable)
    .innerJoin(usersTable, eq(workerCredentialsTable.userId, usersTable.id))
    .innerJoin(companiesTable, eq(workerCredentialsTable.companyId, companiesTable.id))
    .where(
      and(
        sql`${workerCredentialsTable.status} = 'active'`,
        sql`${workerCredentialsTable.expirationDate} >= ${minDate}`,
        sql`${workerCredentialsTable.expirationDate} <= ${maxDate}`,
      ),
    );

  return rows.map((r) => {
    const expiry = new Date(r.expirationDate as string);
    const todayD = new Date(todayStr);
    const daysRemaining = Math.ceil((expiry.getTime() - todayD.getTime()) / 86400000);
    return {
      credentialId: r.credentialId,
      companyId: r.companyId,
      userId: r.userId,
      credentialType: r.credentialType,
      expirationDate: r.expirationDate as string,
      daysRemaining,
      workerFirstName: r.workerFirstName,
      workerLastName: r.workerLastName,
      workerEmail: r.workerEmail,
      companyResendApiKey: r.companyResendApiKey,
      companyDigestFromEmail: r.companyDigestFromEmail,
    };
  });
}

export async function getCompanyExpiringSoonCredentials(
  companyId: number,
  maxDays = 65,
): Promise<Array<ExpiringCredential & { alertWindow: "30_day" | "60_day" | "expired" | "ok" }>> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const maxDate = new Date(today.getTime() + maxDays * 86400000).toISOString().split("T")[0]!;

  const rows = await db
    .select({
      credentialId: workerCredentialsTable.id,
      companyId: workerCredentialsTable.companyId,
      userId: workerCredentialsTable.userId,
      credentialType: workerCredentialsTable.credentialType,
      expirationDate: workerCredentialsTable.expirationDate,
      workerFirstName: usersTable.firstName,
      workerLastName: usersTable.lastName,
      workerEmail: usersTable.email,
      companyResendApiKey: companiesTable.resendApiKey,
      companyDigestFromEmail: companiesTable.digestFromEmail,
    })
    .from(workerCredentialsTable)
    .innerJoin(usersTable, eq(workerCredentialsTable.userId, usersTable.id))
    .innerJoin(companiesTable, eq(workerCredentialsTable.companyId, companiesTable.id))
    .where(
      and(
        eq(workerCredentialsTable.companyId, companyId),
        sql`${workerCredentialsTable.status} IN ('active', 'expired')`,
        sql`${workerCredentialsTable.expirationDate} IS NOT NULL`,
        sql`${workerCredentialsTable.expirationDate} <= ${maxDate}`,
      ),
    )
    .orderBy(asc(workerCredentialsTable.expirationDate));

  return rows.map((r) => {
    const expiry = new Date(r.expirationDate as string);
    const daysRemaining = Math.ceil((expiry.getTime() - new Date(todayStr).getTime()) / 86400000);
    let alertWindow: "30_day" | "60_day" | "expired" | "ok";
    if (daysRemaining < 0) alertWindow = "expired";
    else if (daysRemaining <= 30) alertWindow = "30_day";
    else if (daysRemaining <= 60) alertWindow = "60_day";
    else alertWindow = "ok";

    return {
      credentialId: r.credentialId,
      companyId: r.companyId,
      userId: r.userId,
      credentialType: r.credentialType,
      expirationDate: r.expirationDate as string,
      daysRemaining,
      alertWindow,
      workerFirstName: r.workerFirstName,
      workerLastName: r.workerLastName,
      workerEmail: r.workerEmail,
      companyResendApiKey: r.companyResendApiKey,
      companyDigestFromEmail: r.companyDigestFromEmail,
    };
  });
}

export async function getCompanySafetyManagerEmails(companyId: number): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(userMembershipsTable.userId, usersTable.id))
    .where(
      and(
        eq(userMembershipsTable.companyId, companyId),
        sql`${userMembershipsTable.role} IN ('owner', 'foreman')`,
      ),
    );
  return rows.map((r) => r.email).filter(Boolean);
}

export async function hasCredentialAlertBeenSent(opts: {
  companyId: number;
  userId: number;
  credentialType: string;
  alertType: string;
  sentForExpiry: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: credentialAlertLogsTable.id })
    .from(credentialAlertLogsTable)
    .where(
      and(
        eq(credentialAlertLogsTable.companyId, opts.companyId),
        eq(credentialAlertLogsTable.userId, opts.userId),
        eq(credentialAlertLogsTable.credentialType, opts.credentialType),
        eq(credentialAlertLogsTable.alertType, opts.alertType),
        eq(credentialAlertLogsTable.sentForExpiry, opts.sentForExpiry),
      ),
    )
    .limit(1);
  return !!row;
}

export async function recordCredentialAlert(opts: {
  companyId: number;
  userId: number;
  credentialType: string;
  alertType: string;
  sentForExpiry: string;
  sentToEmail: string;
}): Promise<void> {
  await db
    .insert(credentialAlertLogsTable)
    .values(opts)
    .onConflictDoNothing();
}

// ── Inspection → CAPA bridge ──────────────────────────────────────────────────

const SEVERITY_TO_PRIORITY: Record<string, InsertCapaTicket["priority"]> = {
  high: "critical",
  medium: "high",
  low: "medium",
};

// IHSA element default by inspection type — used for per-item CAPAs
const INSPECTION_TYPE_IHSA: Record<string, string> = {
  safety:        "element_2",  // Hazard ID & Assessment
  general:       "element_4",  // Ongoing Inspections
  quality:       "element_4",
  progress:      "element_4",
  structural:    "element_4",
  electrical:    "element_12", // Safety Equipment
  fire:          "element_13", // Fire Safety
  environmental: "element_11", // Environmental Protection
};

export async function createCapasFromInspectionItems(
  inspection: {
    id: number;
    companyId: number;
    projectId: number | null;
    inspectorId: number;
    inspectionType: string;
    date: string;
  },
  failedItems: Array<{ itemName: string; severity: string; comment?: string | null }>,
): Promise<CapaTicket[]> {
  if (!failedItems.length) return [];

  // Batch-check which items already have a CAPA
  const existing = await db
    .select({ sourceItemRef: capaTicketsTable.sourceItemRef })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, inspection.companyId),
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        eq(capaTicketsTable.sourceRecordId, inspection.id),
      ),
    );

  const existingRefs = new Set(existing.map((r) => r.sourceItemRef).filter(Boolean));
  const toCreate = failedItems.filter((item) => !existingRefs.has(item.itemName));
  if (!toCreate.length) return [];

  const defaultElement = INSPECTION_TYPE_IHSA[inspection.inspectionType] ?? "element_4";
  const inspTypeLabel = inspection.inspectionType.replace(/_/g, " ");

  const values: InsertCapaTicket[] = toCreate.map((item) => ({
    companyId: inspection.companyId,
    projectId: inspection.projectId ?? undefined,
    title: `[INSPECTION FAIL] ${item.itemName}`,
    description: `${inspTypeLabel.charAt(0).toUpperCase() + inspTypeLabel.slice(1)} inspection on ${inspection.date}: "${item.itemName}" failed.${item.comment ? ` Notes: ${item.comment}` : ""}`,
    sourceType: "inspection" as const,
    sourceRecordId: inspection.id,
    sourceItemRef: item.itemName,
    ihsaElement: defaultElement as InsertCapaTicket["ihsaElement"],
    priority: SEVERITY_TO_PRIORITY[item.severity] ?? "medium",
    status: "open" as const,
    createdByUserId: inspection.inspectorId,
  }));

  const rows = await db.insert(capaTicketsTable).values(values).returning();
  return rows;
}

// ── Action Required queue (open inspection CAPAs) ─────────────────────────────

export interface ActionRequiredCapa extends CapaWithDetails {
  inspectionType: string | null;
  inspectionDate: string | null;
  projectName: string | null;
  sourceItemRef: string | null;
}

export async function getActionRequiredCapas(companyId: number): Promise<ActionRequiredCapa[]> {
  const rows = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      inspectionType: inspectionsTable.inspectionType,
      inspectionDate: inspectionsTable.date,
      projectName: projectsTable.name,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(
      inspectionsTable,
      and(
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        eq(capaTicketsTable.sourceRecordId, inspectionsTable.id),
      ),
    )
    .leftJoin(projectsTable, eq(capaTicketsTable.projectId, projectsTable.id))
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        sql`${capaTicketsTable.status} IN ('open', 'in_progress', 'pending_review')`,
      ),
    )
    .orderBy(
      sql`CASE ${capaTicketsTable.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      asc(capaTicketsTable.dueDate),
      desc(capaTicketsTable.createdAt),
    );

  return rows.map((r) => ({
    ...r.ticket,
    assignedToName: r.assignedToName,
    createdByName: null,
    inspectionType: r.inspectionType ?? null,
    inspectionDate: r.inspectionDate ?? null,
    projectName: r.projectName ?? null,
    sourceItemRef: r.ticket.sourceItemRef,
  }));
}

// ── Company member picker ─────────────────────────────────────────────────────

export async function getCompanyMembersForPicker(companyId: number): Promise<Array<{
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}>> {
  return db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: userMembershipsTable.role,
    })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, companyId),
      ),
    )
    .orderBy(asc(usersTable.lastName), asc(usersTable.firstName));
}

// ── Shadow Auditor data aggregation ──────────────────────────────────────────

export interface ShadowAuditorDataRow {
  element: string;
  averageScore: number;
  entryCount: number;
  failCount: number;
  daysSinceLastEntry: number | null;
}

export interface ShadowAuditorCapaRow {
  element: string;
  openCount: number;
  overdueCount: number;
}

export interface ShadowAuditorVoiceRow {
  element: string;
  count: number;
}

export interface ShadowAuditorSignoffRow {
  element: string;
  compliance: number;
}

export interface ShadowAuditorData {
  elementStats: ShadowAuditorDataRow[];
  capaByElement: ShadowAuditorCapaRow[];
  voiceLogsByElement: ShadowAuditorVoiceRow[];
  signoffByElement: ShadowAuditorSignoffRow[];
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
}

export async function getShadowAuditorData(
  companyId: number,
  lookbackDays: number,
): Promise<ShadowAuditorData> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const today = new Date().toISOString().split("T")[0]!;

  const [elementRows, capaRows, voiceRows, signoffRows, credRow, subRow] = await Promise.all([
    // Per-element audit stats for the lookback window
    db
      .select({
        element: corAuditTrailTable.ihsaElement,
        averageScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
        entryCount: sql<number>`COUNT(*)::int`,
        failCount: sql<number>`SUM(CASE WHEN ${corAuditTrailTable.findingType} = 'fail' THEN 1 ELSE 0 END)::int`,
        daysSinceLastEntry: sql<number>`EXTRACT(DAY FROM NOW() - MAX(${corAuditTrailTable.createdAt}))::int`,
      })
      .from(corAuditTrailTable)
      .where(
        and(
          eq(corAuditTrailTable.companyId, companyId),
          gte(corAuditTrailTable.createdAt, cutoff),
        ),
      )
      .groupBy(corAuditTrailTable.ihsaElement),

    // Open + overdue CAPA counts per element
    db
      .select({
        element: capaTicketsTable.ihsaElement,
        openCount: sql<number>`COUNT(*)::int`,
        overdueCount: sql<number>`SUM(CASE WHEN ${capaTicketsTable.dueDate} < ${today} THEN 1 ELSE 0 END)::int`,
      })
      .from(capaTicketsTable)
      .where(
        and(
          eq(capaTicketsTable.companyId, companyId),
          inArray(capaTicketsTable.status, ["open", "in_progress"]),
        ),
      )
      .groupBy(capaTicketsTable.ihsaElement),

    // Voice log counts per element (last 30 days)
    db
      .select({
        element: corVoiceActionLogsTable.ihsaElement,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(corVoiceActionLogsTable)
      .where(
        and(
          eq(corVoiceActionLogsTable.companyId, companyId),
          gte(corVoiceActionLogsTable.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(corVoiceActionLogsTable.ihsaElement),

    // Policy signoff counts per element
    db
      .select({
        ihsaElement: policyDocumentsTable.ihsaElement,
        totalSignoffs: sql<number>`COUNT(DISTINCT ${policySignoffsTable.workerUserId})::int`,
      })
      .from(policyDocumentsTable)
      .leftJoin(
        policySignoffsTable,
        and(
          eq(policySignoffsTable.policyDocumentId, policyDocumentsTable.id),
          eq(policySignoffsTable.isValid, true),
        ),
      )
      .where(
        and(
          eq(policyDocumentsTable.companyId, companyId),
          eq(policyDocumentsTable.isActive, true),
        ),
      )
      .groupBy(policyDocumentsTable.ihsaElement),

    // Count credentials expiring within 60 days or already expired
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(workerCredentialsTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, workerCredentialsTable.userId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .where(
        and(
          eq(workerCredentialsTable.companyId, companyId),
          or(
            eq(workerCredentialsTable.status, "expired"),
            and(
              eq(workerCredentialsTable.status, "active"),
              lte(
                workerCredentialsTable.expirationDate,
                sql`(CURRENT_DATE + INTERVAL '60 days')::date`,
              ),
            ),
          ),
        ),
      ),

    // Count flagged subcontractors
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(subcontractorsTable)
      .where(
        and(
          eq(subcontractorsTable.companyId, companyId),
          inArray(subcontractorsTable.overallStatus, ["expired", "non_compliant"]),
        ),
      ),
  ]);

  // Compute signoff compliance % per element
  const [totalWorkersRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));
  const totalWorkers = Math.max(totalWorkersRow?.count ?? 1, 1);

  const signoffByElement: ShadowAuditorSignoffRow[] = signoffRows.map((r) => ({
    element: r.ihsaElement as string,
    compliance: Math.round((r.totalSignoffs / totalWorkers) * 100),
  }));

  return {
    elementStats: elementRows.map((r) => ({
      element: r.element as string,
      averageScore: r.averageScore ?? 0,
      entryCount: r.entryCount ?? 0,
      failCount: r.failCount ?? 0,
      daysSinceLastEntry: r.daysSinceLastEntry ?? null,
    })),
    capaByElement: capaRows
      .filter((r) => r.element !== null)
      .map((r) => ({
        element: r.element as string,
        openCount: r.openCount ?? 0,
        overdueCount: r.overdueCount ?? 0,
      })),
    voiceLogsByElement: voiceRows
      .filter((r) => r.element !== null)
      .map((r) => ({
        element: r.element as string,
        count: r.count ?? 0,
      })),
    signoffByElement,
    expiringCredentialCount: credRow[0]?.count ?? 0,
    flaggedSubcontractorCount: subRow[0]?.count ?? 0,
  };
}

// ── External Auditor Tokens ───────────────────────────────────────────────────

export async function createAuditorToken(
  companyId: number,
  label: string,
  createdByUserId: number,
  expiryDays: number,
): Promise<ExternalAuditorToken> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(externalAuditorTokensTable)
    .values({ companyId, token, label, createdByUserId, expiresAt })
    .returning();
  return row;
}

export async function listAuditorTokens(companyId: number): Promise<ExternalAuditorToken[]> {
  return db
    .select()
    .from(externalAuditorTokensTable)
    .where(eq(externalAuditorTokensTable.companyId, companyId))
    .orderBy(desc(externalAuditorTokensTable.createdAt));
}

export async function revokeAuditorToken(
  companyId: number,
  tokenId: number,
): Promise<void> {
  await db
    .update(externalAuditorTokensTable)
    .set({ isActive: false })
    .where(
      and(
        eq(externalAuditorTokensTable.id, tokenId),
        eq(externalAuditorTokensTable.companyId, companyId),
      ),
    );
}

export async function getValidAuditorToken(
  tokenValue: string,
): Promise<ExternalAuditorToken | null> {
  const [row] = await db
    .select()
    .from(externalAuditorTokensTable)
    .where(
      and(
        eq(externalAuditorTokensTable.token, tokenValue),
        eq(externalAuditorTokensTable.isActive, true),
        gt(externalAuditorTokensTable.expiresAt, sql`NOW()`),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function recordAuditorAccess(tokenId: number): Promise<void> {
  await db
    .update(externalAuditorTokensTable)
    .set({
      accessCount: sql`${externalAuditorTokensTable.accessCount} + 1`,
      lastAccessedAt: sql`NOW()`,
    })
    .where(eq(externalAuditorTokensTable.id, tokenId));
}

// ── Auditor Portal Data ───────────────────────────────────────────────────────

export interface AuditorEntryRow {
  id: number;
  sourceType: string;
  findingType: string;
  findingDescription: string | null;
  complianceScore: number | null;
  createdAt: Date;
}

export interface AuditorCapaRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  closedAt: Date | null;
}

export interface AuditorPolicyRow {
  id: number;
  title: string;
  documentType: string;
  signedCount: number;
  totalWorkers: number;
}

export interface AuditorVoiceLogRow {
  id: number;
  riskLevel: string;
  synopsis: string | null;
  createdAt: Date;
}

export interface AuditorInspectionRow {
  id: number;
  inspectionType: string;
  date: string;
  score: number | null;
  status: string;
}

export interface AuditorElementData {
  key: string;
  entryCount: number;
  passCount: number;
  failCount: number;
  averageScore: number;
  lastSubmittedAt: Date | null;
  auditEntries: AuditorEntryRow[];
  capaTickets: AuditorCapaRow[];
  policyDocuments: AuditorPolicyRow[];
  voiceLogs: AuditorVoiceLogRow[];
}

export interface AuditorPortalData {
  companyName: string;
  elements: AuditorElementData[];
  recentInspections: AuditorInspectionRow[];
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
  totalWorkerCount: number;
}

const IHSA_ELEMENTS = [
  "element_1","element_2","element_3","element_4","element_5",
  "element_6","element_7","element_8","element_9","element_10",
  "element_11","element_12","element_13","element_14","element_15",
  "element_16","element_17","element_18","element_19",
] as const;

export async function getAuditorPortalData(companyId: number): Promise<AuditorPortalData> {
  const lookbackMs = 365 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - lookbackMs);

  const [
    companyRows,
    allEntries,
    allCapas,
    allPolicies,
    allSignoffs,
    allVoiceLogs,
    allInspections,
    credRow,
    subRow,
    workerCountRow,
  ] = await Promise.all([
    db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1),

    db
      .select({
        id: corAuditTrailTable.id,
        ihsaElement: corAuditTrailTable.ihsaElement,
        sourceType: corAuditTrailTable.sourceType,
        findingType: corAuditTrailTable.findingType,
        findingDescription: corAuditTrailTable.findingDescription,
        complianceScore: corAuditTrailTable.complianceScore,
        createdAt: corAuditTrailTable.createdAt,
      })
      .from(corAuditTrailTable)
      .where(and(eq(corAuditTrailTable.companyId, companyId), gte(corAuditTrailTable.createdAt, since)))
      .orderBy(desc(corAuditTrailTable.createdAt))
      .limit(2000),

    db
      .select({
        id: capaTicketsTable.id,
        ihsaElement: capaTicketsTable.ihsaElement,
        title: capaTicketsTable.title,
        status: capaTicketsTable.status,
        priority: capaTicketsTable.priority,
        dueDate: capaTicketsTable.dueDate,
        closedAt: capaTicketsTable.closedAt,
      })
      .from(capaTicketsTable)
      .where(eq(capaTicketsTable.companyId, companyId))
      .orderBy(desc(capaTicketsTable.createdAt))
      .limit(500),

    db
      .select({ id: policyDocumentsTable.id, title: policyDocumentsTable.title, documentType: policyDocumentsTable.documentType, ihsaElement: policyDocumentsTable.ihsaElement })
      .from(policyDocumentsTable)
      .where(eq(policyDocumentsTable.companyId, companyId)),

    db
      .select({ documentId: policySignoffsTable.policyDocumentId, count: sql<number>`COUNT(*)::int` })
      .from(policySignoffsTable)
      .innerJoin(policyDocumentsTable, eq(policyDocumentsTable.id, policySignoffsTable.policyDocumentId))
      .where(eq(policyDocumentsTable.companyId, companyId))
      .groupBy(policySignoffsTable.policyDocumentId),

    db
      .select({ id: corVoiceActionLogsTable.id, ihsaElement: corVoiceActionLogsTable.ihsaElement, riskLevel: corVoiceActionLogsTable.riskLevel, rawTranscript: corVoiceActionLogsTable.rawTranscript, createdAt: corVoiceActionLogsTable.createdAt })
      .from(corVoiceActionLogsTable)
      .where(and(eq(corVoiceActionLogsTable.companyId, companyId), gte(corVoiceActionLogsTable.createdAt, since)))
      .orderBy(desc(corVoiceActionLogsTable.createdAt))
      .limit(500),

    db
      .select({ id: inspectionsTable.id, inspectionType: inspectionsTable.inspectionType, date: inspectionsTable.date, score: inspectionsTable.score, status: inspectionsTable.status })
      .from(inspectionsTable)
      .where(and(eq(inspectionsTable.companyId, companyId), gte(inspectionsTable.createdAt, since)))
      .orderBy(desc(inspectionsTable.createdAt))
      .limit(200),

    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(workerCredentialsTable)
      .innerJoin(userMembershipsTable, and(eq(userMembershipsTable.userId, workerCredentialsTable.userId), eq(userMembershipsTable.companyId, companyId)))
      .where(and(eq(workerCredentialsTable.companyId, companyId), or(eq(workerCredentialsTable.status, "expired"), and(eq(workerCredentialsTable.status, "active"), lte(workerCredentialsTable.expirationDate, sql`(CURRENT_DATE + INTERVAL '60 days')::date`))))),

    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(subcontractorsTable)
      .where(and(eq(subcontractorsTable.companyId, companyId), inArray(subcontractorsTable.overallStatus, ["expired", "non_compliant"]))),

    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(userMembershipsTable)
      .where(eq(userMembershipsTable.companyId, companyId)),
  ]);

  const totalWorkers = Math.max(workerCountRow[0]?.count ?? 1, 1);
  const signoffMap = new Map(allSignoffs.map((s) => [s.documentId, s.count]));

  const elements: AuditorElementData[] = IHSA_ELEMENTS.map((key) => {
    const entries = allEntries.filter((e) => e.ihsaElement === key);
    const capas = allCapas.filter((c) => c.ihsaElement === key);
    const policies = allPolicies.filter((p) => p.ihsaElement === key);
    const voices = allVoiceLogs.filter((v) => v.ihsaElement === key);

    const passCount = entries.filter((e) => e.findingType === "pass").length;
    const failCount = entries.filter((e) => e.findingType !== "pass").length;
    const scores = entries.map((e) => e.complianceScore ?? 0).filter((s) => s > 0);
    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const lastSubmittedAt = entries[0]?.createdAt ?? null;

    return {
      key,
      entryCount: entries.length,
      passCount,
      failCount,
      averageScore,
      lastSubmittedAt,
      auditEntries: entries.slice(0, 50).map((e) => ({
        id: e.id,
        sourceType: e.sourceType,
        findingType: e.findingType,
        findingDescription: e.findingDescription,
        complianceScore: e.complianceScore,
        createdAt: e.createdAt,
      })),
      capaTickets: capas.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        priority: c.priority,
        dueDate: c.dueDate,
        closedAt: c.closedAt,
      })),
      policyDocuments: policies.map((p) => ({
        id: p.id,
        title: p.title,
        documentType: p.documentType,
        signedCount: signoffMap.get(p.id) ?? 0,
        totalWorkers,
      })),
      voiceLogs: voices.map((v) => ({
        id: v.id,
        riskLevel: v.riskLevel,
        synopsis: v.rawTranscript,
        createdAt: v.createdAt,
      })),
    };
  });

  return {
    companyName: companyRows[0]?.name ?? "Unknown Company",
    elements,
    recentInspections: allInspections.map((i) => ({
      id: i.id,
      inspectionType: i.inspectionType,
      date: i.date,
      score: i.score,
      status: i.status,
    })),
    expiringCredentialCount: credRow[0]?.count ?? 0,
    flaggedSubcontractorCount: subRow[0]?.count ?? 0,
    totalWorkerCount: totalWorkers,
  };
}
