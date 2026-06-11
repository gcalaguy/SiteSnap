import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectDocumentsTable, projectsTable, costAnalysesTable, pool } from "@workspace/db";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requirePermission } from "../lib/permissionGate.js";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import { convertPDFPagesToImages } from "../lib/pdfOcr.js";
import { generateEmbeddings, embeddingsEnabled } from "../lib/embeddingsClient.js";
import { RegisterDocumentBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });
const objectStorageService = new ObjectStorageService();

const SearchDocumentsBody = z.strictObject({
  query: z.string().min(2).max(1000),
});

const QAHistoryItem = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});

const QADocumentsBody = z.strictObject({
  question: z.string().min(3).max(2000),
  history: z.array(QAHistoryItem).max(20).optional(),
});

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const PDF_TYPES = ["application/pdf"];
const WORD_TYPES = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

function isImage(ft: string) { return IMAGE_TYPES.includes(ft.toLowerCase()); }
function isPDF(ft: string) { return PDF_TYPES.includes(ft.toLowerCase()) || ft.toLowerCase().endsWith("pdf"); }
function isWord(ft: string) { return WORD_TYPES.includes(ft.toLowerCase()) || ft.toLowerCase().endsWith("docx") || ft.toLowerCase().endsWith("doc"); }

// ── Text Chunking ─────────────────────────────────────────────────────────────
function chunkText(text: string, maxChars = 900, overlap = 150): string[] {
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
async function storeChunks(
  docId: number, projectId: number, companyId: number, text: string
): Promise<number> {
  await pool.query("DELETE FROM document_chunks WHERE doc_id = $1", [docId]);

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
      // Build parameterised bulk INSERT for chunks with vector embeddings
      const valuePlaceholders = chunks.map(
        (_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6}::vector)`
      ).join(",");
      const values = chunks.flatMap((chunk, i) => [
        projectId, companyId, docId, i, chunk, JSON.stringify(embeddings[i])
      ]);
      await pool.query(
        `INSERT INTO document_chunks (project_id, company_id, doc_id, chunk_index, content, embedding) VALUES ${valuePlaceholders}`,
        values
      );
    } else {
      // Full-text only mode — bulk insert without vectors
      const valuePlaceholders = chunks.map(
        (_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`
      ).join(",");
      const values = chunks.flatMap((chunk, i) => [projectId, companyId, docId, i, chunk]);
      await pool.query(
        `INSERT INTO document_chunks (project_id, company_id, doc_id, chunk_index, content) VALUES ${valuePlaceholders}`,
        values
      );
    }
    stored = chunks.length;
  } catch (err) {
    logger.error({ err, docId, chunkCount: chunks.length }, "Bulk chunk storage failed");
  }
  logger.info({ docId, stored, hasEmbeddings }, "Stored document chunks");
  return stored;
}

// ── Vector + Full-Text Search ───────────────────────────────────────────────
type ChunkResult = {
  doc_id: number; chunk_index: number; content: string;
  similarity: number; filename: string; file_type: string;
};

async function vectorSearch(projectId: number, queryText: string, limit = 8): Promise<ChunkResult[]> {
  if (!embeddingsEnabled()) return [];
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const embeddings = await generateEmbeddings([trimmed]);
  if (!embeddings || embeddings.length === 0) return [];

  const queryVec = JSON.stringify(embeddings[0]);

  try {
    const result = await pool.query<ChunkResult>(
      `SELECT dc.doc_id, dc.chunk_index, dc.content,
         (1 - (dc.embedding <=> $1::vector))::float AS similarity,
         pd.filename, pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $3`,
      [queryVec, projectId, limit]
    );
    return result.rows;
  } catch (err) {
    logger.warn({ err }, "Vector search failed");
    return [];
  }
}

