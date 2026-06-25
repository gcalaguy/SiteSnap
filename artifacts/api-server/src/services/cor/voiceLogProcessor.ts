import { openai } from "@workspace/integrations-openai-ai-server";
import { db, tasksTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { createVoiceActionLog } from "../../repositories/cor";
import type { CorVoiceActionLog } from "@workspace/db";

// ── Keyword-based fallback classifier ────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low";

interface ClassificationResult {
  riskLevel: RiskLevel;
  ihsaElement: string | null;
  synopsis: string | null;
  actionRequired: string;
  usedFallback: boolean;
}

const RISK_KEYWORDS: Array<{ patterns: RegExp; level: RiskLevel }> = [
  { patterns: /\b(collapse|fall|fell|falling|explosion|fire|electrocution|critical|immediate|fatality|fatal|severe)\b/i, level: "critical" },
  { patterns: /\b(hazard|danger|dangerous|unsafe|blocked|missing ppe|no harness|no helmet|exposed wire|gas leak)\b/i, level: "high" },
  { patterns: /\b(housekeeping|debris|clutter|slippery|worn|damaged|missing label|expired)\b/i, level: "medium" },
];

const ELEMENT_PATTERNS: Array<{ pattern: RegExp; element: string }> = [
  { pattern: /\b(ppe|helmet|harness|gloves|goggles|hi.vis|hard hat|vest|fall arrest|personal protective)\b/i, element: "element_2" },
  { pattern: /\b(housekeeping|clutter|debris|clean|waste|tidy|mess)\b/i, element: "element_10" },
  { pattern: /\b(fire extinguisher|fire|extinguisher|flammable|hot work|sprinkler|combustible)\b/i, element: "element_13" },
  { pattern: /\b(whmis|chemical|sds|hazardous material|controlled product)\b/i, element: "element_14" },
  { pattern: /\b(training|certification|certificate|orientation|competency)\b/i, element: "element_5" },
  { pattern: /\b(emergency|evacuation|muster|alarm|spill)\b/i, element: "element_6" },
  { pattern: /\b(incident|accident|injury|near miss|investigation)\b/i, element: "element_7" },
  { pattern: /\b(inspection|checklist|audit|walkthrough)\b/i, element: "element_4" },
];

function classifyByKeyword(transcript: string): Omit<ClassificationResult, "usedFallback"> {
  let riskLevel: RiskLevel = "low";
  for (const { patterns, level } of RISK_KEYWORDS) {
    if (patterns.test(transcript)) {
      riskLevel = level;
      break;
    }
  }

  let ihsaElement: string | null = null;
  for (const { pattern, element } of ELEMENT_PATTERNS) {
    if (pattern.test(transcript)) {
      ihsaElement = element;
      break;
    }
  }

  return {
    riskLevel,
    ihsaElement,
    synopsis: null,
    actionRequired: `Review and address the issue described: "${transcript.slice(0, 100)}"`,
  };
}

// ── OpenAI classifier ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Canadian construction safety officer trained in Ontario IHSA COR compliance.
Classify the following field safety observation and respond with valid JSON only.

Schema:
{
  "riskLevel": "critical" | "high" | "medium" | "low",
  "ihsaElement": "element_1" | "element_2" | "element_3" | "element_4" | "element_5" | "element_6" | "element_7" | "element_8" | "element_9" | "element_10" | "element_11" | "element_12" | "element_13" | "element_14" | null,
  "synopsis": "<one sentence summary, max 100 chars>",
  "actionRequired": "<specific corrective action required>"
}

IHSA element hints: element_2=PPE/hazard, element_5=training, element_6=emergency, element_7=incident, element_10=housekeeping, element_13=fire/extinguisher, element_14=WHMIS/chemicals. Use null if unclear.`;

async function classifyWithAI(transcript: string): Promise<ClassificationResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
      max_tokens: 250,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ClassificationResult>;

    const validLevels: RiskLevel[] = ["critical", "high", "medium", "low"];
    const riskLevel = validLevels.includes(parsed.riskLevel as RiskLevel)
      ? (parsed.riskLevel as RiskLevel)
      : "low";

    return {
      riskLevel,
      ihsaElement: parsed.ihsaElement ?? null,
      synopsis: parsed.synopsis ?? null,
      actionRequired: parsed.actionRequired ?? "Review and resolve the reported issue",
      usedFallback: false,
    };
  } catch {
    const fallback = classifyByKeyword(transcript);
    return { ...fallback, usedFallback: true };
  }
}

// ── Due date calculation ──────────────────────────────────────────────────────

const DUE_DATE_DAYS: Record<RiskLevel, number> = {
  critical: 1,
  high: 3,
  medium: 7,
  low: 14,
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ── Priority mapping ──────────────────────────────────────────────────────────

const RISK_TO_PRIORITY: Record<RiskLevel, "high" | "medium" | "low"> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function processVoiceLog(
  transcript: string,
  companyId: number,
  projectId: number,
  submittedByUserId: number,
  assignedToUserId?: number,
): Promise<CorVoiceActionLog> {
  const classification = await classifyWithAI(transcript);

  const dueDate = addDays(DUE_DATE_DAYS[classification.riskLevel]);

  // Create a corrective task in the tasks table
  let correctedTaskId: number | undefined;
  try {
    const [task] = await db
      .insert(tasksTable)
      .values({
        projectId,
        title: `COR Action: ${classification.synopsis ?? "Safety observation"}`,
        description: classification.actionRequired,
        assignedToUserId: assignedToUserId ?? null,
        status: "todo",
        priority: RISK_TO_PRIORITY[classification.riskLevel],
        dueDate,
      })
      .returning({ id: tasksTable.id });

    correctedTaskId = task?.id;
  } catch (err) {
    // Task creation failure should not block the voice log from being saved
    logger.error({ err, projectId, companyId }, "COR voice log: corrective task creation failed");
  }

  return createVoiceActionLog({
    companyId,
    projectId,
    submittedByUserId,
    rawTranscript: transcript,
    riskLevel: classification.riskLevel,
    ihsaElement: (classification.ihsaElement as any) ?? null,
    correctedTaskId: correctedTaskId ?? null,
    assignedToUserId: assignedToUserId ?? null,
    dueDate,
    aiClassification: {
      riskLevel: classification.riskLevel,
      ihsaElement: classification.ihsaElement,
      synopsis: classification.synopsis,
      actionRequired: classification.actionRequired,
      usedFallback: classification.usedFallback,
    },
  });
}
