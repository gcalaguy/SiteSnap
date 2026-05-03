import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectDocumentsTable, projectsTable } from "@workspace/db";
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

function isImage(fileType: string) {
  return IMAGE_TYPES.includes(fileType.toLowerCase());
}

// GET /projects/:projectId/documents
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const docs = await db
    .select()
    .from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId))
    .orderBy(projectDocumentsTable.createdAt);

  res.json(docs);
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

  res.status(201).json(doc);
});

// DELETE /projects/:projectId/documents/:docId
router.delete("/:docId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await db.delete(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  res.status(204).send();
});

// POST /projects/:projectId/documents/:docId/extract (legacy - kept for compatibility)
router.post("/:docId/extract", requireAuth, requireCompany, async (req, res) => {
  req.params.docId = req.params.docId;
  // Delegate to analyze
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
  const [doc] = await db.select().from(projectDocumentsTable).where(and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (!isImage(doc.fileType)) {
    await db.update(projectDocumentsTable).set({ status: "failed", aiSummary: "Use the Analyze button for full AI analysis." }).where(eq(projectDocumentsTable.id, docId));
    res.json({ status: "failed", message: "Use /analyze instead" });
    return;
  }
  // Fall through to image analysis
  await runImageAnalysis(doc, docId, res);
});

// ── POST /projects/:projectId/documents/:docId/analyze ────────────────────────
// Comprehensive AI analysis: images get full OCR + extraction, other files get profile + summary
router.post("/:docId/analyze", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const [doc] = await db.select().from(projectDocumentsTable).where(
    and(eq(projectDocumentsTable.id, docId), eq(projectDocumentsTable.projectId, projectId))
  );
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  await db.update(projectDocumentsTable).set({ status: "processing" }).where(eq(projectDocumentsTable.id, docId));

  if (isImage(doc.fileType)) {
    await runImageAnalysis(doc, docId, res);
  } else {
    await runDocumentProfile(doc, docId, res);
  }
});

// ── POST /projects/:projectId/documents/search ────────────────────────────────
// AI-powered semantic search across all project documents
router.post("/search", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const docs = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));

  if (docs.length === 0) {
    res.json({ results: [], answer: "No documents in this project yet." });
    return;
  }

  const docContext = docs.map((d, i) => {
    const extracted = d.extractedData as Record<string, unknown> | null;
    const summary = d.aiSummary ?? extracted?.summary ?? null;
    const text = d.extractedText ?? null;
    return `[Doc ${i + 1}] ID:${d.id} | File: ${d.filename} (${d.fileType})\nSummary: ${summary ?? "Not analyzed yet"}\nContent: ${text ? text.slice(0, 400) : "N/A"}`;
  }).join("\n\n---\n\n");

  const prompt = `You are a construction document assistant for a Canadian construction company.

User is searching for: "${query.trim()}"

Available project documents:
${docContext}

Return ONLY a JSON object with this structure:
{
  "results": [
    { "docId": <number>, "relevance": "high" | "medium" | "low", "reason": "<one sentence why this matches>" }
  ],
  "answer": "<2-3 sentence summary of what was found>"
}

Include ALL documents that have ANY relevance to the query, sorted by relevance (high first). Omit completely irrelevant documents.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: { results: { docId: number; relevance: string; reason: string }[]; answer: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { results: [], answer: "Could not process search results." };
    }

    // Enrich results with full doc info
    const enriched = (parsed.results ?? []).map(r => {
      const doc = docs.find(d => d.id === r.docId);
      if (!doc) return null;
      return { ...doc, relevance: r.relevance, reason: r.reason };
    }).filter(Boolean);

    res.json({ results: enriched, answer: parsed.answer ?? "" });
  } catch (err) {
    logger.error({ err }, "Document search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

// ── POST /projects/:projectId/documents/qa ────────────────────────────────────
// Document Q&A: answer questions about project documents
router.post("/qa", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const { question } = req.body;
  if (!question || typeof question !== "string" || question.trim().length < 3) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  // Get the project name for context
  const [project] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, projectId));
  const docs = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.projectId, projectId));

  if (docs.length === 0) {
    res.json({ answer: "There are no documents in this project yet. Upload receipts, invoices, or photos and analyze them first to enable document Q&A.", citations: [] });
    return;
  }

  const analyzedDocs = docs.filter(d => d.aiSummary || d.extractedText || d.extractedData);

  if (analyzedDocs.length === 0) {
    res.json({
      answer: "No documents have been analyzed yet. Click 'Analyze' on your documents first so I can read their contents and answer questions.",
      citations: []
    });
    return;
  }

  const docContext = analyzedDocs.map((d, i) => {
    const extracted = d.extractedData as Record<string, unknown> | null;
    const extractedFields = (extracted?.extractedData ?? {}) as Record<string, unknown>;
    const parts = [`[Doc ${i + 1}] "${d.filename}" (${d.fileType})`];
    if (d.aiSummary) parts.push(`Summary: ${d.aiSummary}`);
    if (d.extractedText) parts.push(`Content: ${d.extractedText.slice(0, 600)}`);
    if (extractedFields.vendor) parts.push(`Vendor: ${extractedFields.vendor}`);
    if (extractedFields.amount != null) parts.push(`Amount: ${extractedFields.currency ?? "CAD"}$${extractedFields.amount}`);
    if (extractedFields.date) parts.push(`Date: ${extractedFields.date}`);
    if (extractedFields.invoiceNumber) parts.push(`Invoice #: ${extractedFields.invoiceNumber}`);
    return parts.join("\n");
  }).join("\n\n---\n\n");

  const systemPrompt = `You are Site Snap AI, a construction document assistant for the project "${project?.name ?? "Unknown"}".
You help contractors in Canada understand their project documents — receipts, invoices, site photos, safety inspections, contracts, and more.
Answer questions based ONLY on the provided document context. Be concise and professional.
When referencing a specific document, mention it by name in quotes.
If the answer is not in the documents, say so honestly.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Project documents:\n\n${docContext}\n\n---\n\nQuestion: ${question.trim()}` },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? "I could not generate an answer.";

    // Identify which docs were cited (simple filename match)
    const citations = analyzedDocs.filter(d =>
      answer.toLowerCase().includes(d.filename.toLowerCase()) ||
      answer.includes(`"${d.filename}"`)
    ).map(d => ({ id: d.id, filename: d.filename }));

    res.json({ answer, citations });
  } catch (err) {
    logger.error({ err }, "Document Q&A failed");
    res.status(500).json({ error: "Q&A failed" });
  }
});