async function fullTextSearch(projectId: number, queryText: string, limit = 8): Promise<ChunkResult[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  // Try websearch_to_tsquery first (handles phrases, boolean operators)
  try {
    const result = await pool.query<ChunkResult>(
      `SELECT dc.doc_id, dc.chunk_index, dc.content,
         ts_rank(to_tsvector('english', dc.content), websearch_to_tsquery('english', $1))::float AS similarity,
         pd.filename, pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND to_tsvector('english', dc.content) @@ websearch_to_tsquery('english', $1)
       ORDER BY similarity DESC
       LIMIT $3`,
      [trimmed, projectId, limit]
    );
    if (result.rows.length > 0) return result.rows;
  } catch (err) {
    logger.warn({ err }, "FTS websearch query failed, trying plainto_tsquery");
  }

  // Fallback: plainto_tsquery (simpler, no operators — better for short queries)
  try {
    const result = await pool.query<ChunkResult>(
      `SELECT dc.doc_id, dc.chunk_index, dc.content,
         ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1))::float AS similarity,
         pd.filename, pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)
       ORDER BY similarity DESC
       LIMIT $3`,
      [trimmed, projectId, limit]
    );
    if (result.rows.length > 0) return result.rows;
  } catch (err) {
    logger.warn({ err }, "FTS plainto query failed, falling back to ILIKE");
  }

  // Last resort: ILIKE for exact term matches (handles proper nouns, codes, amounts)
  try {
    const result = await pool.query<ChunkResult>(
      `SELECT dc.doc_id, dc.chunk_index, dc.content,
         0.1::float AS similarity,
         pd.filename, pd.file_type
       FROM document_chunks dc
       JOIN project_documents pd ON dc.doc_id = pd.id
       WHERE dc.project_id = $2
         AND dc.content ILIKE $3
       LIMIT $4`,
      [projectId, `%${trimmed}%`, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

type HybridResult = { results: ChunkResult[]; semantic: boolean };

/**
 * Hybrid search: tries vector similarity first (if available), then falls back to full-text.
 * Returns deduplicated chunks per document, highest similarity first,
 * plus a `semantic` flag indicating whether the results came from vector search.
 */
async function hybridSearch(projectId: number, queryText: string, limit = 8): Promise<HybridResult> {
  const vecResults = await vectorSearch(projectId, queryText, limit);
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
  const ftResults = await fullTextSearch(projectId, queryText, limit);
  return { results: ftResults, semantic: false };
}

// ── PDF / Word Text Extraction ────────────────────────────────────────────────
async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer, verbosity: 0 } as any);
    const result = await parser.getText();
    return (result as any).text ?? "";
  } catch (err) {
    logger.error({ err }, "PDF parse failed");
    return "";
  }
}

async function extractWordText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    logger.error({ err }, "Word extract failed");
    return "";
  }
}

const MIN_EXTRACTED_CHARS = 80;   // threshold to trigger OCR
const OCR_MAX_PAGES = 10;
const OCR_DPI = 250;

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /projects/:projectId/documents
router.get("/", requireAuth, requireCompany, requirePermission("viewDocuments"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const docs = await db
    .select()
    .from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId))
    .orderBy(projectDocumentsTable.createdAt);

  // Attach chunk counts for RAG status
  const counts = await pool.query<{ doc_id: number; cnt: string }>(
    "SELECT doc_id, COUNT(*) AS cnt FROM document_chunks WHERE project_id=$1 GROUP BY doc_id",
    [projectId]
  );
  const chunkMap = Object.fromEntries(counts.rows.map(r => [r.doc_id, parseInt(r.cnt)]));
  const docsWithRag = docs.map(d => ({ ...d, chunkCount: chunkMap[d.id] ?? 0 }));

  res.json(docsWithRag);
}));

// POST /projects/:projectId/documents
router.post("/", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = RegisterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues }); return; }

  const [doc] = await db
    .insert(projectDocumentsTable)
    .values({
      projectId,
      uploadedByUserId: req.userId!,
      filename: parsed.data.filename,
      fileType: parsed.data.fileType,
      objectPath: parsed.data.objectPath,
      fileSize: parsed.data.fileSize ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json({ ...doc, chunkCount: 0 });
}));

// DELETE /projects/:projectId/documents/:docId
router.delete("/:docId", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  await pool.query("DELETE FROM document_chunks WHERE doc_id=$1 AND project_id=$2", [docId, projectId]);
  await db.delete(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  res.status(204).send();
}));

