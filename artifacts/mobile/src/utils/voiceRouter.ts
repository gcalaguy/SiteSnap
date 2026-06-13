import { z } from "zod/v4";

type RouteTarget =
  | "Calculators"
  | "Schedule"
  | "Projects"
  | "Ask"
  | "Tasks"
  | "Invoices"
  | "Reports"
  | "Dashboard"
  | "Risk"
  | "Quotes"
  | "Proposals"
  | "Estimating"
  | "Financials"
  | "Hours"
  | "FieldLogs"
  | "Safety"
  | "TradeHub"
  | "Settings"
  | "Vault"
  | "Gatekeeper";

type LogHoursAction = {
  type: "LOG_HOURS";
  worker: string;
  hours: number;
  project: string | null;
};

type LogOwnHoursAction = {
  type: "LOG_OWN_HOURS";
  hours: number;
  project: string | null;
};

type AddDailyLogAction = {
  type: "ADD_DAILY_LOG";
  project: string | null;
  notes: string;
  transcript: string;
};

type MarkTaskDoneAction = {
  type: "MARK_TASK_DONE";
  taskName: string;
  project: string | null;
};

type LogDelayAction = {
  type: "LOG_DELAY";
  hours: number;
  reason: string;
  project: string | null;
};

type LogExpenseAction = {
  type: "LOG_EXPENSE";
  amount: number;
  description: string;
  vendor: string | null;
  project: string | null;
};

type CreateRFIAction = {
  type: "CREATE_RFI";
  subject: string;
  project: string | null;
};

type MaterialAlertAction = {
  type: "MATERIAL_ALERT";
  item: string;
  project: string | null;
};

type TriggerCameraAction = {
  type: "TRIGGER_CAMERA";
  context: string | null;
  project: string | null;
};

type SafetyLogAction = {
  type: "SAFETY_LOG";
  project: string | null;
  issue: string;
};

type CreateQuoteAction = {
  type: "CREATE_QUOTE";
  description: string;
  clientName: string | null;
  project: string | null;
};

export type SingleAction =
  | LogHoursAction
  | LogOwnHoursAction
  | AddDailyLogAction
  | MarkTaskDoneAction
  | LogDelayAction
  | LogExpenseAction
  | CreateRFIAction
  | MaterialAlertAction
  | TriggerCameraAction
  | SafetyLogAction
  | CreateQuoteAction;

export type VoiceIntent =
  | { intent: "NAVIGATE"; target: RouteTarget; confidence: "high" | "low" }
  | { intent: "DATA_ENTRY"; action: "ADD_NOTE"; payload: string; confidence: "high" | "low" }
  | { intent: "SINGLE_ACTION"; action: SingleAction; confidence: "high" | "low" }
  | { intent: "COMPOUND_ACTION"; actions: SingleAction[]; confidence: "high" | "low" }
  | { intent: "ASK_ASSISTANT"; question: string; confidence: "high" | "low" }
  | { intent: "UNKNOWN"; transcript: string; confidence: "low" };

/* ─── Router patterns ─────────────────────────────────────────────────────── */

