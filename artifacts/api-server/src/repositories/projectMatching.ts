import {
  db,
  projectsTable,
  contactsTable,
  quotesTable,
  invoicesTable,
  permitsTable,
  expensesTable,
  projectMatchKeywordsTable,
  projectSignalWeightsTable,
  emailThreadCorrectionsTable,
  emailMessagesTable,
  type InsertProjectMatchKeyword,
  type ProjectMatchKeyword,
  type ProjectSignalWeight,
  type EmailThread,
} from "@workspace/db";
import { eq, and, isNotNull, desc, sql } from "drizzle-orm";
import { getThread, assignThreadToProject, applyThreadMatch } from "./emailIntegrations";

/**
 * Per-project signals the matching engine (projectMatchingService.ts) scores
 * inbound email threads against. Pulled as a handful of set-based queries
 * (one per source table) rather than N+1-per-project — cheap enough to run
 * on every sync pass since companies have at most a few hundred projects.
 */
export interface ProjectMatchSignals {
  projectId: number;
  projectNumber: string | null;
  name: string;
  address: string;
  poNumber: string | null;
  contactEmail: string | null;
  contactName: string | null;
  quoteNumbers: string[];
  clientEmails: string[];
  invoiceNumbers: string[];
  permitNumbers: string[];
  vendorNames: string[];
  keywords: string[];
}

export async function getProjectMatchSignals(companyId: number): Promise<ProjectMatchSignals[]> {
  const [projects, quotes, invoices, permits, expenses, keywords] = await Promise.all([
    db
      .select({
        id: projectsTable.id,
        projectNumber: projectsTable.projectNumber,
        name: projectsTable.name,
        address: projectsTable.address,
        poNumber: projectsTable.poNumber,
        contactEmail: contactsTable.email,
        contactName: contactsTable.name,
      })
      .from(projectsTable)
      .leftJoin(contactsTable, eq(projectsTable.primaryContactId, contactsTable.id))
      .where(eq(projectsTable.companyId, companyId)),
    db
      .select({ projectId: quotesTable.projectId, quoteNumber: quotesTable.quoteNumber, clientEmail: quotesTable.clientEmail })
      .from(quotesTable)
      .where(and(eq(quotesTable.companyId, companyId), isNotNull(quotesTable.projectId))),
    db
      .select({ projectId: invoicesTable.projectId, invoiceNumber: invoicesTable.invoiceNumber, clientEmail: invoicesTable.clientEmail })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.companyId, companyId), isNotNull(invoicesTable.projectId))),
    db
      .select({ projectId: permitsTable.projectId, permitNumber: permitsTable.permitNumber })
      .from(permitsTable)
      .where(and(eq(permitsTable.companyId, companyId), isNotNull(permitsTable.permitNumber))),
    db
      .select({ projectId: expensesTable.projectId, vendorName: expensesTable.vendorName })
      .from(expensesTable)
      .where(and(eq(expensesTable.companyId, companyId), isNotNull(expensesTable.vendorName))),
    db
      .select({ projectId: projectMatchKeywordsTable.projectId, keyword: projectMatchKeywordsTable.keyword })
      .from(projectMatchKeywordsTable)
      .where(eq(projectMatchKeywordsTable.companyId, companyId)),
  ]);

  const byProject = new Map<number, ProjectMatchSignals>();
  for (const p of projects) {
    byProject.set(p.id, {
      projectId: p.id,
      projectNumber: p.projectNumber,
      name: p.name,
      address: p.address,
      poNumber: p.poNumber,
      contactEmail: p.contactEmail,
      contactName: p.contactName,
      quoteNumbers: [],
      clientEmails: [],
      invoiceNumbers: [],
      permitNumbers: [],
      vendorNames: [],
      keywords: [],
    });
  }
  for (const q of quotes) {
    const s = q.projectId != null ? byProject.get(q.projectId) : undefined;
    if (!s) continue;
    if (q.quoteNumber) s.quoteNumbers.push(q.quoteNumber);
    if (q.clientEmail) s.clientEmails.push(q.clientEmail);
  }
  for (const i of invoices) {
    const s = i.projectId != null ? byProject.get(i.projectId) : undefined;
    if (!s) continue;
    if (i.invoiceNumber) s.invoiceNumbers.push(i.invoiceNumber);
    if (i.clientEmail) s.clientEmails.push(i.clientEmail);
  }
  for (const p of permits) {
    const s = byProject.get(p.projectId);
    if (s && p.permitNumber) s.permitNumbers.push(p.permitNumber);
  }
  for (const e of expenses) {
    const s = byProject.get(e.projectId);
    if (s && e.vendorName) s.vendorNames.push(e.vendorName);
  }
  for (const k of keywords) {
    const s = byProject.get(k.projectId);
    if (s) s.keywords.push(k.keyword);
  }

  return [...byProject.values()];
}

// ── User-defined keywords ─────────────────────────────────────────────────────

