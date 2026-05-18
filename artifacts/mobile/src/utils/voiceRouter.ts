export type RouteTarget = "Calculators" | "Schedule" | "Projects" | "Ask";

export type LogHoursAction = {
  type: "LOG_HOURS";
  worker: string;
  hours: number;
  project: string | null;
};

export type AddDailyLogAction = {
  type: "ADD_DAILY_LOG";
  project: string | null;
  notes: string;
};

export type MaterialAlertAction = {
  type: "MATERIAL_ALERT";
  item: string;
  project: string | null;
};

export type TriggerCameraAction = {
  type: "TRIGGER_CAMERA";
  context: string | null;
};

export type SafetyLogAction = {
  type: "SAFETY_LOG";
  project: string | null;
  issue: string;
};

export type SingleAction =
  | LogHoursAction
  | AddDailyLogAction
  | MaterialAlertAction
  | TriggerCameraAction
  | SafetyLogAction;

export type VoiceIntent =
  | { intent: "NAVIGATE"; target: RouteTarget; confidence: "high" | "low" }
  | { intent: "DATA_ENTRY"; action: "ADD_NOTE"; payload: string; confidence: "high" | "low" }
  | { intent: "SINGLE_ACTION"; action: SingleAction; confidence: "high" | "low" }
  | { intent: "COMPOUND_ACTION"; actions: SingleAction[]; confidence: "high" | "low" }
  | { intent: "UNKNOWN"; transcript: string; confidence: "low" };

/* ─── Router patterns ─────────────────────────────────────────────────────── */

const ROUTE_PATTERNS: Array<{ pattern: RegExp; target: RouteTarget }> = [
  { pattern: /calculat/i, target: "Calculators" },
  { pattern: /schedule|calendar/i, target: "Schedule" },
  { pattern: /\bprojects?\b/i, target: "Projects" },
  { pattern: /\b(chat|ask|assistant)\b/i, target: "Ask" },
];

const NOTE_TRIGGER = /^(?:add|create|write)\s+a?\s*note\s*(.*)/is;

/* ─── Compound splitting ──────────────────────────────────────────────────── */

const CONJUNCTION_SPLIT = /\s+(?:and|also|then)\s+/i;

/* ─── Single-action parsers ─────────────────────────────────────────────── */

const HOURS_PATTERNS = [
  // "log 4 hours for Guy on the 123 Basement project"
  /log\s+(\d+(?:\.\d+)?)\s+hours?\s+for\s+(.+?)\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "record 4 hours for Guy on 123 Basement"
  /record\s+(\d+(?:\.\d+)?)\s+hours?\s+for\s+(.+?)\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "Guy worked 4 hours on 123 Basement"
  /(.+?)\s+worked\s+(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "log 4 hours for Guy" (no project)
  /log\s+(\d+(?:\.\d+)?)\s+hours?\s+for\s+(.+)/i,
  // "record 4 hours for Guy" (no project)
  /record\s+(\d+(?:\.\d+)?)\s+hours?\s+for\s+(.+)/i,
];

const DAILY_LOG_PATTERNS = [
  /(?:note|log|report)\s+that\s+(.+)/i,
  /(?:daily\s+log|daily\s+report)\s*(?:that\s+)?(.+)/i,
];

const MATERIAL_PATTERNS = [
  /(?:we\s+(?:are|'re)\s+)?(?:short\s+on|out\s+of|missing|running\s+low\s+on)\s+(.+)/i,
  /(?:need|require)\s+(?:more\s+)?(.+)/i,
];

const CAMERA_PATTERNS = [
  /(?:take\s+a?\s*photo\s+of|snap\s+a?\s*photo\s+of|capture\s+a?\s*photo\s+of|photo\s+of)\s+(.+)/i,
  /(?:take\s+a?\s*picture\s+of|snap\s+a?\s*picture\s+of)\s+(.+)/i,
  /(?:take\s+a?\s*photo|snap\s+a?\s*photo|capture\s+a?\s*photo)\s*$/i,
];

const SAFETY_PATTERNS = [
  /(?:missing\s+PPE|no\s+PPE|without\s+PPE)\s+(?:at|on)\s+(?:the\s+)?(.+)/i,
  /(?:safety\s+issue|hazard|unsafe\s+condition)\s+(?:at|on)\s+(?:the\s+)?(.+)/i,
  /(.+?)\s+(?:missing\s+PPE|no\s+PPE|without\s+PPE)/i,
  /(?:safety\s+issue|hazard)\s*[:\-]?\s*(.+)/i,
];

function tryParseLogHours(text: string): LogHoursAction | null {
  for (const pattern of HOURS_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const raw = match[0].toLowerCase();
    let hours: number;
    let worker: string;
    let project: string | null = null;

    if (raw.startsWith("log") || raw.startsWith("record")) {
      hours = parseFloat(match[1]);
      worker = match[2].trim();
      if (match[3]) project = match[3].trim();
    } else {
      worker = match[1].trim();
      hours = parseFloat(match[2]);
      project = match[3].trim();
    }

    if (!isNaN(hours) && worker) {
      return { type: "LOG_HOURS", worker, hours, project };
    }
  }
  return null;
}

function tryParseDailyLog(text: string): AddDailyLogAction | null {
  for (const pattern of DAILY_LOG_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const notes = match[1].trim();
      if (notes) {
        return { type: "ADD_DAILY_LOG", project: null, notes };
      }
    }
  }
  return null;
}

function tryParseMaterialAlert(text: string): MaterialAlertAction | null {
  for (const pattern of MATERIAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const item = match[1].trim();
      if (item) {
        return { type: "MATERIAL_ALERT", item, project: null };
      }
    }
  }
  return null;
}

function tryParseCamera(text: string): TriggerCameraAction | null {
  for (const pattern of CAMERA_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const context = match[1]?.trim() ?? null;
      return { type: "TRIGGER_CAMERA", context };
    }
  }
  return null;
}

