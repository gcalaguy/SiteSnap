import { logger } from "../../lib/logger";
import { upsertCorAuditEntry, maybeAutoCreateCapa } from "../../repositories/cor";
import { PSI_HAZARD_CATEGORIES, type PsiHazardCategoryKey } from "@workspace/db";

// ── IHSA element keyword map ──────────────────────────────────────────────────
// Each entry: keywords (lowercased) → element value + display name

interface ElementMapping {
  element: string;
  name: string;
  keywords: string[];
}

const ELEMENT_MAPPINGS: ElementMapping[] = [
  {
    element: "element_1",
    name: "Management Leadership & Commitment",
    keywords: ["management", "leadership", "commitment", "policy", "program review"],
  },
  {
    element: "element_2",
    name: "Hazard Identification, Assessment & Control",
    keywords: [
      "ppe", "personal protective", "helmet", "hard hat", "harness", "gloves",
      "goggles", "safety glasses", "hi-vis", "high visibility", "vest",
      "fall arrest", "respiratory", "ear protection", "hazard", "risk assessment",
    ],
  },
  {
    element: "element_3",
    name: "Hazard Control Measures",
    keywords: ["guard", "barrier", "barricade", "lockout", "tagout", "loto", "control measure"],
  },
  {
    element: "element_4",
    name: "Ongoing Inspections",
    keywords: ["inspection", "checklist", "walkthrough", "audit", "review of site"],
  },
  {
    element: "element_5",
    name: "Qualifications, Orientations & Training",
    keywords: ["training", "certification", "certificate", "orientation", "competency", "qualification"],
  },
  {
    element: "element_6",
    name: "Emergency Response",
    keywords: ["emergency", "evacuation", "muster", "alarm", "first responder", "spill response"],
  },
  {
    element: "element_7",
    name: "Incident Reporting & Investigation",
    keywords: ["incident", "accident", "injury", "near miss", "near-miss", "investigation"],
  },
  {
    element: "element_8",
    name: "Program Administration",
    keywords: ["documentation", "record", "procedure", "program", "administration"],
  },
  {
    element: "element_9",
    name: "Worker Participation",
    keywords: ["joint health", "jhsc", "safety committee", "worker rep", "participation"],
  },
  {
    element: "element_10",
    name: "Workplace Housekeeping",
    keywords: [
      "housekeeping", "clean", "debris", "clutter", "waste", "tidy", "organized",
      "material storage", "stacking", "mess",
    ],
  },
  {
    element: "element_11",
    name: "Environmental Protection",
    keywords: ["spill", "environmental", "contamination", "discharge", "soil", "runoff"],
  },
  {
    element: "element_12",
    name: "Safety Equipment & First Aid",
    keywords: ["first aid", "kit", "aed", "defibrillator", "eyewash", "safety equipment"],
  },
  {
    element: "element_13",
    name: "Fire Safety & Fire Extinguishers",
    keywords: [
      "fire extinguisher", "fire suppression", "fire", "flammable", "combustible",
      "hot work", "smoke", "co2", "extinguisher", "fire exit", "sprinkler",
    ],
  },
  {
    element: "element_14",
    name: "WHMIS & Controlled Products",
    keywords: ["whmis", "sds", "chemical", "hazardous material", "controlled product", "label"],
  },
];

function classifyText(text: string): ElementMapping | null {
  const lower = text.toLowerCase();
  for (const mapping of ELEMENT_MAPPINGS) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      return mapping;
    }
  }
  return null;
}

function getElementMapping(elementId: string): ElementMapping {
  return ELEMENT_MAPPINGS.find((m) => m.element === elementId) ?? ELEMENT_MAPPINGS[1]!; // default element_2
}

/** Classify freeform hazard/inspection text into an IHSA element, falling back to `fallbackElementId` (default: element_2, Hazard ID/PPE) when no keyword matches. Exported so callers outside this module (e.g. a manual CAPA-creation route) can classify the same text consistently with how the audit trail bucketed it. */
export function classifyForElement(text: string, fallbackElementId = "element_2"): ElementMapping {
  return classifyText(text) ?? getElementMapping(fallbackElementId);
}