export async function listProjectMatchKeywords(
  companyId: number,
  projectId: number,
): Promise<ProjectMatchKeyword[]> {
  return db
    .select()
    .from(projectMatchKeywordsTable)
    .where(and(eq(projectMatchKeywordsTable.companyId, companyId), eq(projectMatchKeywordsTable.projectId, projectId)))
    .orderBy(projectMatchKeywordsTable.keyword);
}

export async function addProjectMatchKeyword(
  keyword: InsertProjectMatchKeyword,
): Promise<ProjectMatchKeyword> {
  const [row] = await db
    .insert(projectMatchKeywordsTable)
    .values(keyword)
    .onConflictDoNothing({
      target: [projectMatchKeywordsTable.projectId, projectMatchKeywordsTable.keyword],
    })
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(projectMatchKeywordsTable)
    .where(
      and(
        eq(projectMatchKeywordsTable.projectId, keyword.projectId),
        eq(projectMatchKeywordsTable.keyword, keyword.keyword),
      ),
    );
  return existing;
}

export async function removeProjectMatchKeyword(companyId: number, keywordId: number): Promise<boolean> {
  const [row] = await db
    .delete(projectMatchKeywordsTable)
    .where(and(eq(projectMatchKeywordsTable.companyId, companyId), eq(projectMatchKeywordsTable.id, keywordId)))
    .returning({ id: projectMatchKeywordsTable.id });
  return !!row;
}

// ── AI Suggested Project Matching — learning from corrections (Phase 3) ───────

const SUBJECT_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "have",
  "please", "email", "re", "fwd", "project", "about", "regarding",
]);

function extractSubjectKeywords(subject: string | null): string[] {
  if (!subject) return [];
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SUBJECT_STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 5);
}

export async function getProjectSignalWeights(companyId: number): Promise<ProjectSignalWeight[]> {
  return db.select().from(projectSignalWeightsTable).where(eq(projectSignalWeightsTable.companyId, companyId));
}

/**
 * Upserts/increments project_signal_weights from a thread's sender
 * email/domain + top subject keywords. Called on every manual assignment
 * (agreeing with a suggestion or overriding it — either way it's a real
 * training example), which is what makes scoreProjectsForThread's
 * "learned_pattern" signal measurably stronger over time.
 */
export async function reinforceProjectSignals(
  companyId: number,
  projectId: number,
  thread: EmailThread,
): Promise<void> {
  const [latestMessage] = await db
    .select({ fromEmail: emailMessagesTable.fromEmail })
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.threadId, thread.id))
    .orderBy(desc(emailMessagesTable.sentAt))
    .limit(1);

  const signals: { type: "sender_email" | "sender_domain" | "subject_keyword"; value: string }[] = [];
  const senderEmail = latestMessage?.fromEmail?.toLowerCase();
  if (senderEmail) {
    signals.push({ type: "sender_email", value: senderEmail });
    const domain = senderEmail.split("@")[1];
    if (domain) signals.push({ type: "sender_domain", value: domain });
  }
  for (const keyword of extractSubjectKeywords(thread.subject)) {
    signals.push({ type: "subject_keyword", value: keyword });
  }

  for (const signal of signals) {
    await db
      .insert(projectSignalWeightsTable)
      .values({
        companyId,
        projectId,
        signalType: signal.type,
        signalValue: signal.value,
        weight: 1,
      })
      .onConflictDoUpdate({
        target: [
          projectSignalWeightsTable.companyId,
          projectSignalWeightsTable.projectId,
          projectSignalWeightsTable.signalType,
          projectSignalWeightsTable.signalValue,
        ],
        set: {
          weight: sql`${projectSignalWeightsTable.weight} + 1`,
          lastReinforcedAt: new Date(),
        },
      });
  }
}

/**
 * The single entry point every manual "file this email" action should go
 * through (replaces raw assignThreadToProject calls at the route layer) —
 * keeps triageStatus/matchSource consistent, logs an audit trail row, and
 * reinforces the learned-signal table in one place instead of three routes
 * each doing a slightly different subset.
 */
export async function recordManualAssignment(
  companyId: number,
  threadId: number,
  projectId: number,
  userId: number | null,
): Promise<EmailThread | null> {
  const prior = await getThread(companyId, threadId);
  if (!prior) return null;

  const updated = await assignThreadToProject(companyId, threadId, projectId);
  if (!updated) return null;

  await applyThreadMatch(companyId, threadId, {
    triageStatus: "assigned",
    suggestedProjectId: projectId,
    matchConfidence: prior.matchConfidence,
    matchReasons: prior.matchReasons,
    matchSource: "manual",
  });

  await db.insert(emailThreadCorrectionsTable).values({
    companyId,
    threadId,
    priorProjectId: prior.projectId,
    priorSuggestedProjectId: prior.suggestedProjectId,
    priorMatchSource: prior.matchSource,
    priorMatchConfidence: prior.matchConfidence,
    correctedProjectId: projectId,
    correctedByUserId: userId,
  });

  await reinforceProjectSignals(companyId, projectId, updated);

  return updated;
}
