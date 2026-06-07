/**
 * Deterministic static Rules Engine for compliance directives.
 *
 * Three independent passes run in order — all produce RulesSuggestion arrays
 * which are combined and deduplicated (highest confidence wins per form type):
 *
 *  PASS 1 — Work-type rules  (structured, ~95% confidence, zero token cost)
 *  PASS 2 — Keyword rules    (text-based, confidence scales with match count)
 *  PASS 3 — Source-type rules (always fires for specific source types)
 *
 * No AI, no network calls. Always succeeds, even with empty input.
 */

import type {
  ComplianceTargetForm,
  ComplianceUrgency,
  ComplianceSourceType,
  WorkType,
} from "./types";

export interface RulesSuggestion {
  targetFormId: ComplianceTargetForm;
  urgency: ComplianceUrgency;
  workerDirective: string;
  triggerKeywords: string[];
  confidenceScore: number;
}

// ── PASS 1: Work-type rules ───────────────────────────────────────────────────
// These fire when the field event carries a structured workType value.
// Confidence is set to 95 (deterministic structured input → very high certainty).
// Each work type maps to one or more required safety forms.

interface WorkTypeDirective {
  targetFormId: ComplianceTargetForm;
  urgency: ComplianceUrgency;
  workerDirective: string;
}

interface WorkTypeRule {
  workTypes: WorkType[];
  directives: WorkTypeDirective[];
}

const WORK_TYPE_RULES: WorkTypeRule[] = [
  {
    workTypes: ["excavation", "trenching"],
    directives: [
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Excavation / trenching work is scheduled. Conduct a Site Inspection to verify trench walls are shored or sloped per OHSA O. Reg. 213/91 before any worker enters.",
      },
      {
        targetFormId: "hazard_id",
        urgency: "HIGH",
        workerDirective:
          "Utility Locate Verification required before excavation begins. Complete a Hazard Identification form confirming all underground utilities have been marked by Ontario One Call (or provincial equivalent).",
      },
    ],
  },
  {
    workTypes: ["roofing"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "HIGH",
        workerDirective:
          "Roofing work is scheduled. Complete a Fall Protection Inspection (Hazard ID) verifying guardrails, safety nets, or personal fall-arrest systems are in place per OHSA O. Reg. 213/91 s.26.",
      },
      {
        targetFormId: "toolbox_talk",
        urgency: "HIGH",
        workerDirective:
          "Conduct a pre-shift Toolbox Talk covering fall protection procedures, roof edge awareness, and anchor point inspection before roofing crews begin.",
      },
    ],
  },
  {
    workTypes: ["electrical"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "HIGH",
        workerDirective:
          "Electrical work is scheduled. Complete a Hazard Identification form confirming lockout/tagout (LOTO) procedures are applied and all circuits are de-energized per OHSA O. Reg. 851.",
      },
      {
        targetFormId: "toolbox_talk",
        urgency: "MEDIUM",
        workerDirective:
          "Conduct a Toolbox Talk on electrical safety, arc-flash boundaries, and required PPE (rated gloves, face shields) before work begins.",
      },
    ],
  },
  {
    workTypes: ["confined_space"],
    directives: [
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Confined space entry is planned. Perform a pre-entry Site Inspection: test atmosphere (O₂, LEL, toxic gas), verify ventilation, confirm rescue plan and standby attendant per OHSA O. Reg. 632/05.",
      },
      {
        targetFormId: "training_record",
        urgency: "HIGH",
        workerDirective:
          "Verify all workers entering the confined space hold current Confined Space Entry certification. Update Training Records before entry is permitted.",
      },
    ],
  },
  {
    workTypes: ["scaffolding"],
    directives: [
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Scaffolding erection or use is scheduled. A competent person must inspect the scaffold and complete a Site Inspection record before any worker ascends (OHSA O. Reg. 213/91 s.130).",
      },
      {
        targetFormId: "hazard_id",
        urgency: "HIGH",
        workerDirective:
          "Complete a Hazard Identification form confirming scaffold load capacity, tie-back spacing, base plates, and guardrail heights meet code before use.",
      },
    ],
  },
  {
    workTypes: ["crane_lifting"],
    directives: [
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Crane or hoisting operations are scheduled. Conduct a pre-lift Site Inspection: verify crane certification, operator licence, load radius chart, and exclusion zones per OHSA O. Reg. 213/91 Part VIII.",
      },
      {
        targetFormId: "toolbox_talk",
        urgency: "HIGH",
        workerDirective:
          "Hold a pre-lift Toolbox Talk covering lift plan, signal-person roles, exclusion zones, and emergency procedures with all crew before any rigging begins.",
      },
    ],
  },
  {
    workTypes: ["demolition"],
    directives: [
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Demolition work is scheduled. Conduct a Site Inspection confirming structural stability assessment, utility disconnection, and dust/debris containment measures are in place per OHSA O. Reg. 213/91 Part III.",
      },
      {
        targetFormId: "hazard_id",
        urgency: "HIGH",
        workerDirective:
          "Complete a Hazard Identification form for demolition activities, covering structural collapse risk, falling debris zones, and any suspected hazardous materials (asbestos, lead paint) before work begins.",
      },
    ],
  },
  {
    workTypes: ["asbestos_abatement"],
    directives: [
      {
        targetFormId: "training_record",
        urgency: "HIGH",
        workerDirective:
          "Asbestos abatement requires workers to hold current Type 1/2/3 asbestos worker certification per Ontario Reg. 278/05. Verify and update Training Records before the work area is accessed.",
      },
      {
        targetFormId: "site_inspection",
        urgency: "HIGH",
        workerDirective:
          "Perform a pre-abatement Site Inspection: confirm enclosure/containment setup, negative air pressure, decontamination unit, and disposal containers are in place per O. Reg. 278/05.",
      },
      {
        targetFormId: "audit_prep",
        urgency: "MEDIUM",
        workerDirective:
          "Asbestos abatement must be notified to the Ministry of Labour, Immigration, Training and Skills Development (MLITSD) at least 24 hours in advance. Ensure Audit Preparation records include the notification reference number.",
      },
    ],
  },
  {
    workTypes: ["welding_cutting"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "MEDIUM",
        workerDirective:
          "Welding or cutting operations are scheduled. Complete a Hazard Identification form covering fire watch requirements, ventilation for fume control, and hot-work permit issuance.",
      },
      {
        targetFormId: "toolbox_talk",
        urgency: "MEDIUM",
        workerDirective:
          "Conduct a Toolbox Talk on hot-work safety: fire extinguisher location, 35-foot clearance rule, respiratory protection for fumes, and post-work fire watch duration.",
      },
    ],
  },
  {
    workTypes: ["concrete"],
    directives: [
      {
        targetFormId: "toolbox_talk",
        urgency: "MEDIUM",
        workerDirective:
          "Concrete work is scheduled. Conduct a Toolbox Talk covering alkaline burn prevention (PPE: gloves, eye protection, waterproof boots), formwork loading limits, and wet concrete disposal procedures.",
      },
      {
        targetFormId: "site_inspection",
        urgency: "MEDIUM",
        workerDirective:
          "Inspect formwork and shoring for structural adequacy before any concrete pour per OHSA O. Reg. 213/91 s.87. Document findings in a Site Inspection record.",
      },
    ],
  },
  {
    workTypes: ["plumbing"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "MEDIUM",
        workerDirective:
          "Plumbing work is scheduled. Complete a Hazard Identification form covering pipe pressure isolation, potential exposure to sewage/grey water pathogens, and confined-space risks for underground work.",
      },
    ],
  },
  {
    workTypes: ["framing"],
    directives: [
      {
        targetFormId: "toolbox_talk",
        urgency: "MEDIUM",
        workerDirective:
          "Framing work is scheduled. Conduct a Toolbox Talk on floor-opening protection, temporary guard rails, and safe handling of lumber and nail guns before the shift begins.",
      },
    ],
  },
  {
    workTypes: ["painting_coatings"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "MEDIUM",
        workerDirective:
          "Painting or coatings work is scheduled. Complete a Hazard Identification form covering VOC exposure limits, ventilation requirements, and SDS (Safety Data Sheet) availability per WHMIS 2015.",
      },
    ],
  },
  {
    workTypes: ["hvac"],
    directives: [
      {
        targetFormId: "hazard_id",
        urgency: "MEDIUM",
        workerDirective:
          "HVAC work is scheduled. Complete a Hazard Identification form confirming refrigerant handling certifications, LOTO on electrical/pneumatic systems, and fall protection for rooftop unit access.",
      },
    ],
  },
  {
    workTypes: ["masonry"],
    directives: [
      {
        targetFormId: "toolbox_talk",
        urgency: "MEDIUM",
        workerDirective:
          "Masonry work is scheduled. Conduct a Toolbox Talk covering silica dust control (wet cutting, respiratory protection, HEPA vacuums), scaffold inspection, and mortar/chemical burn prevention.",
      },
    ],
  },
  {
    workTypes: ["general_labour"],
    directives: [
      {
        targetFormId: "toolbox_talk",
        urgency: "LOW",
        workerDirective:
          "General labour is scheduled. Conduct a daily Toolbox Talk reviewing site hazards, PPE requirements, emergency muster points, and any new crew members' site orientations.",
      },
    ],
  },
];