// PSI hazard categories are fixed and well-understood, so they're mapped to an
// IHSA element explicitly rather than run through keyword classification.
const PSI_CATEGORY_TO_ELEMENT: Record<PsiHazardCategoryKey, string> = {
  environmental: "element_11",
  ergonomic: "element_2",
  ppe: "element_2",
  workingAtHeight: "element_3",
  activity: "element_3",
  equipment: "element_4",
  trafficControl: "element_3",
  personalLimitation: "element_5",
  additionalEquipment: "element_4",
};

// ── Shared insert helper ──────────────────────────────────────────────────────

interface AuditEntry {
  companyId: number;
  projectId: number;
  submittedByUserId: number | null;
  sourceType: "form_submission" | "inspection" | "safety_signoff" | "daily_log" | "psi_checklist" | "voice_inspection" | "safety_scan";
  sourceRecordId: number;
  element: ElementMapping;
  findingType: "pass" | "fail";
  description: string;
  score: number;
  snapshot: Record<string, unknown>;
}

async function writeAuditEntries(entries: AuditEntry[]): Promise<void> {
  const rows = await Promise.all(
    entries.map((e) =>
      upsertCorAuditEntry({
        companyId: e.companyId,
        projectId: e.projectId,
        submittedByUserId: e.submittedByUserId,
        sourceType: e.sourceType,
        sourceRecordId: e.sourceRecordId,
        ihsaElement: e.element.element as any,
        ihsaElementName: e.element.name,
        findingType: e.findingType,
        findingDescription: e.description,
        complianceScore: e.score,
        evidenceSnapshot: e.snapshot,
      }),
    ),
  );

  // Auto-generate a CAPA ticket for each new fail finding (fire-and-forget)
  for (const row of rows) {
    if (row.findingType === "fail") {
      maybeAutoCreateCapa(row).catch((err) =>
        logger.warn({ err, auditEntryId: row.id }, "Auto-CAPA creation failed — non-fatal"),
      );
    }
  }
}

// ── Public processors ─────────────────────────────────────────────────────────

interface FormSubmission {
  id: number;
  projectId: number | null;
  userId: number;
  data: Record<string, unknown> | null;
  templateId?: number;
}

export async function processFormSubmission(
  submission: FormSubmission,
  companyId: number,
): Promise<void> {
  if (!submission.projectId) return;

  try {
    const data = submission.data ?? {};
    const entries: AuditEntry[] = [];

    for (const [key, value] of Object.entries(data)) {
      const isFail =
        value === false ||
        value === "fail" ||
        value === "no" ||
        value === "No" ||
        value === "FALSE";

      const textToClassify = key.replace(/_/g, " ");
      const mapping = classifyText(textToClassify);
      if (!mapping) continue;

      const passCount = isFail ? 0 : 1;
      const score = passCount * 100;

      entries.push({
        companyId,
        projectId: submission.projectId,
        submittedByUserId: submission.userId,
        sourceType: "form_submission",
        sourceRecordId: submission.id,
        element: mapping,
        findingType: isFail ? "fail" : "pass",
        description: `Form field "${key}": ${isFail ? "failed" : "passed"}`,
        score,
        snapshot: {
          fieldKey: key,
          fieldValue: value,
          templateId: submission.templateId,
        },
      });
    }

    if (entries.length > 0) {
      await writeAuditEntries(entries);
    }
  } catch (err) {
    logger.error({ err, submissionId: submission.id }, "COR evidence aggregation failed (form)");
  }
}

interface SafetySignoff {
  id: number;
  projectId: number;
  workerId: number;
  responses: Record<string, unknown> | null;
}

