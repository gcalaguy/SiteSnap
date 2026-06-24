import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../lib/logger";
import { getShadowAuditorData } from "../../repositories/cor";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GapSeverity = "critical" | "high" | "medium" | "low";

export interface ElementAnalysis {
  element: string;
  name: string;
  predictedScore: number;
  baseScore: number;
  entryCount: number;
  failCount: number;
  voiceLogCount: number;
  daysSinceLastEntry: number | null;
  openCapaCount: number;
  overdueCapaCount: number;
  signoffCompliance: number;
}

export interface GapWarning {
  element: string;
  elementName: string;
  severity: GapSeverity;
  description: string;
  scoreImpact: number;
  actionRequired: string;
}

export interface ShadowAuditorReport {
  predictedScore: number;
  confidenceLevel: "high" | "medium" | "low";
  elementAnalysis: ElementAnalysis[];
  gapWarnings: GapWarning[];
  aiNarrative: string;
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
  generatedAt: string;
  lookbackDays: number;
}

// ── IHSA element names ────────────────────────────────────────────────────────

const ELEMENT_NAMES: Record<string, string> = {
  element_1:  "Management Leadership",
  element_2:  "Hazard ID & Assessment",
  element_3:  "Hazard Control",
  element_4:  "Ongoing Inspections",
  element_5:  "Qualifications & Training",
  element_6:  "Emergency Response",
  element_7:  "Incident Reporting",
  element_8:  "Program Administration",
  element_9:  "Worker Participation",
  element_10: "Workplace Housekeeping",
  element_11: "Environmental Protection",
  element_12: "Safety Equipment & First Aid",
  element_13: "Fire Safety",
  element_14: "WHMIS & Controlled Products",
  element_15: "Contractor Management",
  element_16: "Medical Management",
  element_17: "Joint Health & Safety Committee",
  element_18: "Occupational Health",
  element_19: "Records & Statistics",
};

const ALL_ELEMENTS = Object.keys(ELEMENT_NAMES);

// ── Scoring algorithm ─────────────────────────────────────────────────────────

function recencyPenalty(daysSinceLast: number | null): number {
  if (daysSinceLast === null) return 45;
  if (daysSinceLast <= 7)  return 0;
  if (daysSinceLast <= 14) return 8;
  if (daysSinceLast <= 30) return 18;
  if (daysSinceLast <= 60) return 30;
  return 45;
}

function capaPenalty(open: number, overdue: number): number {
  return Math.min(24, open * 8 + overdue * 4);
}

function signoffPenalty(compliance: number): number {
  if (compliance >= 100) return 0;
  if (compliance >= 80)  return 5;
  if (compliance >= 50)  return 10;
  return 15;
}