function tryParseSafetyLog(text: string): SafetyLogAction | null {
  for (const pattern of SAFETY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Pattern 1 & 2: "missing PPE at 123 Basement" -> project=match[1], issue=missing PPE
      // Pattern 3: "123 Basement missing PPE" -> project=match[1], issue=missing PPE
      // Pattern 4: "hazard: wet floor" -> issue=match[1], project=null
      const raw = match[0].toLowerCase();
      if (raw.includes("missing ppe") || raw.includes("no ppe") || raw.includes("without ppe")) {
        const issue = "missing PPE";
        const project = match[1]?.trim() ?? null;
        return { type: "SAFETY_LOG", project, issue };
      }
      if (raw.includes("safety issue") || raw.includes("hazard") || raw.includes("unsafe")) {
        const issue = match[1]?.trim() ?? "safety issue";
        // For "hazard at 123 Basement" extract project from second group
        const project = match[2]?.trim() ?? null;
        return { type: "SAFETY_LOG", project, issue };
      }
    }
  }
  return null;
}

function parseSingleAction(text: string): SingleAction | null {
  // Order: most specific / least ambiguous first
  const camera = tryParseCamera(text);
  if (camera) return camera;

  const safety = tryParseSafetyLog(text);
  if (safety) return safety;

  const hours = tryParseLogHours(text);
  if (hours) return hours;

  const material = tryParseMaterialAlert(text);
  if (material) return material;

  const log = tryParseDailyLog(text);
  if (log) return log;

  return null;
}

function tryParseCompound(text: string): SingleAction[] | null {
  const parts = text.split(CONJUNCTION_SPLIT).filter((p) => p.trim().length > 0);
  if (parts.length < 2) return null;

  const actions: SingleAction[] = [];
  for (const part of parts) {
    const action = parseSingleAction(part.trim());
    if (action) actions.push(action);
  }

  return actions.length >= 2 ? actions : null;
}

/* ─── Main router ─────────────────────────────────────────────────────────── */

export function interpretVoiceCommand(transcript: string): VoiceIntent {
  const raw = transcript?.trim() ?? "";

  if (!raw) {
    return { intent: "UNKNOWN", transcript: raw, confidence: "low" };
  }

  const normalized = raw.toLowerCase();

  // 1. Note trigger (existing behaviour — most specific)
  const noteMatch = normalized.match(NOTE_TRIGGER);
  if (noteMatch) {
    const payload = raw
      .slice(noteMatch[0].length - (noteMatch[1] ?? "").length)
      .trim()
      .slice(0, 500);
    return {
      intent: "DATA_ENTRY",
      action: "ADD_NOTE",
      payload,
      confidence: payload.length > 0 ? "high" : "low",
    };
  }

  // 2. Compound action detection (split on "and" / "also" / "then")
  const compound = tryParseCompound(raw);
  if (compound) {
    return { intent: "COMPOUND_ACTION", actions: compound, confidence: "high" };
  }

  // 3. Single action detection
  const single = parseSingleAction(raw);
  if (single) {
    const hasAllFields =
      (single.type === "LOG_HOURS" && single.project !== null) ||
      (single.type === "ADD_DAILY_LOG" && single.notes.length > 0) ||
      (single.type === "MATERIAL_ALERT" && single.item.length > 0) ||
      (single.type === "TRIGGER_CAMERA") ||
      (single.type === "SAFETY_LOG" && single.issue.length > 0);
    return {
      intent: "SINGLE_ACTION",
      action: single,
      confidence: hasAllFields ? "high" : "low",
    };
  }

  // 4. Navigation (existing behaviour)
  for (const { pattern, target } of ROUTE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { intent: "NAVIGATE", target, confidence: "high" };
    }
  }

  // 5. Fallback
  return { intent: "UNKNOWN", transcript: raw, confidence: "low" };
}

/* ─── Active-project context injection ───────────────────────────────────── */

function injectProjectIntoAction(action: SingleAction, activeProject: string): SingleAction {
  if (action.project !== null) return action;
  return { ...action, project: activeProject };
}

/**
 * If the user is on a specific project screen and speaks a command without
 * naming the project, fill in `project` from the active screen context.
 */
export function withActiveProject(intent: VoiceIntent, activeProject: string | null): VoiceIntent {
  if (!activeProject) return intent;

  if (intent.intent === "SINGLE_ACTION" && intent.action.project === null) {
    return {
      ...intent,
      action: injectProjectIntoAction(intent.action, activeProject),
    };
  }

  if (intent.intent === "COMPOUND_ACTION") {
    return {
      ...intent,
      actions: intent.actions.map((a) =>
        a.project === null ? injectProjectIntoAction(a, activeProject) : a
      ),
    };
  }

  return intent;
}