export async function processSafetySignoff(
  signoff: SafetySignoff,
  companyId: number,
): Promise<void> {
  try {
    const responses = signoff.responses ?? {};
    const entries: AuditEntry[] = [];

    const allValues = Object.values(responses);
    const totalAnswered = allValues.length;
    if (totalAnswered === 0) return;

    const isFails = allValues.filter(
      (v) => v === false || v === "no" || v === "No" || v === "fail",
    );
    const failedKeys = Object.entries(responses)
      .filter(([, v]) => v === false || v === "no" || v === "No" || v === "fail")
      .map(([k]) => k);

    // Classify the whole signoff as a pass/fail against element_2 (PPE/Hazard)
    // unless specific keywords can refine it further
    const allText = Object.keys(responses).join(" ");
    const mapping = classifyText(allText) ?? ELEMENT_MAPPINGS[1]; // default element_2
    const failRatio = isFails.length / totalAnswered;
    const score = Math.round((1 - failRatio) * 100);

    entries.push({
      companyId,
      projectId: signoff.projectId,
      submittedByUserId: signoff.workerId,
      sourceType: "safety_signoff",
      sourceRecordId: signoff.id,
      element: mapping,
      findingType: isFails.length > 0 ? "fail" : "pass",
      description:
        isFails.length > 0
          ? `Safety signoff: ${isFails.length}/${totalAnswered} checks failed (${failedKeys.join(", ")})`
          : `Safety signoff: all ${totalAnswered} checks passed`,
      score,
      snapshot: {
        totalAnswered,
        failCount: isFails.length,
        failedKeys,
      },
    });

    await writeAuditEntries(entries);
  } catch (err) {
    logger.error({ err, signoffId: signoff.id }, "COR evidence aggregation failed (signoff)");
  }
}

interface InspectionItem {
  itemName: string;
  status: string; // "pass" | "fail" | "na"
  severity: string;
  comment?: string | null;
}

interface Inspection {
  id: number;
  projectId: number | null;
  inspectorId: number;
  inspectionType: string;
}

export async function processInspection(
  inspection: Inspection,
  items: InspectionItem[],
  companyId: number,
): Promise<void> {
  if (!inspection.projectId) return;

  try {
    // Group items by their classified IHSA element
    const byElement = new Map<string, { mapping: ElementMapping; passed: number; failed: number; failedNames: string[] }>();

    for (const item of items) {
      if (item.status === "na") continue;
      const mapping = classifyText(item.itemName) ?? ELEMENT_MAPPINGS[3]; // default element_4 (inspections)

      if (!byElement.has(mapping.element)) {
        byElement.set(mapping.element, { mapping, passed: 0, failed: 0, failedNames: [] });
      }

      const entry = byElement.get(mapping.element)!;
      if (item.status === "fail") {
        entry.failed++;
        entry.failedNames.push(item.itemName);
      } else {
        entry.passed++;
      }
    }

    if (byElement.size === 0) return;

    const entries: AuditEntry[] = [];
    for (const [, group] of byElement) {
      const total = group.passed + group.failed;
      const score = total === 0 ? 100 : Math.round((group.passed / total) * 100);

      entries.push({
        companyId,
        projectId: inspection.projectId,
        submittedByUserId: inspection.inspectorId,
        sourceType: "inspection",
        sourceRecordId: inspection.id,
        element: group.mapping,
        findingType: group.failed > 0 ? "fail" : "pass",
        description:
          group.failed > 0
            ? `Inspection "${inspection.inspectionType}": ${group.failed} failed item(s) — ${group.failedNames.join(", ")}`
            : `Inspection "${inspection.inspectionType}": all ${group.passed} item(s) passed`,
        score,
        snapshot: {
          inspectionType: inspection.inspectionType,
          passCount: group.passed,
          failCount: group.failed,
          failedItems: group.failedNames,
        },
      });
    }

    await writeAuditEntries(entries);
  } catch (err) {
    logger.error(
      { err, inspectionId: inspection.id },
      "COR evidence aggregation failed (inspection)",
    );
  }
}

interface PsiChecklistHazardValue {
  checked?: string[];
  otherText?: string;
  other2Text?: string;
  other3Text?: string;
}