function computeElementScore(
  baseScore: number,
  daysSinceLast: number | null,
  openCapa: number,
  overdueCapa: number,
  signoffPct: number,
  hasAnyEntries: boolean,
): number {
  if (!hasAnyEntries) return 0;
  const score =
    baseScore
    - recencyPenalty(daysSinceLast)
    - capaPenalty(openCapa, overdueCapa)
    - signoffPenalty(signoffPct);
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Gap detection (rule-based) ────────────────────────────────────────────────

function detectGaps(
  elements: ElementAnalysis[],
  expiringCreds: number,
  flaggedSubs: number,
): GapWarning[] {
  const warnings: GapWarning[] = [];

  for (const el of elements) {
    const name = el.name;

    if (el.entryCount === 0) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: "critical",
        description: `No evidence has ever been recorded for ${name}. An auditor will find zero documentation for this element.`,
        scoreImpact: -100,
        actionRequired: `Begin submitting field inspections, safety logs, or toolbox talks mapped to ${name} immediately.`,
      });
      continue;
    }

    if (el.daysSinceLastEntry !== null && el.daysSinceLastEntry > 30) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: el.daysSinceLastEntry > 60 ? "high" : "medium",
        description: `No ${name} evidence submitted in the last ${el.daysSinceLastEntry} days — evidence staleness is reducing your predicted score.`,
        scoreImpact: -recencyPenalty(el.daysSinceLastEntry),
        actionRequired: `Submit updated safety documentation or inspection records for ${name} within the next 7 days.`,
      });
    } else if (el.daysSinceLastEntry !== null && el.daysSinceLastEntry > 14) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: "low",
        description: `${name} logs have not been updated in ${el.daysSinceLastEntry} days — maintain a submission cadence to hold your score.`,
        scoreImpact: -recencyPenalty(el.daysSinceLastEntry),
        actionRequired: `Log at least one ${name} activity before day 21 to prevent score decay.`,
      });
    }

    if (el.openCapaCount > 0) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: el.overdueCapaCount > 0 ? "high" : "medium",
        description: `${el.openCapaCount} open CAPA ticket${el.openCapaCount !== 1 ? "s" : ""}${el.overdueCapaCount > 0 ? ` (${el.overdueCapaCount} overdue)` : ""} in ${name} — unresolved corrective actions are a direct audit finding.`,
        scoreImpact: -capaPenalty(el.openCapaCount, el.overdueCapaCount),
        actionRequired: `Close outstanding CAPA tickets for ${name} with documented evidence of corrective action.`,
      });
    }

    if (el.signoffCompliance < 80 && el.signoffCompliance > 0) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: el.signoffCompliance < 50 ? "high" : "medium",
        description: `Policy sign-off compliance for ${name} is at ${el.signoffCompliance}% — workers have not acknowledged all required documents.`,
        scoreImpact: -signoffPenalty(el.signoffCompliance),
        actionRequired: `Send reminders to unsigned workers and complete all ${name} policy acknowledgements.`,
      });
    }

    if (el.baseScore < 70 && el.entryCount > 0) {
      warnings.push({
        element: el.element,
        elementName: name,
        severity: el.baseScore < 50 ? "high" : "medium",
        description: `${name} audit entries show a ${Math.round(100 - el.baseScore)}% failure rate — recurring non-compliance is a significant audit risk.`,
        scoreImpact: -(100 - el.baseScore),
        actionRequired: `Review failed inspection items for ${name} and implement systemic corrective measures.`,
      });
    }
  }

  if (expiringCreds > 0) {
    warnings.push({
      element: "element_5",
      elementName: "Qualifications & Training",
      severity: expiringCreds > 3 ? "high" : "medium",
      description: `${expiringCreds} worker certification${expiringCreds !== 1 ? "s" : ""} expiring within 60 days — lapsed credentials will block deployment and reduce Element 5 compliance.`,
      scoreImpact: -Math.min(20, expiringCreds * 5),
      actionRequired: `Schedule renewals for all expiring certifications before their expiry dates.`,
    });
  }

  if (flaggedSubs > 0) {
    warnings.push({
      element: "element_15",
      elementName: "Contractor Management",
      severity: "high",
      description: `${flaggedSubs} subcontractor${flaggedSubs !== 1 ? "s" : ""} flagged for expired or missing compliance documents — Element 15 (Contractor Management) is at direct audit risk.`,
      scoreImpact: -Math.min(25, flaggedSubs * 12),
      actionRequired: `Obtain updated WSIB clearance and insurance certificates from flagged subcontractors immediately.`,
    });
  }

  // Sort: critical first, then by absolute score impact
  warnings.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return Math.abs(b.scoreImpact) - Math.abs(a.scoreImpact);
  });

  return warnings;
}

// ── AI narrative generation ───────────────────────────────────────────────────

const SHADOW_AUDITOR_SYSTEM_PROMPT = `You are a certified Ontario COR internal auditor with 15 years of construction industry experience.

Your role is to review the predictive analytics data for a construction company's COR compliance program and produce:
1. A concise executive summary (2-3 sentences) of the company's audit readiness
2. Up to 5 prioritized, specific gap warnings with exact score impact language

Format your response as valid JSON only:
{
  "narrative": "<2-3 sentence executive summary using professional audit language>",
  "enhancedWarnings": [
    {
      "element": "<element key e.g. element_3>",
      "specificWarning": "<specific, actionable warning with quantified impact — max 160 characters>",
      "estimatedImpact": <integer percentage points the score would improve if resolved>
    }
  ]
}

Rules:
- Be specific about percentages, days, and counts using the actual data provided
- Use professional COR audit terminology
- Focus on the highest-risk gaps only
- estimatedImpact must be a realistic positive integer (1-25)
- narrative must reference the predicted score and top vulnerability`;