// ── Internal helpers ──────────────────────────────────────────────────────────

async function runImageAnalysis(doc: typeof projectDocumentsTable.$inferSelect, docId: number, res: Parameters<typeof router.post>[1] extends (path: string, ...handlers: infer H) => unknown ? H extends [...unknown[], (req: unknown, res: infer R) => unknown] ? R : never : never) {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();
    const base64 = fileContent.toString("base64");
    const mimeType = doc.fileType.includes("/") ? doc.fileType : `image/${doc.fileType}`;

    const prompt = `You are a construction document analyst for Canadian construction companies.

Analyze this image (which may be a receipt, invoice, site photo, delivery slip, or construction document) and return ONLY a JSON object with these exact fields:
- documentType: string (e.g. "Receipt", "Invoice", "Delivery Slip", "Site Photo", "Safety Inspection", "Contract", "Other")
- summary: string (2-3 sentence professional summary)
- ocrText: string (all text visible in the image, transcribed verbatim, or empty string if a photo with no text)
- extractedData: object with relevant structured fields:
  - vendor: string or null
  - amount: number or null
  - currency: "CAD" | "USD" | null
  - date: string or null (ISO format)
  - items: array of {description, quantity, unitPrice, total} or empty array
  - projectReference: string or null
  - invoiceNumber: string or null
  - notes: string or null
- confidence: "high" | "medium" | "low"

Respond with ONLY the JSON object, no markdown, no explanation.`;

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
      parsed = { documentType: "Unknown", summary: "Uploaded and stored. Could not parse extraction.", extractedData: {}, confidence: "low", ocrText: "" };
    }

    const ocrText = typeof parsed.ocrText === "string" ? parsed.ocrText : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary : null;
    // Build extractedText for search/Q&A
    const parts = [summary, ocrText].filter(Boolean);
    const extractedText = parts.join("\n\n") || null;

    await db.update(projectDocumentsTable).set({
      status: "ready",
      aiSummary: summary,
      extractedData: parsed,
      extractedText,
    }).where(eq(projectDocumentsTable.id, docId));

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    (res as any).json(updated);
  } catch (err: unknown) {
    logger.error({ err }, "Image AI analysis failed");
    await db.update(projectDocumentsTable).set({ status: "failed", aiSummary: "Analysis failed. You can still download the file." }).where(eq(projectDocumentsTable.id, docId));
    (res as any).status(500).json({ error: "Analysis failed" });
  }
}

async function runDocumentProfile(doc: typeof projectDocumentsTable.$inferSelect, docId: number, res: any) {
  try {
    const ext = doc.filename.split(".").pop()?.toUpperCase() ?? "File";
    const prompt = `You are a construction document assistant for a Canadian construction company.

A file named "${doc.filename}" (type: ${doc.fileType}) has been uploaded to a construction project management system.

Based on the filename and file type, generate a professional document profile as a JSON object:
- documentType: string (e.g. "Contract", "Blueprint", "Specification", "Schedule", "Report", "Budget", "Safety Plan", "Permit", "Correspondence", "Other")
- summary: string (2-3 sentence professional description of what this document likely contains based on its name)
- extractedData: object with any fields inferable from the filename:
  - projectReference: string or null (if visible in filename)
  - date: string or null (if date visible in filename)
  - version: string or null (if version visible in filename)
  - notes: string or null (any other observations)
- confidence: "low" (since we cannot read the content)

Respond with ONLY the JSON object, no markdown.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch {
      parsed = { documentType: ext, summary: `${ext} document uploaded and stored. Download to view contents.`, extractedData: {}, confidence: "low" };
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : `${ext} document stored. Download to view.`;

    await db.update(projectDocumentsTable).set({
      status: "ready",
      aiSummary: summary,
      extractedData: parsed,
      extractedText: summary,
    }).where(eq(projectDocumentsTable.id, docId));

    const [updated] = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, docId));
    res.json(updated);
  } catch (err: unknown) {
    logger.error({ err }, "Document profile generation failed");
    await db.update(projectDocumentsTable).set({ status: "failed" }).where(eq(projectDocumentsTable.id, docId));
    res.status(500).json({ error: "Analysis failed" });
  }
}

export default router;