// POST /projects/:projectId/documents/:docId/embed — manual re-chunk (kept for back-compat)
router.post("/:docId/embed", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!doc.extractedText) { res.status(400).json({ error: "Document has no extracted text yet. Analyze it first." }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  const count = await storeChunks(docId, projectId, project.companyId!, doc.extractedText);
  res.json({ ok: true, chunks: count });
}));

// POST /projects/:projectId/documents/:docId/extract (legacy)
router.post("/:docId/extract", requireAuth, requireCompany, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (!isImage(doc.fileType)) {
    await db.update(projectDocumentsTable)
      .set({ status: "failed", aiSummary: "Use the Analyze button for full AI analysis." })
      .where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.json({ status: "failed", message: "Use /analyze instead" });
    return;
  }
  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  await runImageAnalysis(doc, docId, projectId, project.companyId, res);
}));

// POST /projects/:projectId/documents/:docId/analyze
router.post("/:docId/analyze", requireAuth, requireCompany, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  await db.update(projectDocumentsTable).set({ status: "processing" }).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );

  if (isImage(doc.fileType)) {
    await runImageAnalysis(doc, docId, projectId, project.companyId, res);
  } else if (isPDF(doc.fileType) || doc.filename.toLowerCase().endsWith(".pdf")) {
    await runPDFAnalysis(doc, docId, projectId, project.companyId, res);
  } else if (isWord(doc.fileType) || doc.filename.toLowerCase().endsWith(".docx") || doc.filename.toLowerCase().endsWith(".doc")) {
    await runWordAnalysis(doc, docId, projectId, project.companyId, res);
  } else {
    await runDocumentProfile(doc, docId, projectId, project.companyId, res);
  }
}));

// POST /projects/:projectId/documents/search
router.post("/search", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  // P0: verify the project belongs to the requester's company before exposing document content
  const [projectOwnership] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!projectOwnership || projectOwnership.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const parsedSearch = SearchDocumentsBody.safeParse(req.body);
  if (!parsedSearch.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsedSearch.error.issues });
    return;
  }
  const { query } = parsedSearch.data;

  // Try hybrid search (vector + full-text) on document chunks
  let searchUsedVectors = false;
  try {
    const { results: chunks, semantic: usedVectors } = await hybridSearch(projectId, query.trim(), 10);
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
      const docs = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
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
      res.json({ results: enriched, answer, semantic: searchUsedVectors });
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Full-text search failed, falling back to LLM search");
  }

  // Fallback: LLM-based search on extracted text
  const docs = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));
  if (docs.length === 0) { res.json({ results: [], answer: "No documents in this project yet." }); return; }

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

    res.json({ results: enriched, answer: parsed.answer ?? "", semantic: false });
  } catch (err) {
    logger.error({ err }, "Document search failed");
    res.status(500).json({ error: "Search failed" });
  }
}));

