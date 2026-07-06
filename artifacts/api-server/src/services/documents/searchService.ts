import { logger } from "../../lib/logger.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateEmbeddings, embeddingsEnabled } from "../../lib/embeddingsClient.js";
import {
  vectorSearchQuery,
  ftsWebsearchQuery,
  ftsPlainQuery,
  ftsIlikeQuery,
  listDocumentsForProject,
  type ChunkResult,
} from "../../repositories/documents";

export type { ChunkResult };

// ── Vector + Full-Text Search ───────────────────────────────────────────────

export async function vectorSearch(projectId: number, companyId: number, queryText: string, limit = 8): Promise<ChunkResult[]> {
  if (!embeddingsEnabled()) return [];
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const embeddings = await generateEmbeddings([trimmed]);
  if (!embeddings || embeddings.length === 0) return [];

  const queryVec = JSON.stringify(embeddings[0]);

  try {
    return await vectorSearchQuery(projectId, companyId, queryVec, limit);
  } catch (err) {
    logger.warn({ err }, "Vector search failed");
    return [];
  }
}

export async function fullTextSearch(projectId: number, companyId: number, queryText: string, limit = 8): Promise<ChunkResult[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  // Try websearch_to_tsquery first (handles phrases, boolean operators)
  try {
    const rows = await ftsWebsearchQuery(projectId, companyId, trimmed, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    logger.warn({ err }, "FTS websearch query failed, trying plainto_tsquery");
  }

  // Fallback: plainto_tsquery (simpler, no operators — better for short queries)
  try {
    const rows = await ftsPlainQuery(projectId, companyId, trimmed, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    logger.warn({ err }, "FTS plainto query failed, falling back to ILIKE");
  }

  // Last resort: ILIKE for exact term matches (handles proper nouns, codes, amounts)
  try {
    return await ftsIlikeQuery(projectId, companyId, trimmed, limit);
  } catch {
    return [];
  }
}

export type HybridResult = { results: ChunkResult[]; semantic: boolean };

/**
 * Hybrid search: tries vector similarity first (if available), then falls back to full-text.
 * Returns deduplicated chunks per document, highest similarity first,
 * plus a `semantic` flag indicating whether the results came from vector search.
 *
 * companyId is filtered at the query layer (not just via the caller's upstream project-ownership
 * check) so this stays safe even if a future call site skips that check.
 */
export async function hybridSearch(projectId: number, companyId: number, queryText: string, limit = 8): Promise<HybridResult> {
  const vecResults = await vectorSearch(projectId, companyId, queryText, limit);
  if (vecResults.length > 0) {
    const byDoc = new Map<number, ChunkResult>();
    for (const c of vecResults) {
      const existing = byDoc.get(c.doc_id);
      if (!existing || c.similarity > existing.similarity) {
        byDoc.set(c.doc_id, c);
      }
    }
    return {
      results: [...byDoc.values()].sort((a, b) => b.similarity - a.similarity),
      semantic: true,
    };
  }
  const ftResults = await fullTextSearch(projectId, companyId, queryText, limit);
  return { results: ftResults, semantic: false };
}

// ── /search route orchestration ───────────────────────────────────────────────

export type SearchDocumentsResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function searchDocuments(
  projectId: number,
  companyId: number,
  query: string,
): Promise<SearchDocumentsResult> {
  // Try hybrid search (vector + full-text) on document chunks
  let searchUsedVectors = false;
  try {
    const { results: chunks, semantic: usedVectors } = await hybridSearch(projectId, companyId, query.trim(), 10);
    searchUsedVectors = usedVectors;
    if (chunks.length > 0) {
      // Group by doc and return unique doc results
      const byDoc = new Map<number, { doc_id: number; filename: string; file_type: string; maxSim: number; excerpt: string }>();
      for (const c of chunks) {
        const existing = byDoc.get(c.doc_id);
        if (!existing || c.similarity > existing.maxSim) {
          byDoc.set(c.doc_id, { doc_id: c.doc_id, filename: c.filename, file_type: c.file_type, maxSim: c.similarity, excerpt: c.content.slice(0, 300) });
        }
      }

      // Load full doc records
      const docs = await listDocumentsForProject(projectId);
      const enriched = [...byDoc.values()].map(r => {
        const doc = docs.find(d => d.id === r.doc_id);
        if (!doc) return null;
        const rel = r.maxSim > 0.7 ? "high" : r.maxSim > 0.45 ? "medium" : "low";
        return { ...doc, relevance: rel, reason: r.excerpt, chunkCount: 0 };
      }).filter(Boolean);

      const answer = enriched.length > 0
        ? `Found ${enriched.length} relevant document${enriched.length > 1 ? "s" : ""}.`
        : "No closely matching documents found.";

      // semantic = true only when vector search actually contributed results
      return { ok: true, body: { results: enriched, answer, semantic: searchUsedVectors } };
    }
  } catch (err) {
    logger.warn({ err }, "Full-text search failed, falling back to LLM search");
  }

  // Fallback: LLM-based search on extracted text
  const docs = await listDocumentsForProject(projectId);
  if (docs.length === 0) {
    return { ok: true, body: { results: [], answer: "No documents in this project yet." } };
  }

  const docContext = docs.map((d, i) => {
    const extracted = d.extractedData as Record<string, unknown> | null;
    const summary = d.aiSummary ?? (extracted?.summary as string) ?? null;
    const text = d.extractedText ?? null;
    return `[Doc ${i + 1}] ID:${d.id} | File: ${d.filename}\nSummary: ${summary ?? "Not analyzed yet"}\nContent: ${text ? text.slice(0, 400) : "N/A"}`;
  }).join("\n\n---\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: `You are a construction document assistant. Search for: "${query.trim()}"\n\nDocuments:\n${docContext}\n\nReturn JSON: {"results":[{"docId":N,"relevance":"high|medium|low","reason":"one sentence"}],"answer":"2-3 sentence summary"}` }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: { results: { docId: number; relevance: string; reason: string }[]; answer: string };
    try { parsed = JSON.parse(content); } catch { parsed = { results: [], answer: "Could not process results." }; }

    const enriched = (parsed.results ?? []).map(r => {
      const doc = docs.find(d => d.id === r.docId);
      if (!doc) return null;
      return { ...doc, relevance: r.relevance, reason: r.reason, chunkCount: 0 };
    }).filter(Boolean);

    return { ok: true, body: { results: enriched, answer: parsed.answer ?? "", semantic: false } };
  } catch (err) {
    logger.error({ err }, "Document search failed");
    return { ok: false, status: 500, error: "Search failed" };
  }
}