// Navigation patterns are intentionally anchored (^ and $) or require a navigation verb prefix.
// This prevents "add an update to project X" from matching "Projects" navigation, etc.
const NAV_PREFIX = "(?:(?:go|navigate|switch)\\s+to\\s+|open\\s+|show(?:\\s+me)?\\s+|take\\s+me\\s+to\\s+)?(?:the\\s+)?";
const ROUTE_PATTERNS: Array<{ pattern: RegExp; target: RouteTarget }> = [
  { pattern: new RegExp(`^${NAV_PREFIX}dash(board)?$`, "i"), target: "Dashboard" },
  { pattern: new RegExp(`^${NAV_PREFIX}risk(\\s+dash(board)?)?$`, "i"), target: "Risk" },
  { pattern: new RegExp(`^${NAV_PREFIX}calculat\\w*$`, "i"), target: "Calculators" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:schedule|calendar)$`, "i"), target: "Schedule" },
  { pattern: new RegExp(`^${NAV_PREFIX}projects?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Projects" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:chat|ask|assistant)$`, "i"), target: "Ask" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:my\\s+)?tasks?(?:\\s+(?:list|page))?$`, "i"), target: "Tasks" },
  { pattern: new RegExp(`^${NAV_PREFIX}quotes?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Quotes" },
  { pattern: new RegExp(`^${NAV_PREFIX}invoices?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Invoices" },
  { pattern: new RegExp(`^${NAV_PREFIX}proposals?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Proposals" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:estimat(e|ing)|smart\\s+estimator)$`, "i"), target: "Estimating" },
  { pattern: new RegExp(`^${NAV_PREFIX}financials?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Financials" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:hours?|timesheets?)(?:\\s+(?:list|page|screen))?$`, "i"), target: "Hours" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:field\\s+logs?|daily\\s+logs?|reports?|today'?s\\s+reports?)(?:\\s+(?:list|page|screen))?$`, "i"), target: "FieldLogs" },
  { pattern: new RegExp(`^${NAV_PREFIX}safety(?:\\s+and\\s+compliance)?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Safety" },
  { pattern: new RegExp(`^${NAV_PREFIX}trade\\s?hub(?:\\s+(?:list|page|screen))?$`, "i"), target: "TradeHub" },
  { pattern: new RegExp(`^${NAV_PREFIX}(?:team\\s+)?settings?$`, "i"), target: "Settings" },
  // Vault — document scanning & upload phrases
  { pattern: new RegExp(`^${NAV_PREFIX}(?:vault|worker\\s+documents?|audit\\s+vault|document\\s+vault)(?:\\s+(?:list|page|screen))?$`, "i"), target: "Vault" },
  { pattern: /^(?:scan|upload)\s+(?:receipts?|invoices?|documents?|files?)$/i, target: "Vault" },
  // Gatekeeper — morning safety questionnaire phrases
  { pattern: new RegExp(`^${NAV_PREFIX}(?:morning\\s+)?gatekeeper(?:\\s+safety)?(?:\\s+(?:list|page|screen))?$`, "i"), target: "Gatekeeper" },
  { pattern: /^(?:morning\s+(?:questionnaire|checklist?|safety)|gatekeeper\s+safety|safety\s+questionnaire)$/i, target: "Gatekeeper" },
];

// \b after notes? prevents backtracking from "notes" to "note", ensuring the full word is matched.
// (?!\s+to\b) then rejects "add notes to [project]..." so it falls through to daily-log parsing.
const NOTE_TRIGGER = /^(?:add|create|write)\s+(?:a\s+)?notes?\b(?!\s+to\b)\s*(.*)/is;

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

const OWN_HOURS_PATTERNS = [
  // "I worked 5 hours on Oak Street today"
  /i\s+worked\s+(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "log 5 hours for myself on Oak Street"
  /log\s+(\d+(?:\.\d+)?)\s+hours?\s+(?:for\s+myself|for\s+me)\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "my hours today are 5 on Oak Street"
  /my\s+hours\s+(?:today\s+)?(?:are\s+)?(\d+(?:\.\d+)?)\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "log 5 hours on Oak Street" — own hours when no worker name given
  /log\s+(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
  // "record 5 hours on Oak Street"
  /record\s+(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i,
];

const MARK_TASK_DONE_PATTERNS = [
  /mark\s+(?:the\s+)?(.+?)\s+as\s+(?:complete|done|finished)/i,
  /^\s*(?:please\s+)?complete\s+(?:the\s+)?(.+)/i,
  /^\s*(?:please\s+)?finish\s+(?:the\s+)?(.+)/i,
];

const DELAY_PATTERNS = [
  // Pattern A: weather-specific (most specific, checked first)
  { pattern: /weather\s+delay\s+(?:of\s+)?(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i, kind: "weather" as const },
  // Pattern B: "log X hours [reason] delay on ..."
  { pattern: /log\s+a?\s*(\d+(?:\.\d+)?)\s*-?\s*hour\s+(.+?)\s+(?:delay|holdup)\s+(?:on|at)\s+(?:the\s+)?(.+)/i, kind: "log" as const },
  // Pattern C: "[reason] delay of X hours on ..."
  { pattern: /(.+?)\s+delay\s+(?:of\s+)?(\d+(?:\.\d+)?)\s+hours?\s+(?:on|at)\s+(?:the\s+)?(.+)/i, kind: "generic" as const },
];

const EXPENSE_PATTERNS = [
  /expense\s+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:for\s+)?(.+?)\s+(?:at|from)\s+(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
  /spent\s+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:on\s+)?(.+?)\s+(?:at|from)\s+(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
  /log\s+(?:an?\s+)?expense\s+(?:of\s+)?\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:for\s+)?(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
];

const RFI_PATTERNS = [
  /create\s+(?:an?\s+)?RFI\s+(?:about|regarding|for)\s+(?:the\s+)?(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
  /new\s+RFI\s+(?:about|regarding|for)\s+(?:the\s+)?(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
  /RFI\s+(?:about|regarding)\s+(?:the\s+)?(.+?)(?:\s+(?:on|at)\s+(?:the\s+)?(.+))?$/i,
];

type DailyLogPattern = {
  pattern: RegExp;
  notesGroup: number | null;
  projectGroup: number | null;
};

const DAILY_LOG_PATTERNS: DailyLogPattern[] = [
  // "add an update to [the] [project] [name][: / with / that] [notes]"
  { pattern: /add\s+(?:an?\s+)?update\s+to\s+(?:the\s+)?(?:project\s+)?(.+?)\s*(?:[:\-]|with\s+|that\s+|about\s+)(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "add an update to [project]" (no explicit notes)
  { pattern: /add\s+(?:an?\s+)?update\s+to\s+(?:the\s+)?(?:project\s+)?(.+)/i, notesGroup: null, projectGroup: 1 },
  // "update project [name][: / with / that] [notes]"
  { pattern: /^update\s+(?:the\s+)?project\s+(.+?)\s*(?:[:\-]|with\s+|that\s+)(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "update project [name]" (no notes)
  { pattern: /^update\s+(?:the\s+)?project\s+(.+)/i, notesGroup: null, projectGroup: 1 },
  // "add a report/log/daily update for/on [project][: / with / that] [notes]"
  { pattern: /add\s+(?:a\s+)?(?:report|log|daily\s+update)\s+(?:for|to|on)\s+(?:the\s+)?(?:project\s+)?(.+?)\s*(?:[:\-]|with\s+|that\s+|about\s+)(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "add a report/log for [project]" (no notes)
  { pattern: /add\s+(?:a\s+)?(?:report|log|daily\s+update)\s+(?:for|to|on)\s+(?:the\s+)?(?:project\s+)?(.+)/i, notesGroup: null, projectGroup: 1 },
  // "create a [daily] report/log for/on [project][: / with / that] [notes]"
  { pattern: /create\s+(?:a\s+)?(?:daily\s+)?(?:report|log)\s+(?:for|on|to)\s+(?:the\s+)?(?:project\s+)?(.+?)\s*(?:[:\-]|with\s+|that\s+)(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "create a report for [project]" (no notes)
  { pattern: /create\s+(?:a\s+)?(?:daily\s+)?(?:report|log)\s+(?:for|on|to)\s+(?:the\s+)?(?:project\s+)?(.+)/i, notesGroup: null, projectGroup: 1 },
  // "update the 123 Basement project with/that [notes]"
  { pattern: /^update\s+(?:the\s+)?(.+?)\s+(?:project\s+)?(?:with|that|,)\s+(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "update [project]" (no notes — require ≥4 chars to reduce false matches on generic words)
  { pattern: /^update\s+(?:the\s+)?(.{4,}?)(?:\s+project)?$/i, notesGroup: null, projectGroup: 1 },
  // "add notes to [project] that/about/with [notes]"
  { pattern: /add\s+(?:a\s+)?notes?\s+to\s+(?:the\s+)?(.+?)\s+(?:that|about|with|:|,)\s+(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "add notes to [project]" (no notes — will default)
  { pattern: /add\s+(?:a\s+)?notes?\s+to\s+(?:the\s+)?(.+)$/i, notesGroup: null, projectGroup: 1 },
  // "log for/to [project] that/about [notes]"
  { pattern: /log\s+(?:for|to)\s+(?:the\s+)?(.+?)\s+(?:that|about)\s+(.+)/i, notesGroup: 2, projectGroup: 1 },
  // "note/log/report that [notes] on/at [project]"
  { pattern: /(?:note|log|report)\s+that\s+(.+?)\s+(?:on|at)\s+(?:the\s+)?(.+)/i, notesGroup: 1, projectGroup: 2 },
  // "note/log/report that [notes]" (no project)
  { pattern: /(?:note|log|report)\s+that\s+(.+)/i, notesGroup: 1, projectGroup: null },
  // "daily log/report [notes] on/at [project]"
  { pattern: /(?:daily\s+log|daily\s+report)\s*(?:that\s+)?(.+?)\s+(?:on|at)\s+(?:the\s+)?(.+)/i, notesGroup: 1, projectGroup: 2 },
  // "daily log/report [notes]" (no project)
  { pattern: /(?:daily\s+log|daily\s+report)\s*(?:that\s+)?(.+)/i, notesGroup: 1, projectGroup: null },
];

const MATERIAL_PATTERNS = [
  /(?:we\s+(?:are|'re)\s+)?(?:short\s+on|out\s+of|missing|running\s+low\s+on)\s+(.+)/i,
  /(?:need|require)\s+(.+)/i,
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
  /(?:safety\s+issue|hazard)\s*[\:\-]?\s*(.+)/i,
];

const QUOTE_PATTERNS = [
  // "create a quote for 3 squares of roofing for Abela Construction"
  /(?:create|generate|make|write\s+up)\s+(?:an?\s+)?quote\s+(?:for\s+)?(.+?)\s+(?:for|to)\s+(.+)/i,
  // "create a quote for 3 squares of roofing"
  /(?:create|generate|make|write\s+up)\s+(?:an?\s+)?quote\s+(?:for\s+)?(.+)/i,
  // "quote for framing 10 units"
  /^quote\s+for\s+(.+)/i,
  // "new quote: electrical rough-in"
  /^new\s+quote[:\s]+(.+)/i,
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

function tryParseOwnHours(text: string): LogOwnHoursAction | null {
  for (const pattern of OWN_HOURS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const hours = parseFloat(match[1]);
      const project = match[2]?.trim() ?? null;
      if (!isNaN(hours)) {
        return { type: "LOG_OWN_HOURS", hours, project };
      }
    }
  }
  return null;
}

function tryParseMarkTaskDone(text: string): MarkTaskDoneAction | null {
  for (const pattern of MARK_TASK_DONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const taskName = match[1].trim();
      if (taskName) {
        return { type: "MARK_TASK_DONE", taskName, project: null };
      }
    }
  }
  return null;
}

function tryParseLogDelay(text: string): LogDelayAction | null {
  for (const { pattern, kind } of DELAY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    let hours: number;
    let reason: string;
    let project: string | null = null;

    switch (kind) {
      case "weather":
        hours = parseFloat(match[1]);
        reason = "weather delay";
        project = match[2]?.trim() ?? null;
        break;
      case "log":
        hours = parseFloat(match[1]);
        reason = match[2].trim();
        project = match[3]?.trim() ?? null;
        break;
      case "generic":
        reason = match[1].trim();
        hours = parseFloat(match[2]);
        project = match[3]?.trim() ?? null;
        break;
    }

    if (!isNaN(hours) && reason) {
      return { type: "LOG_DELAY", hours, reason, project };
    }
  }
  return null;
}

function tryParseLogExpense(text: string): LogExpenseAction | null {
  for (const pattern of EXPENSE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      const description = match[2].trim();
      const vendor = match[3]?.trim() ?? null;
      const project = match[4]?.trim() ?? null;
      if (!isNaN(amount) && description) {
        return { type: "LOG_EXPENSE", amount, description, vendor, project };
      }
    }
  }
  return null;
}

function tryParseCreateRFI(text: string): CreateRFIAction | null {
  for (const pattern of RFI_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const subject = match[1].trim();
      const project = match[2]?.trim() ?? null;
      if (subject) {
        return { type: "CREATE_RFI", subject, project };
      }
    }
  }
  return null;
}

function tryParseDailyLog(text: string): AddDailyLogAction | null {
  for (const { pattern, notesGroup, projectGroup } of DAILY_LOG_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const notes =
      notesGroup !== null
        ? (match[notesGroup]?.trim() ?? "")
        : "Update logged via voice";
    const project =
      projectGroup !== null ? (match[projectGroup]?.trim() ?? null) : null;
    if (notes || project) {
      return {
        type: "ADD_DAILY_LOG",
        project: project || null,
        notes: notes || "Update logged via voice",
        transcript: text,
      };
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
      return { type: "TRIGGER_CAMERA", context, project: null };
    }
  }
  return null;
}

function tryParseSafetyLog(text: string): SafetyLogAction | null {
  for (const pattern of SAFETY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[0].toLowerCase();
      if (raw.includes("missing ppe") || raw.includes("no ppe") || raw.includes("without ppe")) {
        const issue = "missing PPE";
        const project = match[1]?.trim() ?? null;
        return { type: "SAFETY_LOG", project, issue };
      }
      if (raw.includes("safety issue") || raw.includes("hazard") || raw.includes("unsafe")) {
        const issue = match[1]?.trim() ?? "safety issue";
        const project = match[2]?.trim() ?? null;
        return { type: "SAFETY_LOG", project, issue };
      }
    }
  }
  return null;
}

function tryParseCreateQuote(text: string): CreateQuoteAction | null {
  // Check for "description FOR/TO clientName" pattern first (most specific)
  const withClient = /(?:create|generate|make|write\s+up)\s+(?:an?\s+)?quote\s+(?:for\s+)?(.+?)\s+(?:for|to)\s+(.+)/i;
  const wc = text.match(withClient);
  if (wc) {
    return { type: "CREATE_QUOTE", description: wc[1].trim(), clientName: wc[2].trim(), project: null };
  }
  for (const pattern of QUOTE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { type: "CREATE_QUOTE", description: match[1].trim(), clientName: null, project: null };
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

  const ownHours = tryParseOwnHours(text);
  if (ownHours) return ownHours;

  const hours = tryParseLogHours(text);
  if (hours) return hours;

  const taskDone = tryParseMarkTaskDone(text);
  if (taskDone) return taskDone;

  const delay = tryParseLogDelay(text);
  if (delay) return delay;

  const expense = tryParseLogExpense(text);
  if (expense) return expense;

  const rfi = tryParseCreateRFI(text);
  if (rfi) return rfi;

  const quote = tryParseCreateQuote(text);
  if (quote) return quote;

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

const ALL_ROUTE_TARGETS: readonly RouteTarget[] = [
  "Calculators",
  "Schedule",
  "Projects",
  "Ask",
  "Tasks",
  "Invoices",
  "Reports",
  "Dashboard",
  "Risk",
  "Quotes",
  "Proposals",
  "Estimating",
  "Financials",
  "Hours",
  "FieldLogs",
  "Safety",
  "TradeHub",
  "Settings",
  "Vault",
  "Gatekeeper",
];

function isValidRouteTarget(target: string): target is RouteTarget {
  return (ALL_ROUTE_TARGETS as readonly string[]).includes(target);
}

/* ─── LLM classify (fallback when regex fails) ───────────────────────────── */

const LLMResultSchema = z.object({
  intent: z.string(),
  project: z.string().nullable().optional(),
  notes: z.string().optional(),
  hours: z.number().optional(),
  worker: z.string().optional(),
  taskName: z.string().optional(),
  reason: z.string().optional(),
  amount: z.number().optional(),
  description: z.string().optional(),
  vendor: z.string().nullable().optional(),
  subject: z.string().optional(),
  item: z.string().optional(),
  target: z.string().optional(),
  question: z.string().optional(),
  clientName: z.string().nullable().optional(),
});

type LLMResult = z.infer<typeof LLMResultSchema>;

async function classifyWithLLM(
  transcript: string,
  projectNames: string[],
): Promise<VoiceIntent> {
  try {
    const { customFetch } = await import("@workspace/api-client-react");
    const raw = await customFetch<unknown>("/api/ai/voice-classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, projectNames }),
    });

    const parsed = LLMResultSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[voiceRouter] LLM response schema mismatch:", parsed.error.issues);
      return {
        intent: "DATA_ENTRY",
        action: "ADD_NOTE",
        payload: transcript,
        confidence: "low",
      };
    }
    const result: LLMResult = parsed.data;
    const project = result.project ?? null;

    switch (result.intent) {
      case "ADD_DAILY_LOG":
        return {
          intent: "SINGLE_ACTION",
          action: {
            type: "ADD_DAILY_LOG",
            project,
            notes: result.notes || "Update logged via voice",
            transcript,
          },
          confidence: "low",
        };
      case "LOG_HOURS":
        if (result.worker && result.hours != null) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_HOURS", worker: result.worker, hours: result.hours, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_OWN_HOURS":
        if (result.hours != null) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_OWN_HOURS", hours: result.hours, project },
            confidence: "low",
          };
        }
        break;
      case "MARK_TASK_DONE":
        if (result.taskName) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "MARK_TASK_DONE", taskName: result.taskName, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_DELAY":
        if (result.hours != null && result.reason) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "LOG_DELAY", hours: result.hours, reason: result.reason, project },
            confidence: "low",
          };
        }
        break;
      case "LOG_EXPENSE":
        if (result.amount != null && result.description) {
          return {
            intent: "SINGLE_ACTION",
            action: {
              type: "LOG_EXPENSE",
              amount: result.amount,
              description: result.description,
              vendor: result.vendor ?? null,
              project,
            },
            confidence: "low",
          };
        }
        break;
      case "CREATE_RFI":
        if (result.subject) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "CREATE_RFI", subject: result.subject, project },
            confidence: "low",
          };
        }
        break;
      case "MATERIAL_ALERT":
        if (result.item) {
          return {
            intent: "SINGLE_ACTION",
            action: { type: "MATERIAL_ALERT", item: result.item, project },
            confidence: "low",
          };
        }
        break;
      case "CREATE_QUOTE":
        if (result.description) {
          return {
            intent: "SINGLE_ACTION",
            action: {
              type: "CREATE_QUOTE",
              description: result.description,
              clientName: result.clientName ?? null,
              project,
            },
            confidence: "low",
          };
        }
        break;
      case "NAVIGATE":
        if (result.target && isValidRouteTarget(result.target)) {
          return { intent: "NAVIGATE", target: result.target, confidence: "low" };
        }
        break;
      case "ASK_ASSISTANT":
        return {
          intent: "ASK_ASSISTANT",
          question: result.question ?? transcript,
          confidence: "low",
        };
    }
  } catch (err) {
    const { getAiErrorMessage } = await import("./aiError");
    const { ApiError } = await import("@workspace/api-client-react");
    if (err instanceof ApiError && err.status === 400) {
      // Validation error from the server — surface it to the user by re-throwing
      // with the formatted message. The executor's catch block will show an alert.
      throw new Error(getAiErrorMessage(err, "Voice classification failed. Please try again."));
    }
    // Network / server errors — log and fall back to UNKNOWN silently
    const msg = getAiErrorMessage(err, "Voice classification failed.");
    console.error("[voiceRouter] classifyWithLLM error:", msg);
  }

  return {
    intent: "DATA_ENTRY",
    action: "ADD_NOTE",
    payload: transcript,
    confidence: "low",
  };
}

/* ─── Main router ─────────────────────────────────────────────────────────── */

export async function interpretVoiceCommand(
  transcript: string,
  projectNames: string[] = [],
): Promise<VoiceIntent> {
  const raw = transcript?.trim() ?? "";
  console.log("[voiceRouter] interpretVoiceCommand called:", JSON.stringify(raw));

  if (!raw) {
    console.log("[voiceRouter] empty transcript -> UNKNOWN");
    return { intent: "UNKNOWN", transcript: raw, confidence: "low" };
  }

  const normalized = raw.toLowerCase();

  // 1. Note trigger (existing behaviour — most specific)
  // The negative lookahead in NOTE_TRIGGER ensures "add notes to [project]..." falls through correctly.
  const noteMatch = normalized.match(NOTE_TRIGGER);
  if (noteMatch) {
    const payload = raw
      .slice(noteMatch[0].length - (noteMatch[1] ?? "").length)
      .trim()
      .slice(0, 500);
    console.log("[voiceRouter] NOTE_TRIGGER matched -> ADD_NOTE:", payload.slice(0, 50));
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
    console.log("[voiceRouter] compound matched:", compound.map((a) => a.type).join(", "));
    return { intent: "COMPOUND_ACTION", actions: compound, confidence: "high" };
  }

  // 3. Single action detection
  const single = parseSingleAction(raw);
  if (single) {
    console.log("[voiceRouter] single matched:", single.type, "project:", single.project);
    const hasAllFields =
      (single.type === "LOG_HOURS" && single.project !== null) ||
      (single.type === "LOG_OWN_HOURS" && single.project !== null) ||
      (single.type === "MARK_TASK_DONE" && single.taskName.length > 0) ||
      (single.type === "LOG_DELAY" && single.reason.length > 0) ||
      (single.type === "LOG_EXPENSE" && single.description.length > 0) ||
      (single.type === "CREATE_RFI" && single.subject.length > 0) ||
      (single.type === "ADD_DAILY_LOG" && single.notes.length > 0) ||
      (single.type === "MATERIAL_ALERT" && single.item.length > 0) ||
      (single.type === "TRIGGER_CAMERA") ||
      (single.type === "SAFETY_LOG" && single.issue.length > 0) ||
      (single.type === "CREATE_QUOTE" && single.description.length > 0);
    return {
      intent: "SINGLE_ACTION",
      action: single,
      confidence: hasAllFields ? "high" : "low",
    };
  }

  // 4. Navigation (existing behaviour)
  for (const { pattern, target } of ROUTE_PATTERNS) {
    if (pattern.test(normalized)) {
      console.log("[voiceRouter] navigation matched ->", target);
      return { intent: "NAVIGATE", target, confidence: "high" };
    }
  }

  // 5. Question / knowledge fast-path — save an LLM round-trip for obvious questions
  // Matches "What are...", "How do I...", "Why is...", sentences ending with "?", etc.
  const QUESTION_STARTERS = /^(?:what|how|why|when|where|who|which)\s+(?:is|are|does|do|should|can|could|would|will|was|were|has|have|had|are the)\b/i;
  const isObviousQuestion = raw.trim().endsWith("?") || QUESTION_STARTERS.test(normalized);
  if (isObviousQuestion) {
    console.log("[voiceRouter] question fast-path -> ASK_ASSISTANT");
    return { intent: "ASK_ASSISTANT", question: raw, confidence: "high" };
  }

  // 6. LLM fallback — handles any phrasing the regex couldn't classify
  console.log("[voiceRouter] falling through to LLM fallback");
  return classifyWithLLM(raw, projectNames);
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
