import { db } from "@workspace/db";
import {
  policyDocumentsTable,
  policySignoffsTable,
  subcontractorsTable,
  subcontractorDocsTable,
  usersTable,
  userMembershipsTable,
  companiesTable,
  corAuditTrailTable,
  capaTicketsTable,
  corVoiceActionLogsTable,
  inspectionsTable,
  workerCredentialsTable,
  externalAuditorTokensTable,
  type PolicyDocument,
  type PolicySignoff,
  type InsertPolicyDocument,
  type Subcontractor,
  type SubcontractorDoc,
  type InsertSubcontractor,
  type InsertSubcontractorDoc,
  type ExternalAuditorToken,
} from "@workspace/db";
import { eq, and, sql, desc, asc, ne, gte, lte, or, inArray, gt } from "drizzle-orm";
import { randomBytes } from "crypto";

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

export async function recordAuditorAccess(tokenId: number): Promise<number> {
  const [row] = await db
    .update(externalAuditorTokensTable)
    .set({
      accessCount: sql`${externalAuditorTokensTable.accessCount} + 1`,
      lastAccessedAt: sql`NOW()`,
    })
    .where(eq(externalAuditorTokensTable.id, tokenId))
    .returning({ accessCount: externalAuditorTokensTable.accessCount });
  return row?.accessCount ?? 0;
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

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);

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
      tx.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1),

      tx
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

      tx
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

      tx
        .select({ id: policyDocumentsTable.id, title: policyDocumentsTable.title, documentType: policyDocumentsTable.documentType, ihsaElement: policyDocumentsTable.ihsaElement })
        .from(policyDocumentsTable)
        .where(eq(policyDocumentsTable.companyId, companyId)),

      tx
        .select({ documentId: policySignoffsTable.policyDocumentId, count: sql<number>`COUNT(*)::int` })
        .from(policySignoffsTable)
        .innerJoin(policyDocumentsTable, eq(policyDocumentsTable.id, policySignoffsTable.policyDocumentId))
        .where(eq(policyDocumentsTable.companyId, companyId))
        .groupBy(policySignoffsTable.policyDocumentId),

      tx
        .select({ id: corVoiceActionLogsTable.id, ihsaElement: corVoiceActionLogsTable.ihsaElement, riskLevel: corVoiceActionLogsTable.riskLevel, aiClassification: corVoiceActionLogsTable.aiClassification, createdAt: corVoiceActionLogsTable.createdAt })
        .from(corVoiceActionLogsTable)
        .where(and(eq(corVoiceActionLogsTable.companyId, companyId), gte(corVoiceActionLogsTable.createdAt, since)))
        .orderBy(desc(corVoiceActionLogsTable.createdAt))
        .limit(500),

      tx
        .select({ id: inspectionsTable.id, inspectionType: inspectionsTable.inspectionType, date: inspectionsTable.date, score: inspectionsTable.score, status: inspectionsTable.status })
        .from(inspectionsTable)
        .where(and(eq(inspectionsTable.companyId, companyId), gte(inspectionsTable.createdAt, since)))
        .orderBy(desc(inspectionsTable.createdAt))
        .limit(200),

      tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(workerCredentialsTable)
        .innerJoin(userMembershipsTable, and(eq(userMembershipsTable.userId, workerCredentialsTable.userId), eq(userMembershipsTable.companyId, companyId)))
        .where(and(eq(workerCredentialsTable.companyId, companyId), or(eq(workerCredentialsTable.status, "expired"), and(eq(workerCredentialsTable.status, "active"), lte(workerCredentialsTable.expirationDate, sql`(CURRENT_DATE + INTERVAL '60 days')::date`))))),

      tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(subcontractorsTable)
        .where(and(eq(subcontractorsTable.companyId, companyId), inArray(subcontractorsTable.overallStatus, ["expired", "non_compliant"]))),

      tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(userMembershipsTable)
        .where(
          and(
            eq(userMembershipsTable.companyId, companyId),
            eq(userMembershipsTable.role, "worker"),
            eq(userMembershipsTable.isActive, true),
          )
        ),
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
      const scores = entries.map((e) => e.complianceScore).filter((s): s is number => s !== null);
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
          synopsis: (v.aiClassification as any)?.synopsis ?? null,
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
  });
}
