export type RouteTarget = "Calculators" | "Schedule" | "Projects" | "Ask";

export type VoiceIntent =
  | { intent: "NAVIGATE"; target: RouteTarget; confidence: "high" | "low" }
  | { intent: "DATA_ENTRY"; action: "ADD_NOTE"; payload: string; confidence: "high" | "low" }
  | { intent: "UNKNOWN"; transcript: string; confidence: "low" };

const ROUTE_PATTERNS: Array<{ pattern: RegExp; target: RouteTarget }> = [
  { pattern: /calculat/i, target: "Calculators" },
  { pattern: /schedule|calendar/i, target: "Schedule" },
  { pattern: /\bprojects?\b/i, target: "Projects" },
  { pattern: /\b(chat|ask|assistant)\b/i, target: "Ask" },
];

const NOTE_TRIGGER = /^(?:add|create|write)\s+a?\s*note\s*(.*)/is;

export function interpretVoiceCommand(transcript: string): VoiceIntent {
  const raw = transcript?.trim() ?? "";

  if (!raw) {
    return { intent: "UNKNOWN", transcript: raw, confidence: "low" };
  }

  const noteMatch = raw.match(NOTE_TRIGGER);
  if (noteMatch) {
    const payload = (noteMatch[1] ?? "").trim().slice(0, 500);
    return {
      intent: "DATA_ENTRY",
      action: "ADD_NOTE",
      payload,
      confidence: payload.length > 0 ? "high" : "low",
    };
  }

  for (const { pattern, target } of ROUTE_PATTERNS) {
    if (pattern.test(raw)) {
      return { intent: "NAVIGATE", target, confidence: "high" };
    }
  }

  return { intent: "UNKNOWN", transcript: raw, confidence: "low" };
}