// POST /projects/:projectId/documents/qa — RAG-powered Q&A with multi-turn
router.post("/qa", requireAuth, requireCompany, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const parsedQA = QADocumentsBody.safeParse(req.body);
  if (!parsedQA.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsedQA.error.issues });
    return;
  }
  const { question, history = [] } = parsedQA.data;

  // P0: verify the project belongs to the requester's company before exposing AI context
  const [project] = await db.select({ name: projectsTable.name, companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  const docs = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));

  if (docs.length === 0) {
    res.json({ answer: "No documents have been uploaded to this project yet. Upload and analyze your documents first to enable AI Q&A.", citations: [], ragEnabled: false });
    return;
  }

  const systemPrompt = `You are Site Snap AI, a construction document assistant for the project "${project?.name ?? "this project"}".
You help Canadian contractors understand their project documents — contracts, blueprints, specifications, invoices, change orders, RFIs, safety plans, permits, and correspondence.
Answer questions based ONLY on the provided document sections. When citing a document, mention it by name in quotes.
Be concise, professional, and construction-industry aware. Use CAD for currency unless stated otherwise.
If the answer is not in the provided material, say so honestly. Do not guess or hallucinate.`;

  // ── Attempt hybrid RAG (vector + full-text) ───────────────────────────────
  let usedSemanticRag = false;
  try {
    const { results: chunks, semantic } = await hybridSearch(projectId, question.trim(), 8);
    usedSemanticRag = semantic;

    if (chunks.length > 0) {
      const context = chunks.map((c, i) =>
        `[${i + 1}] From "${c.filename}":\n${c.content}`
      ).join("\n\n---\n\n");

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: `${systemPrompt}\n\n## Relevant document sections:\n\n${context}` },
        ...((history as { role: string; text: string }[]).slice(-8).map(h => ({
          role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: h.text,
        }))),
        { role: "user", content: question.trim() },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 2048,
        messages,
      });

      const answer = response.choices[0]?.message?.content ?? "I could not generate an answer.";

      // Citations: unique docs referenced in top chunks
      const citedDocs = new Map<number, { id: number; filename: string; excerpt: string }>();
      for (const c of chunks) {
        if (!citedDocs.has(c.doc_id)) {
          citedDocs.set(c.doc_id, { id: c.doc_id, filename: c.filename, excerpt: c.content.slice(0, 200) });
        }
      }

      // ragEnabled reflects whether semantic vector search actually contributed
      res.json({ answer, citations: [...citedDocs.values()], ragEnabled: usedSemanticRag });
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Full-text RAG failed, falling back to summaries");
  }

  // ── Fallback: extractedText stuffing ──────────────────────────────────────
  const analyzedDocs = docs.filter(d => d.aiSummary || d.extractedText || d.extractedData);
  if (analyzedDocs.length === 0) {
    res.json({
      answer: "No documents have been analyzed yet. Click 'Analyze' on your documents so I can read their contents.",
      citations: [],
      ragEnabled: false,
    });
    return;
  }

  const docContext = analyzedDocs.map((d, i) => {
    const extracted = d.extractedData as Record<string, unknown> | null;
    const ef = (extracted?.extractedData ?? {}) as Record<string, unknown>;
    const parts = [`[${i + 1}] "${d.filename}"`];
    if (d.aiSummary) parts.push(`Summary: ${d.aiSummary}`);
    if (d.extractedText) parts.push(`Content: ${d.extractedText.slice(0, 800)}`);
    if (ef.vendor) parts.push(`Vendor: ${ef.vendor}`);
    if (ef.amount != null) parts.push(`Amount: CAD$${ef.amount}`);
    if (ef.date) parts.push(`Date: ${ef.date}`);
    return parts.join("\n");
  }).join("\n\n---\n\n");

  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...((history as { role: string; text: string }[]).slice(-6).map(h => ({
        role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: h.text,
      }))),
      { role: "user", content: `Project documents:\n\n${docContext}\n\n---\n\nQuestion: ${question.trim()}` },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages,
    });

    const answer = response.choices[0]?.message?.content ?? "I could not generate an answer.";
    const citations = analyzedDocs.filter(d =>
      answer.toLowerCase().includes(d.filename.toLowerCase())
    ).map(d => ({ id: d.id, filename: d.filename, excerpt: "" }));

    // Check if any chunks exist so the frontend can show an actionable message
    const chunkCountRow = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM document_chunks WHERE project_id = $1",
      [projectId]
    );
    const hasChunks = parseInt(chunkCountRow.rows[0]?.cnt ?? "0") > 0;

    // Find analyzed docs that have zero chunks (need re-index)
    const analyzedDocIds = docs.filter(d => d.status === "ready" && (d.aiSummary || d.extractedText)).map(d => d.id);
    let hasAnalyzedDocsWithNoChunks = false;
    if (analyzedDocIds.length > 0) {
      const chunkDocRow = await pool.query<{ doc_id: number }>(
        `SELECT DISTINCT doc_id FROM document_chunks WHERE project_id = $1 AND doc_id = ANY($2)`,
        [projectId, analyzedDocIds]
      );
      const chunkedDocIds = new Set(chunkDocRow.rows.map(r => r.doc_id));
      hasAnalyzedDocsWithNoChunks = analyzedDocIds.some(id => !chunkedDocIds.has(id));
    }

    res.json({ answer, citations, ragEnabled: false, hasChunks, hasAnalyzedDocsWithNoChunks });
  } catch (err) {
    logger.error({ err }, "Document Q&A failed");
    res.status(500).json({ error: "Q&A failed" });
  }
}));

