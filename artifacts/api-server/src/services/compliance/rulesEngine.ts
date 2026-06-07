/**
 * Deterministic static Rules Engine for compliance directives.
 *
 * Produces directive suggestions purely from keyword matching and source-type
 * rules — no AI, no network calls. Always succeeds, even with empty input.
 */

import type {
  ComplianceTargetForm,
  ComplianceUrgency,
  ComplianceSourceType,
} from "./types";

export interface RulesSuggestion {
  targetFormId: ComplianceTargetForm;
  urgency: ComplianceUrgency;
  workerDirective: string;
  triggerKeywords: string[];
  confidenceScore: number;
}

// ── Rule definitions ──────────────────────────────────────────────────────────

interface KeywordRule {
  keywords: string[];
  targetFormId: ComplianceTargetForm;
  urgency: ComplianceUrgency;
  workerDirective: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  // Fall-arrest / working at heights
  {
    keywords: ["fall", "fell", "falling", "heights", "roof", "scaffold", "ladder", "harness", "arrest", "elevated"],
    targetFormId: "hazard_id",
    urgency: "HIGH",
    workerDirective:
      "A potential fall hazard has been detected. Complete a Hazard Identification form immediately and verify all fall-arrest equipment is in place before work continues.",
  },
  // Near-miss / incident language
  {
    keywords: ["near miss", "near-miss", "almost hit", "close call", "almost fell", "incident", "injury", "hurt", "accident", "struck"],
    targetFormId: "incident_investigation",
    urgency: "HIGH",
    workerDirective:
      "A near-miss or incident has been reported. Complete an Incident Investigation form within 24 hours and notify your safety officer.",
  },
  // PPE gaps
  {
    keywords: ["no ppe", "without ppe", "missing ppe", "no helmet", "no hard hat", "no gloves", "no vest", "no safety glasses", "ppe missing"],
    targetFormId: "toolbox_talk",
    urgency: "MEDIUM",
    workerDirective:
      "PPE non-compliance has been detected on site. Conduct a Toolbox Talk on PPE requirements before the next shift.",
  },
  // Hazardous materials
  {
    keywords: ["asbestos", "lead", "silica", "mould", "mold", "chemical", "spill", "hazmat", "toxic", "fume", "vapour", "vapor"],
    targetFormId: "site_inspection",
    urgency: "HIGH",
    workerDirective:
      "Hazardous material exposure risk detected. Perform a Site Inspection and ensure WHMIS protocols are followed before re-entering the area.",
  },
  // Electrical
  {
    keywords: ["electrical", "live wire", "exposed wire", "power line", "electrocution", "arc flash", "voltage"],
    targetFormId: "hazard_id",
    urgency: "HIGH",
    workerDirective:
      "Electrical hazard identified. Complete a Hazard Identification form and lock out / tag out all affected circuits before work continues.",
  },
  // Training gaps
  {
    keywords: ["untrained", "not trained", "no training", "first time", "new worker", "orientation missing", "certification expired"],
    targetFormId: "training_record",
    urgency: "MEDIUM",
    workerDirective:
      "A training gap has been identified. Ensure the affected worker completes the required training and update the Training Record.",
  },
  // Ministry / audit preparation
  {
    keywords: ["ministry", "mto", "mlitsd", "inspection order", "order issued", "compliance order", "stop work order", "audit"],
    targetFormId: "audit_prep",
    urgency: "HIGH",
    workerDirective:
      "A regulatory or ministry action has been flagged. Begin Audit Preparation immediately and contact your compliance officer.",
  },
];

// ── Source-type rules ─────────────────────────────────────────────────────────

interface SourceTypeRule {
  sourceTypes: ComplianceSourceType[];
  targetFormId: ComplianceTargetForm;
  urgency: ComplianceUrgency;
  workerDirective: string;
  confidenceScore: number;
}

const SOURCE_TYPE_RULES: SourceTypeRule[] = [
  {
    sourceTypes: ["WEATHER"],
    targetFormId: "site_inspection",
    urgency: "MEDIUM",
    workerDirective:
      "Adverse weather conditions have been flagged. Conduct a Site Inspection to assess outdoor work areas before crews resume.",
    confidenceScore: 60,
  },
  {
    sourceTypes: ["SCHEDULE"],
    targetFormId: "toolbox_talk",
    urgency: "LOW",
    workerDirective:
      "An upcoming schedule change may affect crew safety briefings. Schedule a Toolbox Talk before the new phase begins.",
    confidenceScore: 50,
  },
];

// ── Engine ────────────────────────────────────────────────────────────────────

export interface RulesEngineInput {
  text: string;
  sourceType: ComplianceSourceType;
}

export function runRulesEngine(input: RulesEngineInput): RulesSuggestion[] {
  const lowerText = input.text.toLowerCase();
  const suggestions: RulesSuggestion[] = [];

  // Keyword pass — match any rule where at least one keyword appears
  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.filter((kw) => lowerText.includes(kw));
    if (matched.length === 0) continue;

    // Confidence scales with number of matched keywords (capped at 85)
    const confidenceScore = Math.min(40 + matched.length * 15, 85);

    suggestions.push({
      targetFormId: rule.targetFormId,
      urgency: rule.urgency,
      workerDirective: rule.workerDirective,
      triggerKeywords: matched,
      confidenceScore,
    });
  }

  // Source-type pass — always fire for specific source types regardless of text
  for (const stRule of SOURCE_TYPE_RULES) {
    if (stRule.sourceTypes.includes(input.sourceType)) {
      suggestions.push({
        targetFormId: stRule.targetFormId,
        urgency: stRule.urgency,
        workerDirective: stRule.workerDirective,
        triggerKeywords: [input.sourceType.toLowerCase()],
        confidenceScore: stRule.confidenceScore,
      });
    }
  }

  // Deduplicate: keep highest-confidence suggestion per targetFormId
  const seen = new Map<ComplianceTargetForm, RulesSuggestion>();
  for (const s of suggestions) {
    const existing = seen.get(s.targetFormId);
    if (!existing || s.confidenceScore > existing.confidenceScore) {
      seen.set(s.targetFormId, s);
    }
  }

  return Array.from(seen.values());
}