interface PsiChecklistForEvidence {
  id: number;
  projectId: number;
  createdByUserId: number;
  hazards: Partial<Record<PsiHazardCategoryKey, PsiChecklistHazardValue>> | null;
}

// A submitted PSI checklist is itself positive hazard-identification evidence —
// unlike forms/signoffs/inspections it has no pass/fail semantics, so it never
// drives CAPA auto-creation (writeAuditEntries only does that for "fail" rows).
export async function processPsiChecklist(
  psi: PsiChecklistForEvidence,
  companyId: number,
): Promise<void> {
  try {
    const hazards = psi.hazards ?? {};
    const byElement = new Map<string, { mapping: ElementMapping; categories: string[]; itemCount: number }>();

    for (const key of Object.keys(hazards) as PsiHazardCategoryKey[]) {
      const value = hazards[key];
      const checkedCount = value?.checked?.length ?? 0;
      const hasOtherText = Boolean(value?.otherText || value?.other2Text || value?.other3Text);
      if (checkedCount === 0 && !hasOtherText) continue;

      const elementId = PSI_CATEGORY_TO_ELEMENT[key] ?? "element_2";
      const mapping = getElementMapping(elementId);
      const categoryTitle = PSI_HAZARD_CATEGORIES[key]?.title ?? key;

      if (!byElement.has(elementId)) {
        byElement.set(elementId, { mapping, categories: [], itemCount: 0 });
      }
      const entry = byElement.get(elementId)!;
      entry.categories.push(categoryTitle);
      entry.itemCount += checkedCount + (hasOtherText ? 1 : 0);
    }

    if (byElement.size === 0) return;

    const entries: AuditEntry[] = [];
    for (const [, group] of byElement) {
      entries.push({
        companyId,
        projectId: psi.projectId,
        submittedByUserId: psi.createdByUserId,
        sourceType: "psi_checklist",
        sourceRecordId: psi.id,
        element: group.mapping,
        findingType: "pass",
        description: `Pre-site inspection checklist identified ${group.itemCount} hazard(s) across: ${group.categories.join(", ")}`,
        score: 100,
        snapshot: {
          categories: group.categories,
          itemCount: group.itemCount,
        },
      });
    }

    await writeAuditEntries(entries);
  } catch (err) {
    logger.error({ err, psiId: psi.id }, "COR evidence aggregation failed (psi checklist)");
  }
}

interface VoiceInspectionForEvidence {
  id: number;
  projectId: number;
  submittedByUserId: number | null;
  equipmentOrArea: string | null;
  inspectionType: string | null;
  locationDetails: string | null;
  hazardSummary: string | null;
  passStatus: "pass" | "fail" | "conditional" | null;
  severityLevel: "low" | "medium" | "high" | "critical" | null;
}

// Shared severity → compliance-score bridge for AI features whose output is a
// low/medium/high/critical risk level rather than a native 0-100 score.
const RISK_SEVERITY_SCORE: Record<string, number> = {
  critical: 10,
  high: 35,
  medium: 65,
  low: 90,
};

