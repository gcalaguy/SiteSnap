import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectDocumentsTable, projectsTable, pool } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth.js";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

const router = Router({ mergeParams: true });
const objectStorageService = new ObjectStorageService();

const RegisterDocumentBody = z.object({
  filename: z.string().min(1),
  fileType: z.string().min(1),
  objectPath: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
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

// ── Embedding & Storage ───────────────────────────────────────────────────────
async function embedAndStoreChunks(
  docId: number, projectId: number, companyId: number, text: string
): Promise<number> {
  await pool.query("DELETE FROM document_chunks WHERE doc_id = $1", [docId]);

  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const BATCH = 20;
  let stored = 0;
  for (let b = 0; b < chunks.length; b += BATCH) {
    const batch = chunks.slice(b, b + BATCH);
    try {
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch.map(c => c.slice(0, 8000)),
      });
      for (let i = 0; i < batch.length; i++) {
        const vec = embRes.data[i].embedding;
        await pool.query(
          "INSERT INTO document_chunks (project_id, company_id, doc_id, chunk_index, content, embedding) VALUES ($1,$2,$3,$4,$5,$6::vector)",
          [projectId, companyId, docId, b + i, batch[i], JSON.stringify(vec)]
        );
        stored++;
      }
    } catch (err) {
      logger.error({ err }, "Embedding batch failed");
    }
  }
  return stored;
}

// ── Semantic Search ───────────────────────────────────────────────────────────
type ChunkResult = {
  doc_id: number; chunk_index: number; content: string;
  similarity: number; filename: string; file_type: string;
};

async function semanticSearch(projectId: number, queryText: string, limit = 8): Promise<ChunkResult[]> {
  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: queryText.slice(0, 8000),
  });
  const vec = embRes.data[0].embedding;

  const result = await pool.query<ChunkResult>(
    `SELECT dc.doc_id, dc.chunk_index, dc.content,
       1 - (dc.embedding <=> $1::vector) AS similarity,
       pd.filename, pd.file_type
     FROM document_chunks dc
     JOIN project_documents pd ON dc.doc_id = pd.id
     WHERE dc.project_id = $2
       AND 1 - (dc.embedding <=> $1::vector) > 0.15
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vec), projectId, limit]
  );
  return result.rows;
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

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /projects/:projectId/documents
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

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
});

// POST /projects/:projectId/documents
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const parsed = RegisterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.issues }); return; }

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
});

// DELETE /projects/:projectId/documents/:docId
router.delete("/:docId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await pool.query("DELETE FROM document_chunks WHERE doc_id=$1", [docId]);
  await db.delete(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  res.status(204).send();
});

// POST /projects/:projectId/documents/:docId/embed — manual re-embed
router.post("/:docId/embed", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!doc.extractedText) { res.status(400).json({ error: "Document has no extracted text yet. Analyze it first." }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId));
  const count = await embedAndStoreChunks(docId, projectId, project.companyId, doc.extractedText);
  res.json({ ok: true, chunks: count });
});

// POST /projects/:projectId/documents/:docId/extract (legacy)
router.post("/:docId/extract", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (!isImage(doc.fileType)) {
    await db.update(projectDocumentsTable)
      .set({ status: "failed", aiSummary: "Use the Analyze button for full AI analysis." })
      .where(eq(projectDocumentsTable.id, docId));
    res.json({ status: "failed", message: "Use /analyze instead" });
    return;
  }
  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId));
  await runImageAnalysis(doc, docId, projectId, project.companyId, res);
});

// POST /projects/:projectId/documents/:docId/analyze
router.post("/:docId/analyze", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const [project] = await db.select({ companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId));
  await db.update(projectDocumentsTable).set({ status: "processing" }).where(eq(projectDocumentsTable.id, docId));

  if (isImage(doc.fileType)) {
    await runImageAnalysis(doc, docId, projectId, project.companyId, res);
  } else if (isPDF(doc.fileType) || doc.filename.toLowerCase().endsWith(".pdf")) {
    await runPDFAnalysis(doc, docId, projectId, project.companyId, res);
  } else if (isWord(doc.fileType) || doc.filename.toLowerCase().endsWith(".docx") || doc.filename.toLowerCase().endsWith(".doc")) {
    await runWordAnalysis(doc, docId, projectId, project.companyId, res);
  } else {
    await runDocumentProfile(doc, docId, projectId, project.companyId, res);
  }
});

// POST /projects/:projectId/documents/search
router.post("/search", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  // Try semantic search with embeddings first
  try {
    const chunks = await semanticSearch(projectId, query.trim(), 10);
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
        ? `Found ${enriched.length} relevant document${enriched.length > 1 ? "s" : ""} using semantic search.`
        : "No closely matching documents found.";

      res.json({ results: enriched, answer, semantic: true });
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Semantic search failed, falling back to LLM search");
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
});

// POST /projects/:projectId/documents/qa — RAG-powered Q&A with multi-turn
router.post("/qa", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const { question, history = [] } = req.body;
  if (!question || typeof question !== "string" || question.trim().length < 3) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const [project] = await db.select({ name: projectsTable.name, companyId: projectsTable.companyId }).from(projectsTable).where(eq(projectsTable.id, projectId));
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

  // ── Attempt semantic RAG ───────────────────────────────────────────────────
  try {
    const chunks = await semanticSearch(projectId, question.trim(), 8);

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

      res.json({ answer, citations: [...citedDocs.values()], ragEnabled: true });
      return;
    }
  } catch (err) {
    logger.warn({ err }, "Semantic RAG failed, falling back");
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

    res.json({ answer, citations, ragEnabled: false });
  } catch (err) {
    logger.error({ err }, "Document Q&A failed");
    res.status(500).json({ error: "Q&A failed" });
  }
});

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
    }).where(eq(projectDocumentsTable.id, docId));

    // Auto-embed
    if (extractedText && extractedText.length > 50) {
      embedAndStoreChunks(docId, projectId, companyId, extractedText).catch(err =>
        logger.error({ err }, "Auto-embed after image analysis failed")
      );
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    res.json({ ...updated, chunkCount: 0 });
  } catch (err) {
    logger.error({ err }, "Image AI analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed", aiSummary: "Analysis failed." }).where(eq(projectDocumentsTable.id, docId));
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

    const rawText = await extractPDFText(fileContent);
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
    }).where(eq(projectDocumentsTable.id, docId));

    if (extractedText.length > 50) {
      embedAndStoreChunks(docId, projectId, companyId, extractedText).catch(err =>
        logger.error({ err }, "Auto-embed after PDF analysis failed")
      );
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    res.json({ ...updated, chunkCount: 0 });
  } catch (err) {
    logger.error({ err }, "PDF analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(eq(projectDocumentsTable.id, docId));
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
    }).where(eq(projectDocumentsTable.id, docId));

    if (extractedText.length > 50) {
      embedAndStoreChunks(docId, projectId, companyId, extractedText).catch(err =>
        logger.error({ err }, "Auto-embed after Word analysis failed")
      );
    }

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    res.json({ ...updated, chunkCount: 0 });
  } catch (err) {
    logger.error({ err }, "Word analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(eq(projectDocumentsTable.id, docId));
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
    }).where(eq(projectDocumentsTable.id, docId));

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    res.json({ ...updated, chunkCount: 0 });
  } catch (err) {
    logger.error({ err }, "Document profile generation failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(eq(projectDocumentsTable.id, docId));
    res.status(500).json({ error: "Analysis failed" });
  }
}

export default router;
