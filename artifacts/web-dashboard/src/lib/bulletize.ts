/**
 * Splits a free-text field into scannable line items. Existing reports store
 * plain prose in a single string — this heuristically breaks it into bullets
 * without requiring a backfill or schema change: explicit line breaks (or
 * "- "/"1. " markers) win if present, otherwise falls back to sentence splits.
 */
export function bulletizeText(text: string | null | undefined): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*|^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const sentenceMatches = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  const sentences = (sentenceMatches ?? []).map((s) => s.trim()).filter(Boolean);
  if (sentences.length > 1) return sentences;

  return [trimmed];
}
