/**
 * vectorSearch.ts
 *
 * 3-tier semantic search pipeline for document chunks.
 *
 * Tier 1 – Vector search, strict similarity  (cosine ≥ 0.78)
 * Tier 2 – Vector search, relaxed similarity (cosine ≥ 0.55)
 * Tier 3 – PostgreSQL full-text search       (tsvector / to_tsquery)
 *
 * Each tier is attempted in order; the first tier that returns at least one
 * result wins and its method tag is returned alongside the rows so callers
 * can surface telemetry, adjust ranking weights, or log diagnostics.
 *
 * Design notes
 * ------------
 * - The `embedFn` parameter decouples embedding generation from this library.
 *   Callers (e.g. the API server) inject their own client; lib/db never
 *   imports from an artifact package, keeping the dependency graph clean.
 * - When `embedFn` returns null (embeddings disabled or failed), Tiers 1 & 2
 *   are skipped and Tier 3 executes directly without penalty.
 * - The query string is normalised via `normalizeFieldQuery` before any
 *   search tier runs, expanding construction shorthand for better recall.
 * - A `console.warn` is emitted whenever Tier 3 is triggered so operations
 *   teams can identify queries that consistently miss vector coverage.
 */

import type { Pool } from "pg";
import { normalizeFieldQuery } from "./queryNormalizer.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Shape of a single document-chunk row returned by any search tier. */
export type ChunkRow = {
  doc_id: number;
  chunk_index: number;
  content: string;
  /** Cosine similarity (vector tiers) or ts_rank score (FTS tier). */
  similarity: number;
  filename: string;
  file_type: string;
};

/** Which tier produced the results. Useful for telemetry and logging. */
export type SearchMethod =
  | "tier_1_strict"
  | "tier_2_relaxed"
  | "tier_3_fallback";

/** Return value of `tieredVectorSearch`. */
export type TieredSearchResult = {
  results: ChunkRow[];
  method: SearchMethod;
};

// ── Similarity thresholds ──────────────────────────────────────────────────────

/** Tier 1: only very close matches; high-precision, lower recall. */
const TIER_1_THRESHOLD = 0.78;

/** Tier 2: broader similarity window; trades some precision for coverage. */
const TIER_2_THRESHOLD = 0.55;

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Execute a single vector-similarity query filtered by a minimum threshold.
 *
 * Uses the pgvector `<=>` cosine-distance operator.  Distance is converted to
 * similarity with `1 - distance` so the WHERE clause and ORDER BY are both
 * expressed in similarity terms (higher = better).
 */
async function runVectorTier(
  pool: Pool,
  queryVec: string,
  projectId: number,
  threshold: number,
  limit: number
): Promise<ChunkRow[]> {
  const { rows } = await pool.query<ChunkRow>(
    `SELECT
       dc.doc_id,
       dc.chunk_index,
       dc.content,
       (1 - (dc.embedding <=> $1::vector))::float AS similarity,
       pd.filename,
       pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $2
       AND dc.embedding IS NOT NULL
       AND (1 - (dc.embedding <=> $1::vector)) >= $3
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $4`,
    [queryVec, projectId, threshold, limit]
  );
  return rows;
}

/**
 * Execute the Tier 3 full-text search.
 *
 * Attempts `websearch_to_tsquery` first (supports phrases and boolean
 * operators), then degrades to `plainto_tsquery` (safe for any freeform
 * input) if the first attempt fails or returns no rows.
 *
 * The query passed in here is already normalised by the caller.
 */
