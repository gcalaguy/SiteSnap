import type { MatchReason } from "@workspace/db";
import { getProjectMatchSignals, getProjectSignalWeights } from "../repositories/projectMatching";

/**
 * Deterministic weighted-signal scoring engine for the Project Communications
 * Hub (Phase 2). Chosen over an LLM-based classifier: it runs inline during
 * cron-driven email sync with no added latency/cost, and every score is fully
 * explainable via the returned `reasons` array — see matchReasons on
 * emailThreadsTable, which stores this output verbatim for the "why this
 * suggestion" UI.
 *
 * Phase 3 adds two more signal sources on top, both additive: `learned_pattern`
 * (project_signal_weights, reinforced by every manual assignment — see
 * repositories/projectMatching.ts's recordManualAssignment/reinforceProjectSignals,
 * this is what makes confidence measurably improve over time) and `ai_mention`
 * (fuzzy name matches from LLM-extracted entities, once a message has been
 * processed by emailIntelligenceService.ts).
 */

export const AUTO_ASSIGN_THRESHOLD = 95;
export const SUGGEST_THRESHOLD = 75;

export interface ThreadMatchInput {
  subject: string | null;
  participantEmails: string[] | null;
  bodyText: string | null;
  /** Latest message's sender, for learned sender_email/sender_domain signals. */
  senderEmail?: string | null;
  /** Union of AI-extracted project/client/vendor mentions across the thread's messages, if any have been processed. */
  aiMentions?: string[];
}

export interface ProjectMatchCandidate {
  projectId: number;
  confidence: number;
  reasons: MatchReason[];
}

export interface TriageDecision {
  triageStatus: "assigned" | "suggested" | "unassigned";
  projectId: number | null;
  suggestedProjectId: number | null;
  matchConfidence: number | null;
  matchReasons: MatchReason[] | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Word-ish substring match — good enough for free-text identifiers like "PO-4471" or a street address. */
function containsToken(haystack: string, needle: string | null | undefined): boolean {
  const n = (needle ?? "").trim().toLowerCase();
  return n.length >= 3 && haystack.includes(n);
}

/** Bidirectional substring — an AI-extracted mention rarely matches a project/client name exactly. */
function fuzzyNameMatch(mention: string, name: string | null | undefined): boolean {
  const a = mention.trim().toLowerCase();
  const b = (name ?? "").trim().toLowerCase();
  if (a.length < 3 || b.length < 3) return false;
  return a.includes(b) || b.includes(a);
}

export async function scoreProjectsForThread(
  companyId: number,
  input: ThreadMatchInput,
): Promise<ProjectMatchCandidate[]> {
  const [signals, signalWeights] = await Promise.all([
    getProjectMatchSignals(companyId),
    getProjectSignalWeights(companyId),
  ]);
  const text = `${norm(input.subject)} ${norm(input.bodyText)}`;
  const participants = new Set((input.participantEmails ?? []).map((e) => e.toLowerCase()));
  const senderEmail = input.senderEmail?.toLowerCase() ?? null;
  const senderDomain = senderEmail?.split("@")[1] ?? null;
  const subjectLower = norm(input.subject);
  const aiMentions = input.aiMentions ?? [];

  const candidates: ProjectMatchCandidate[] = [];

  for (const s of signals) {
    let score = 0;
    const reasons: MatchReason[] = [];
    const add = (signal: string, value: string, points: number) => {
      score += points;
      reasons.push({ signal, value, points });
    };

    const emailHit =
      (s.contactEmail && participants.has(s.contactEmail.toLowerCase())) ||
      s.clientEmails.some((e) => participants.has(e.toLowerCase()));
    if (emailHit) add("client_email", s.contactEmail ?? "client email on file", 50);

    if (containsToken(text, s.projectNumber)) add("project_number", s.projectNumber!, 30);
    if (containsToken(text, s.poNumber)) add("po_number", s.poNumber!, 25);

    const quoteHit = s.quoteNumbers.find((q) => containsToken(text, q));
    if (quoteHit) add("quote_number", quoteHit, 25);

    const invoiceHit = s.invoiceNumbers.find((n) => containsToken(text, n));
    if (invoiceHit) add("invoice_number", invoiceHit, 25);

    const permitHit = s.permitNumbers.find((n) => containsToken(text, n));
    if (permitHit) add("permit_number", permitHit, 20);

    if (containsToken(text, s.name)) add("project_name", s.name, 15);
    if (containsToken(text, s.address)) add("project_address", s.address, 15);

    const vendorHit = s.vendorNames.find(
      (v) => containsToken(text, v) || [...participants].some((e) => containsToken(e, v)),
    );
    if (vendorHit) add("vendor", vendorHit, 15);

    if (containsToken(text, s.contactName)) add("client_name", s.contactName!, 10);

    let keywordPoints = 0;
    for (const kw of s.keywords) {
      if (keywordPoints >= 20) break;
      if (containsToken(text, kw)) {
        add("keyword", kw, 10);
        keywordPoints += 10;
      }
    }

    // Phase 3: learned patterns — reinforced by every manual assignment, so
    // this grows as corrections accumulate for this project.
    let learnedPoints = 0;
    for (const w of signalWeights) {
      if (w.projectId !== s.projectId || learnedPoints >= 25) continue;
      const matched =
        (w.signalType === "sender_email" && senderEmail === w.signalValue) ||
        (w.signalType === "sender_domain" && senderDomain === w.signalValue) ||
        (w.signalType === "subject_keyword" && subjectLower.includes(w.signalValue));
      if (matched) {
        const points = Math.min(w.weight * 5, 25 - learnedPoints);
        add("learned_pattern", w.signalValue, points);
        learnedPoints += points;
      }
    }

    // Phase 3: AI-extracted mentions (once a message has been processed) —
    // a softer signal than an exact identifier/email match.
    const aiMentionHit = aiMentions.find(
      (m) => fuzzyNameMatch(m, s.name) || fuzzyNameMatch(m, s.contactName),
    );
    if (aiMentionHit) add("ai_mention", aiMentionHit, 10);

    if (score > 0) {
      candidates.push({ projectId: s.projectId, confidence: Math.min(score, 100), reasons });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export function decideTriage(candidates: ProjectMatchCandidate[]): TriageDecision {
  const top = candidates[0];
  if (!top) {
    return { triageStatus: "unassigned", projectId: null, suggestedProjectId: null, matchConfidence: null, matchReasons: null };
  }
  if (top.confidence >= AUTO_ASSIGN_THRESHOLD) {
    return {
      triageStatus: "assigned",
      projectId: top.projectId,
      suggestedProjectId: top.projectId,
      matchConfidence: top.confidence,
      matchReasons: top.reasons,
    };
  }
  if (top.confidence >= SUGGEST_THRESHOLD) {
    return {
      triageStatus: "suggested",
      projectId: null,
      suggestedProjectId: top.projectId,
      matchConfidence: top.confidence,
      matchReasons: top.reasons,
    };
  }
  // Below the suggest threshold: stays uncategorized, but we keep the closest
  // guess around so the Uncategorized inbox can still show a hint.
  return {
    triageStatus: "unassigned",
    projectId: null,
    suggestedProjectId: top.projectId,
    matchConfidence: top.confidence,
    matchReasons: top.reasons,
  };
}