async function generateAINarrative(
  predictedScore: number,
  gapWarnings: GapWarning[],
  elementAnalysis: ElementAnalysis[],
  expiringCreds: number,
  flaggedSubs: number,
): Promise<string> {
  const uncoveredElements = elementAnalysis.filter((e) => e.entryCount === 0);
  const topGaps = gapWarnings.slice(0, 5).map((g) => ({
    element: g.element,
    elementName: g.elementName,
    severity: g.severity,
    description: g.description.slice(0, 150),
    scoreImpact: g.scoreImpact,
  }));

  const payload = {
    predictedScore,
    uncoveredElementCount: uncoveredElements.length,
    uncoveredElements: uncoveredElements.map((e) => e.name),
    expiringCredentialCount: expiringCreds,
    flaggedSubcontractorCount: flaggedSubs,
    topGaps,
    elementSummary: elementAnalysis.map((e) => ({
      element: e.element,
      name: e.name,
      predictedScore: e.predictedScore,
      entryCount: e.entryCount,
      daysSinceLast: e.daysSinceLastEntry,
      openCapas: e.openCapaCount,
    })),
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SHADOW_AUDITOR_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { narrative?: string };
    return parsed.narrative ?? buildFallbackNarrative(predictedScore, topGaps.length, uncoveredElements.length);
  } catch (err) {
    logger.warn({ err }, "Shadow auditor: AI narrative generation failed, using fallback");
    return buildFallbackNarrative(predictedScore, topGaps.length, uncoveredElements.length);
  }
}

function buildFallbackNarrative(score: number, gapCount: number, uncoveredCount: number): string {
  const readiness = score >= 80 ? "strong audit readiness" : score >= 60 ? "moderate audit readiness with notable gaps" : "significant audit vulnerabilities requiring immediate attention";
  const coverageNote = uncoveredCount > 0
    ? ` Critical concern: ${uncoveredCount} IHSA element${uncoveredCount !== 1 ? "s" : ""} have zero evidence on file.`
    : "";
  return `Current evidence analysis shows a predicted COR audit score of ${score}%, indicating ${readiness}.${coverageNote} ${gapCount} priority gaps have been identified — resolving the top-rated items would materially improve your audit outcome.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runShadowAuditor(
  companyId: number,
  lookbackDays = 90,
): Promise<ShadowAuditorReport> {
  const data = await getShadowAuditorData(companyId, lookbackDays);

  const elementAnalysis: ElementAnalysis[] = ALL_ELEMENTS.map((el) => {
    const stats = data.elementStats.find((s) => s.element === el);
    const openCapa = data.capaByElement.find((c) => c.element === el)?.openCount ?? 0;
    const overdueCapa = data.capaByElement.find((c) => c.element === el)?.overdueCount ?? 0;
    const voiceLogs = data.voiceLogsByElement.find((v) => v.element === el)?.count ?? 0;
    const signoffPct = data.signoffByElement.find((s) => s.element === el)?.compliance ?? 100;

    const hasEntries = (stats?.entryCount ?? 0) > 0;
    const baseScore = stats?.averageScore ?? 0;
    const daysSinceLast = stats?.daysSinceLastEntry ?? null;

    const predicted = computeElementScore(
      baseScore,
      daysSinceLast,
      openCapa,
      overdueCapa,
      signoffPct,
      hasEntries,
    );

    return {
      element: el,
      name: ELEMENT_NAMES[el] ?? el,
      predictedScore: predicted,
      baseScore: Math.round(baseScore),
      entryCount: stats?.entryCount ?? 0,
      failCount: stats?.failCount ?? 0,
      voiceLogCount: voiceLogs,
      daysSinceLastEntry: daysSinceLast,
      openCapaCount: openCapa,
      overdueCapaCount: overdueCapa,
      signoffCompliance: signoffPct,
    };
  });

  // Overall score = mean of all 19 element predicted scores
  const predictedScore = Math.round(
    elementAnalysis.reduce((s, e) => s + e.predictedScore, 0) / elementAnalysis.length,
  );

  const gapWarnings = detectGaps(
    elementAnalysis,
    data.expiringCredentialCount,
    data.flaggedSubcontractorCount,
  );

  // Confidence = high if >10 elements have data, medium if 5-10, low if <5
  const coveredElements = elementAnalysis.filter((e) => e.entryCount > 0).length;
  const confidenceLevel =
    coveredElements >= 10 ? "high" : coveredElements >= 5 ? "medium" : "low";

  const aiNarrative = await generateAINarrative(
    predictedScore,
    gapWarnings,
    elementAnalysis,
    data.expiringCredentialCount,
    data.flaggedSubcontractorCount,
  );

  return {
    predictedScore,
    confidenceLevel,
    elementAnalysis,
    gapWarnings,
    aiNarrative,
    expiringCredentialCount: data.expiringCredentialCount,
    flaggedSubcontractorCount: data.flaggedSubcontractorCount,
    generatedAt: new Date().toISOString(),
    lookbackDays,
  };
}