async function runFtsTier(
  pool: Pool,
  normalizedQuery: string,
  projectId: number,
  limit: number
): Promise<ChunkRow[]> {
  // ── websearch_to_tsquery (handles phrases, AND/OR/NOT operators) ────────────
  try {
    const { rows } = await pool.query<ChunkRow>(
      `SELECT
         dc.doc_id,
         dc.chunk_index,
         dc.content,
         ts_rank(
           to_tsvector('english', dc.content),
           websearch_to_tsquery('english', $1)
         )::float AS similarity,
         pd.filename,
         pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND to_tsvector('english', dc.content)
             @@ websearch_to_tsquery('english', $1)
       ORDER BY similarity DESC
       LIMIT $3`,
      [normalizedQuery, projectId, limit]
    );
    if (rows.length > 0) return rows;
  } catch {
    // websearch_to_tsquery can reject certain operator-heavy strings;
    // fall through to the safer plainto_tsquery.
  }

  // ── plainto_tsquery (safe for any freeform input, no operator support) ──────
  try {
    const { rows } = await pool.query<ChunkRow>(
      `SELECT
         dc.doc_id,
         dc.chunk_index,
         dc.content,
         ts_rank(
           to_tsvector('english', dc.content),
           plainto_tsquery('english', $1)
         )::float AS similarity,
         pd.filename,
         pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND to_tsvector('english', dc.content)
             @@ plainto_tsquery('english', $1)
       ORDER BY similarity DESC
       LIMIT $3`,
      [normalizedQuery, projectId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * tieredVectorSearch
 *
 * Runs the 3-tier semantic search pipeline against the `document_chunks` table
 * and returns the first tier that yields results, along with a method tag for
 * observability.
 *
 * @param pool      - `pg.Pool` instance (injected by the caller so lib/db
 *                    remains portable and testable without a live connection).
 * @param projectId - Project scope for all queries (tenant isolation).
 * @param queryText - Raw user query; will be normalised internally before use.
 * @param embedFn   - Async function that converts a text string to a vector.
 *                    Should return `null` when embeddings are disabled or the
 *                    call fails — in that case Tier 3 is used immediately.
 * @param limit     - Maximum number of rows returned (default: 8).
 *
 * @returns `{ results, method }` where `method` identifies which tier fired.
 *
 * @example
 * import { tieredVectorSearch } from "@workspace/db";
 *
 * const { results, method } = await tieredVectorSearch(
 *   pool,
 *   projectId,
 *   "elec panel demo sqft",
 *   async (text) => (await generateEmbeddings([text]))?.[0] ?? null,
 * );
 * logger.info({ method, count: results.length }, "Document search complete");
 */
export async function tieredVectorSearch(
  pool: Pool,
  projectId: number,
  queryText: string,
  embedFn: (text: string) => Promise<number[] | null>,
  limit = 8
): Promise<TieredSearchResult> {
  // Normalise the query once; all three tiers use the same expanded string.
  const normalized = normalizeFieldQuery(queryText.trim());

  // Attempt to embed the normalised query.  A null return means embeddings are
  // unavailable; skip directly to Tier 3 rather than burning latency on two
  // vector queries that cannot run.
  const vector = await embedFn(normalized).catch(() => null);

  if (vector !== null) {
    const queryVec = JSON.stringify(vector);

    // ── Tier 1: strict threshold ────────────────────────────────────────────────
    // Only very semantically close chunks pass the 0.78 bar.  If results come
    // back here the query is considered well-covered by the index.
    try {
      const tier1 = await runVectorTier(
        pool,
        queryVec,
        projectId,
        TIER_1_THRESHOLD,
        limit
      );
      if (tier1.length > 0) {
        // Transition: (start) → tier_1_strict  [vector results above 0.78]
        return { results: tier1, method: "tier_1_strict" };
      }
    } catch {
      // Tier 1 query failure (e.g. pgvector not installed); fall through to
      // Tier 2 rather than aborting the search entirely.
    }

    // ── Tier 2: relaxed threshold ───────────────────────────────────────────────
    // Broadens the similarity window to 0.55, trading some precision for
    // recall.  Useful for paraphrased or domain-shifted queries.
    try {
      const tier2 = await runVectorTier(
        pool,
        queryVec,
        projectId,
        TIER_2_THRESHOLD,
        limit
      );
      if (tier2.length > 0) {
        // Transition: tier_1_strict (empty) → tier_2_relaxed  [0.55–0.77 range]
        return { results: tier2, method: "tier_2_relaxed" };
      }
    } catch {
      // Tier 2 failure; fall through to full-text.
    }
  }

  // ── Tier 3: full-text fallback ──────────────────────────────────────────────
  // Reached when:
  //   (a) embeddings are unavailable (vector is null), OR
  //   (b) both vector tiers returned zero rows, OR
  //   (c) both vector tiers threw an exception.
  //
  // Emit a console.warn so the normalised query is captured in server logs for
  // telemetry auditing — frequent Tier 3 hits may signal gaps in vector coverage.
  console.warn(
    `[tieredVectorSearch] Tier 3 full-text fallback triggered. ` +
      `project=${projectId} normalized_query="${normalized}"`
  );

  // Transition: tier_2_relaxed (empty) → tier_3_fallback  [tsvector / to_tsquery]
  const tier3 = await runFtsTier(pool, normalized, projectId, limit).catch(
    () => []
  );
  return { results: tier3, method: "tier_3_fallback" };
}
