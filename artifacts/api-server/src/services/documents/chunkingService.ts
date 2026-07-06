import { logger } from "../../lib/logger.js";
import { generateEmbeddings, embeddingsEnabled } from "../../lib/embeddingsClient.js";
import {
  deleteChunksByDocAndCompany,
  bulkInsertChunksWithEmbeddings,
  bulkInsertChunksNoEmbeddings,
} from "../../repositories/documents";

// ── Text Chunking ─────────────────────────────────────────────────────────────
export function chunkText(text: string, maxChars = 900, overlap = 150): string[] {
  if (!text || text.trim().length < 30) return [];

  const paras = text.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 15);
  const chunks: string[] = [];
  let current = "";

  for (const para of paras) {
    if (current.length + para.length + 2 <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (para.length <= maxChars) {
        current = para;
      } else {
        const sents = para.split(/(?<=[.!?:])\s+/);
        current = "";
        for (const sent of sents) {
          if (current.length + sent.length + 1 <= maxChars) {
            current = current ? `${current} ${sent}` : sent;
          } else {
            if (current.trim()) chunks.push(current.trim());
            current = sent.slice(0, maxChars);
          }
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Add trailing overlap from previous chunk for context continuity
  if (overlap > 0 && chunks.length > 1) {
    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const tail = chunks[i - 1].slice(-overlap).trim();
      return `${tail}\n${chunk}`;
    });
  }
  return chunks;
}

// ── Chunk Storage with optional vector embeddings ─────────────────────────────
export async function storeChunks(
  docId: number, projectId: number, companyId: number, text: string
): Promise<number> {
  await deleteChunksByDocAndCompany(docId, companyId);

  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  // Generate embeddings in one batch call for efficiency
  const embeddings = await generateEmbeddings(chunks);
  const hasEmbeddings = embeddings !== null && embeddings.length === chunks.length;

  // When embeddings are expected to be available, failure to generate them is a hard error.
  // We must NOT store chunks without vectors, because that would silently mark the doc as
  // "indexed" while semantic search cannot actually find it. The caller will see chunkCount=0
  // and the UI can show "Re-index" so the user can retry.
  if (!hasEmbeddings && embeddingsEnabled()) {
    logger.error(
      { docId, chunkCount: chunks.length, embeddingsNull: embeddings === null },
      "Embedding generation failed or returned mismatch. Aborting chunk storage so doc stays un-indexed."
    );
    return 0;
  }

  // Bulk insert all chunks in a single round-trip instead of one query per chunk.
  let stored = 0;
  try {
    if (hasEmbeddings && embeddings) {
      await bulkInsertChunksWithEmbeddings(projectId, companyId, docId, chunks, embeddings);
    } else {
      await bulkInsertChunksNoEmbeddings(projectId, companyId, docId, chunks);
    }
    stored = chunks.length;
  } catch (err) {
    logger.error({ err, docId, chunkCount: chunks.length }, "Bulk chunk storage failed");
  }
  logger.info({ docId, stored, hasEmbeddings }, "Stored document chunks");
  return stored;
}