// A voice inspection already has its own dedicated hazard→CAPA bridge
// (createCapaFromVoiceInspection, triggered by severity + immediate_action_required),
// so — unlike the other processors — this calls upsertCorAuditEntry directly
// instead of writeAuditEntries, to avoid a second, undeduped CAPA ticket being
// auto-created from the generic "fail" finding path.
export async function processVoiceInspection(
  inspection: VoiceInspectionForEvidence,
  companyId: number,
): Promise<{ element: string } | null> {
  try {
    const classifyInput = [
      inspection.equipmentOrArea,
      inspection.inspectionType,
      inspection.locationDetails,
      inspection.hazardSummary,
    ]
      .filter(Boolean)
      .join(" ");
    const mapping = classifyText(classifyInput) ?? getElementMapping("element_4");

    const findingType: "pass" | "fail" = inspection.passStatus === "pass" ? "pass" : "fail";
    const score = RISK_SEVERITY_SCORE[inspection.severityLevel ?? "low"] ?? 90;

    await upsertCorAuditEntry({
      companyId,
      projectId: inspection.projectId,
      submittedByUserId: inspection.submittedByUserId,
      sourceType: "voice_inspection",
      sourceRecordId: inspection.id,
      ihsaElement: mapping.element as any,
      ihsaElementName: mapping.name,
      findingType,
      findingDescription:
        inspection.hazardSummary ??
        `Voice inspection of ${inspection.equipmentOrArea ?? "site"}: ${inspection.passStatus ?? "conditional"}`,
      complianceScore: score,
      evidenceSnapshot: {
        equipmentOrArea: inspection.equipmentOrArea,
        inspectionType: inspection.inspectionType,
        passStatus: inspection.passStatus,
        severityLevel: inspection.severityLevel,
      },
    });

    return { element: mapping.element };
  } catch (err) {
    logger.error({ err, inspectionId: inspection.id }, "COR evidence aggregation failed (voice inspection)");
    return null;
  }
}

interface SafetyScanForEvidence {
  id: number;
  projectId: number;
  submittedByUserId: number | null;
  summary: string | null;
  complianceScore: number | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
}

interface SafetyScanHazardForEvidence {
  id: number;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

// Like processVoiceInspection, this calls upsertCorAuditEntry directly rather
// than writeAuditEntries — Safety Scanner hazards already have their own
// per-hazard "Create Corrective Action" button (createCapaFromScanHazard),
// so letting the generic "fail" finding path auto-create a second, undeduped
// CAPA per element bucket would double up on that existing flow.
export async function processSafetyScan(
  scan: SafetyScanForEvidence,
  hazards: SafetyScanHazardForEvidence[],
  companyId: number,
): Promise<void> {
  try {
    if (hazards.length === 0) {
      const mapping = classifyForElement(scan.summary ?? "");
      await upsertCorAuditEntry({
        companyId,
        projectId: scan.projectId,
        submittedByUserId: scan.submittedByUserId,
        sourceType: "safety_scan",
        sourceRecordId: scan.id,
        ihsaElement: mapping.element as any,
        ihsaElementName: mapping.name,
        findingType: "pass",
        findingDescription:
          scan.summary ?? `AI Safety Scan: no hazards identified (compliance score ${scan.complianceScore ?? 100}%)`,
        complianceScore: scan.complianceScore ?? 100,
        evidenceSnapshot: { riskLevel: scan.riskLevel, hazardCount: 0 },
      });
      return;
    }

    const byElement = new Map<string, { mapping: ElementMapping; hazards: SafetyScanHazardForEvidence[] }>();
    for (const hazard of hazards) {
      const mapping = classifyForElement(`${hazard.title} ${hazard.description}`);
      if (!byElement.has(mapping.element)) byElement.set(mapping.element, { mapping, hazards: [] });
      byElement.get(mapping.element)!.hazards.push(hazard);
    }

    for (const [, group] of byElement) {
      const avgScore = Math.round(
        group.hazards.reduce((s, h) => s + (RISK_SEVERITY_SCORE[h.severity] ?? 50), 0) / group.hazards.length,
      );
      await upsertCorAuditEntry({
        companyId,
        projectId: scan.projectId,
        submittedByUserId: scan.submittedByUserId,
        sourceType: "safety_scan",
        sourceRecordId: scan.id,
        ihsaElement: group.mapping.element as any,
        ihsaElementName: group.mapping.name,
        findingType: "fail",
        findingDescription: `AI Safety Scan identified ${group.hazards.length} hazard(s): ${group.hazards.map((h) => h.title).join(", ")}`,
        complianceScore: avgScore,
        evidenceSnapshot: {
          hazardTitles: group.hazards.map((h) => h.title),
          severities: group.hazards.map((h) => h.severity),
        },
      });
    }
  } catch (err) {
    logger.error({ err, scanId: scan.id }, "COR evidence aggregation failed (safety scan)");
  }
}