// ── Internal helpers ──────────────────────────────────────────────────────────

async function runImageAnalysis(
  doc: typeof projectDocumentsTable.$inferSelect,
  docId: number, projectId: number, companyId: number, res: any
) {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();
    const base64 = fileContent.toString("base64");
    const mimeType = doc.fileType.includes("/") ? doc.fileType : `image/${doc.fileType}`;

    const prompt = `You are a construction document analyst for Canadian construction companies.

Analyze this image (receipt, invoice, site photo, delivery slip, safety inspection, contract, blueprint, etc.) and return ONLY a JSON object:
- documentType: string (e.g. "Receipt","Invoice","Blueprint","Site Photo","Safety Inspection","Contract","Delivery Slip","Other")
- summary: string (2-3 sentence professional summary — include amounts, dates, vendors if visible)
- ocrText: string (ALL text visible in the image, transcribed verbatim; empty string if photo with no text)
- extractedData: object:
  - vendor: string | null
  - amount: number | null
  - currency: "CAD"|"USD"|null
  - date: string | null (ISO)
  - items: {description,quantity,unitPrice,total}[] or []
  - projectReference: string | null
  - invoiceNumber: string | null
  - notes: string | null
- confidence: "high"|"medium"|"low"

Respond with ONLY the JSON object. No markdown. No explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch {
      parsed = { documentType: "Unknown", summary: "Uploaded and stored.", extractedData: {}, confidence: "low", ocrText: "" };
    }

    const ocrText = typeof parsed.ocrText === "string" ? parsed.ocrText : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary : null;
    const extractedText = [summary, ocrText].filter(Boolean).join("\n\n") || null;

    await db.update(projectDocumentsTable).set({
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

    // Store chunks for full-text search (synchronous so chunkCount is accurate)
    let chunkCount = 0;
    if (extractedText && extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.json({ ...updated, chunkCount });
  } catch (err) {
    logger.error({ err }, "Image AI analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed", aiSummary: "Analysis failed." }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.status(500).json({ error: "Analysis failed" });
  }
}

async function runPDFAnalysis(
  doc: typeof projectDocumentsTable.$inferSelect,
  docId: number, projectId: number, companyId: number, res: any
) {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();

    let rawText = await extractPDFText(fileContent);
    let ocrFallback = false;

    // ── OCR Fallback for image-only PDFs ──────────────────────────────
    if (rawText.trim().length < MIN_EXTRACTED_CHARS) {
      logger.info({ docId, filename: doc.filename, extractedChars: rawText.trim().length }, "PDF text too short; triggering OCR fallback");
      ocrFallback = true;
      await db.update(projectDocumentsTable)
        .set({ status: "processing_ocr" as any })
        .where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

      const images = await convertPDFPagesToImages(fileContent, OCR_MAX_PAGES, OCR_DPI);
      if (images.length > 0) {
        const ocrPrompt = `You are a construction document analyst for Canadian construction companies.

You are looking at scanned pages from a PDF named "${doc.filename}".
Extract ALL visible text, numbers, labels, dimensions, annotations, and project specifications from these images.
Then analyze and return ONLY a JSON object:
- documentType: string (e.g. "Contract","Blueprint","Specification","Schedule","Invoice","Safety Plan","Permit","Change Order","RFI","Report","Correspondence","Other")
- summary: string (2-4 sentence professional summary covering key details: parties, amounts, dates, scope)
- ocrText: string (ALL text visible in the images, transcribed verbatim)
- extractedData: object:
  - vendor: string | null
  - amount: number | null
  - currency: "CAD"|"USD"|null
  - date: string | null (ISO)
  - projectReference: string | null
  - invoiceNumber: string | null
  - version: string | null
  - notes: string | null
- confidence: "high"|"medium"|"low"

Respond with ONLY the JSON object. No markdown. No explanation.`;

        const visionContent: any = [
          { type: "text", text: ocrPrompt },
          ...images.map(img => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" as const },
          })),
        ];

        const visionResponse = await openai.chat.completions.create({
          model: "gpt-5.4",
          max_completion_tokens: 8192,
          messages: [{ role: "user", content: visionContent }],
        });

        const visionResultText = visionResponse.choices[0]?.message?.content ?? "{}";
        let visionParsed: Record<string, unknown>;
        try { visionParsed = JSON.parse(visionResultText); } catch {
          visionParsed = { documentType: "PDF", summary: "Scanned PDF document uploaded.", extractedData: {}, confidence: "low", ocrText: "" };
        }

        const ocrText = typeof visionParsed.ocrText === "string" ? visionParsed.ocrText : "";
        rawText = ocrText.trim() || rawText.trim();
        // Merge: let the vision-parsed result take precedence if we got real OCR data
        if (rawText.length >= MIN_EXTRACTED_CHARS) {
          // Re-run classification with the OCR text using the normal prompt
          const classifyPrompt = `You are a construction document analyst for Canadian construction companies.

The following text was extracted from a PDF named "${doc.filename}" via OCR.

Analyze it and return ONLY a JSON object:
- documentType: string (e.g. "Contract","Blueprint","Specification","Schedule","Invoice","Safety Plan","Permit","Change Order","RFI","Report","Correspondence","Other")
- summary: string (2-4 sentence professional summary covering key details: parties, amounts, dates, scope)
- extractedData: object:
  - vendor: string | null
  - amount: number | null
  - currency: "CAD"|"USD"|null
  - date: string | null (ISO)
  - projectReference: string | null
  - invoiceNumber: string | null
  - version: string | null
  - notes: string | null
- confidence: "high"|"medium"|"low"

Extracted text:
${rawText.slice(0, 6000)}

Respond with ONLY the JSON object. No markdown.`;

          const classifyResponse = await openai.chat.completions.create({
            model: "gpt-5.4",
            max_completion_tokens: 2048,
            messages: [{ role: "user", content: classifyPrompt }],
          });

          const classifyContent = classifyResponse.choices[0]?.message?.content ?? "{}";
          let classifyParsed: Record<string, unknown>;
          try { classifyParsed = JSON.parse(classifyContent); } catch {
            classifyParsed = { documentType: "PDF", summary: "PDF document uploaded.", extractedData: {}, confidence: "low" };
          }

          const summary = typeof classifyParsed.summary === "string" ? classifyParsed.summary : (typeof visionParsed.summary === "string" ? visionParsed.summary : "PDF document stored.");
          await db.update(projectDocumentsTable).set({
            status: "ready", aiSummary: summary, extractedData: classifyParsed, extractedText: rawText,
          }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

          let chunkCount = 0;
          if (rawText.length > 50) {
            chunkCount = await storeChunks(docId, projectId, companyId, rawText);
          }

          const [updated] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
          res.json({ ...updated, chunkCount });
          return;
        }
        // OCR produced text but not enough for classification; fall through to normal flow with what we have
      }
      // No images generated or OCR failed; fall through to normal flow
    }

    // ── Normal text-based analysis (or fallback with minimal text) ───────────
    const textForAnalysis = rawText.slice(0, 6000);
    const prompt = `You are a construction document analyst for Canadian construction companies.

The following text was extracted from a PDF named "${doc.filename}".

Analyze it and return ONLY a JSON object:
- documentType: string (e.g. "Contract","Blueprint","Specification","Schedule","Invoice","Safety Plan","Permit","Change Order","RFI","Report","Correspondence","Other")
- summary: string (2-4 sentence professional summary covering key details: parties, amounts, dates, scope)
- extractedData: object:
  - vendor: string | null
  - amount: number | null
  - currency: "CAD"|"USD"|null
  - date: string | null (ISO)
  - projectReference: string | null
  - invoiceNumber: string | null
  - version: string | null
  - notes: string | null
- confidence: "high"|"medium"|"low"

Extracted text:
${textForAnalysis || "(No text could be extracted from this PDF)"}

Respond with ONLY the JSON object. No markdown.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch {
      parsed = { documentType: "PDF", summary: "PDF document uploaded.", extractedData: {}, confidence: "low" };
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : "PDF document stored.";
    const extractedText = rawText.trim() || summary;

    await db.update(projectDocumentsTable).set({
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

    let chunkCount = 0;
    if (extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.json({ ...updated, chunkCount });
  } catch (err) {
    logger.error({ err }, "PDF analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.status(500).json({ error: "Analysis failed" });
  }
}

async function runWordAnalysis(
  doc: typeof projectDocumentsTable.$inferSelect,
  docId: number, projectId: number, companyId: number, res: any
) {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();

    const rawText = await extractWordText(fileContent);
    const textForAnalysis = rawText.slice(0, 6000);

    const prompt = `You are a construction document analyst for Canadian construction companies.

The following text was extracted from a Word document named "${doc.filename}".

Analyze it and return ONLY a JSON object:
- documentType: string (e.g. "Contract","Specification","Report","Schedule","Correspondence","Safety Plan","Other")
- summary: string (2-4 sentence professional summary covering key details)
- extractedData: object with relevant fields (vendor, amount, currency, date, projectReference, notes, version)
- confidence: "high"|"medium"|"low"

Extracted text:
${textForAnalysis || "(No text could be extracted)"}

Respond with ONLY the JSON object. No markdown.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch {
      parsed = { documentType: "Word Document", summary: "Document uploaded.", extractedData: {}, confidence: "low" };
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : "Word document stored.";
    const extractedText = rawText.trim() || summary;

    await db.update(projectDocumentsTable).set({
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

    let chunkCount = 0;
    if (extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.json({ ...updated, chunkCount });
  } catch (err) {
    logger.error({ err }, "Word analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.status(500).json({ error: "Analysis failed" });
  }
}

async function runDocumentProfile(
  doc: typeof projectDocumentsTable.$inferSelect,
  docId: number, projectId: number, companyId: number, res: any
) {
  try {
    const ext = doc.filename.split(".").pop()?.toUpperCase() ?? "File";
    const prompt = `You are a construction document assistant for a Canadian construction company.

A file named "${doc.filename}" (type: ${doc.fileType}) has been uploaded.
Based on the filename and file type, generate a professional document profile as a JSON object:
- documentType: string (e.g. "Contract","Blueprint","Specification","Schedule","Report","Budget","Safety Plan","Permit","Correspondence","Other")
- summary: string (2-3 sentence professional description of likely contents)
- extractedData: { projectReference: string|null, date: string|null, version: string|null, notes: string|null }
- confidence: "low"

Respond with ONLY the JSON object, no markdown.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch {
      parsed = { documentType: ext, summary: `${ext} document uploaded.`, extractedData: {}, confidence: "low" };
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : `${ext} document stored.`;

    await db.update(projectDocumentsTable).set({
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText: summary,
    }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));

    const [updated] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.json({ ...updated, chunkCount: 0 });
  } catch (err) {
    logger.error({ err }, "Document profile generation failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
    res.status(500).json({ error: "Analysis failed" });
  }
}

// POST /projects/:projectId/documents/:docId/reindex — re-run OCR + chunk for full-text search
router.post("/:docId/reindex", requireAuth, requireCompany, requireOwnerOrForeman, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "ready") {
    res.status(400).json({ error: "Document must be fully analyzed before re-indexing." }); return;
  }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  let textToChunk = doc.extractedText ?? "";

  // If stored text is insufficient and it's a PDF, attempt OCR re-run
  if (textToChunk.trim().length < MIN_EXTRACTED_CHARS && (isPDF(doc.fileType) || doc.filename.toLowerCase().endsWith(".pdf"))) {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
      const [fileContent] = await objectFile.download();

      let rawText = await extractPDFText(fileContent);
      if (rawText.trim().length < MIN_EXTRACTED_CHARS) {
        const images = await convertPDFPagesToImages(fileContent, OCR_MAX_PAGES, OCR_DPI);
        if (images.length > 0) {
          const ocrPrompt = `Extract ALL visible text from these scanned PDF pages verbatim. Return ONLY the raw text, no JSON, no explanations.`;
          const visionContent: Parameters<typeof openai.chat.completions.create>[0]["messages"][number]["content"] = [
            { type: "text", text: ocrPrompt },
            ...images.map(img => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" as const },
            })),
          ];
          const ocrResponse = await openai.chat.completions.create({
            model: "gpt-5.4",
            max_completion_tokens: 8192,
            messages: [{ role: "user", content: visionContent }],
          });
          rawText = ocrResponse.choices[0]?.message?.content ?? "";
        }
      }

      if (rawText.trim().length > 50) {
        textToChunk = rawText;
        await db.update(projectDocumentsTable).set({ extractedText: rawText }).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
      }
    } catch (err) {
      logger.error({ err, docId }, "Reindex OCR failed");
    }
  }

  if (textToChunk.trim().length < 50) {
    res.json({ chunkCount: 0, message: "Not enough text to index. Try re-analyzing the document first." });
    return;
  }

  const chunkCount = await storeChunks(docId, projectId, project.companyId!, textToChunk);
  res.json({ chunkCount });
}));