// ── PASS 2: Keyword rules ─────────────────────────────────────────────────────

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

// ── PASS 3: Source-type rules ─────────────────────────────────────────────────

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
  workType?: WorkType;
}

export function runRulesEngine(input: RulesEngineInput): RulesSuggestion[] {
  const suggestions: RulesSuggestion[] = [];

  // ── PASS 1: Work-type rules (deterministic, highest confidence) ────────────
  if (input.workType) {
    for (const rule of WORK_TYPE_RULES) {
      if (!rule.workTypes.includes(input.workType)) continue;
      for (const directive of rule.directives) {
        suggestions.push({
          targetFormId: directive.targetFormId,
          urgency: directive.urgency,
          workerDirective: directive.workerDirective,
          triggerKeywords: [input.workType],
          confidenceScore: 95,
        });
      }
    }
  }

  // ── PASS 2: Keyword rules ─────────────────────────────────────────────────
  const lowerText = input.text.toLowerCase();
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

  // ── PASS 3: Source-type rules ─────────────────────────────────────────────
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

  // ── Deduplicate: keep highest-confidence suggestion per targetFormId ───────
  const seen = new Map<ComplianceTargetForm, RulesSuggestion>();
  for (const s of suggestions) {
    const existing = seen.get(s.targetFormId);
    if (!existing || s.confidenceScore > existing.confidenceScore) {
      seen.set(s.targetFormId, s);
    }
  }

  return Array.from(seen.values());
}
