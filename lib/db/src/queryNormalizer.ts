/**
 * queryNormalizer.ts
 *
 * Normalises free-form construction query strings by expanding common industry
 * shorthand to their full standard equivalents before the text is handed to
 * embedding generation or full-text search.
 *
 * Expanding shorthands improves recall in both vector and keyword pipelines:
 *   - Embedding models see more semantically rich tokens.
 *   - PostgreSQL tsvectors index the expanded words, not the abbreviations.
 *
 * Rules
 * -----
 * - Replacements are whole-word only (word-boundary anchored) to avoid
 *   clobbering proper nouns or codes that happen to start with a shorthand
 *   (e.g. "mechanical" must not become "mechanicaldrical").
 * - Matching is case-insensitive; the replacement is always lowercase so
 *   downstream normalisation stays consistent.
 * - Multiple shorthands on the same token are not a concern because each
 *   entry is a distinct whole-word pattern.
 */

/** Map of shorthand term → full standard equivalent. */
const SHORTHAND_MAP: Record<string, string> = {
  demo:    "demolition",
  elec:    "electrical",
  mech:    "mechanical",
  reno:    "renovation",
  sqft:    "square feet",
  "sq ft": "square feet",
  lf:      "linear feet",
  co:      "change order",
  po:      "purchase order",
  bp:      "building permit",
  hvac:    "heating ventilation air conditioning",
  struct:  "structural",
  conc:    "concrete",
  reinf:   "reinforcement",
  plmb:    "plumbing",
  temp:    "temporary",
  matl:    "material",
  qty:     "quantity",
  spec:    "specification",
  dwg:     "drawing",
  rfi:     "request for information",
};

/**
 * Pre-compiled replacement rules derived from SHORTHAND_MAP.
 * Each rule is a [RegExp, replacement] pair cached at module load time so
 * `normalizeFieldQuery` incurs no regex compilation cost per call.
 */
const REPLACEMENT_RULES: Array<[RegExp, string]> = Object.entries(
  SHORTHAND_MAP
).map(([shorthand, full]) => [
  // \b anchors ensure whole-word matching; the `i` flag makes it
  // case-insensitive without requiring the caller to pre-lowercase.
  new RegExp(`\\b${shorthand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
  full,
]);

/**
 * normalizeFieldQuery
 *
 * Maps construction shorthand terms in `query` to their full equivalents,
 * then collapses any runs of whitespace left behind by multi-word
 * substitutions.
 *
 * @example
 * normalizeFieldQuery("demo of elec panel, sqft calc")
 * // => "demolition of electrical panel, square feet calc"
 *
 * @param query - Raw user query string (may contain abbreviations).
 * @returns     Expanded query string safe for embedding or FTS input.
 */
export function normalizeFieldQuery(query: string): string {
  let normalized = query;

  for (const [pattern, replacement] of REPLACEMENT_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Collapse runs of whitespace that may appear after multi-word substitutions
  // (e.g. "sqft" → "square feet" introduces no extra spaces, but guard anyway).
  return normalized.replace(/\s{2,}/g, " ").trim();
}