// POST /projects/:projectId/documents/:docId/push-to-costs
router.post("/:docId/push-to-costs", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const { category } = req.body as { category?: string };
  const validCategories = ["materials", "labour", "equipment", "other"] as const;
  type Category = typeof validCategories[number];
  const cat: Category = (validCategories.includes(category as Category) ? category : "other") as Category;

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "ready" || !doc.extractedData) {
    res.status(400).json({ error: "Document must be analyzed before pushing to costs." }); return;
  }

  const data = doc.extractedData as Record<string, unknown>;
  const fields = (data.extractedData ?? {}) as Record<string, unknown>;
  const rawAmount = typeof fields.amount === "number" ? fields.amount : 0;
  if (rawAmount <= 0) {
    res.status(400).json({ error: "No financial amount found in this document." }); return;
  }

  const vendor = typeof fields.vendor === "string" ? fields.vendor : null;
  const docDate = typeof fields.date === "string" ? fields.date : null;
  const docType = typeof data.documentType === "string" ? data.documentType : "Document";
  const summary = typeof data.summary === "string" ? data.summary : doc.aiSummary ?? "";

  const labelParts: string[] = [];
  if (vendor) labelParts.push(vendor);
  if (docDate) labelParts.push(docDate.slice(0, 10));
  else labelParts.push(new Date().toISOString().slice(0, 10));
  const periodLabel = labelParts.join(" — ") || `${docType} — ${new Date().toISOString().slice(0, 10)}`;

  const amount = rawAmount.toFixed(2);
  const costs: Record<Category, string> = {
    materials: "0.00", labour: "0.00", equipment: "0.00", other: "0.00",
  };
  costs[cat] = amount;
  const total = rawAmount.toFixed(2);

  const invoiceNum = typeof fields.invoiceNumber === "string" ? fields.invoiceNumber : null;
  const noteParts: string[] = [];
  if (doc.filename) noteParts.push(`Source: ${doc.filename}`);
  if (invoiceNum) noteParts.push(`Invoice #${invoiceNum}`);
  if (fields.notes && typeof fields.notes === "string") noteParts.push(fields.notes);
  const notes = noteParts.join(" · ") || null;

  const [entry] = await db.insert(costAnalysesTable).values({
    projectId,
    periodLabel,
    labourCost: costs.labour,
    materialsCost: costs.materials,
    equipmentCost: costs.equipment,
    otherCost: costs.other,
    totalCost: total,
    notes,
    aiAnalysis: summary || null,
  }).returning();

  res.status(201).json(entry);
}));

export default router;
