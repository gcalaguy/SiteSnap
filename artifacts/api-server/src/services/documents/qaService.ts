import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../lib/logger.js";
import {
  listDocumentsForProject,
  getChunkCountForProject,
  getChunkedDocIds,
} from "../../repositories/documents";
import { hybridSearch } from "./searchService";

export type QaResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function answerQuestion(
  projectId: number,
  companyId: number,
  projectName: string | null,
  question: string,
  history: { role: string; text: string }[],
): Promise<QaResult> {
  const docs = await listDocumentsForProject(projectId);

  if (docs.length === 0) {
    return {
      ok: true,
      body: {
        answer: "No documents have been uploaded to this project yet. Upload and analyze your documents first to enable AI Q&A.",
        citations: [],
        ragEnabled: false,
      },
    };
  }

  const systemPrompt = `You are Site Snap AI, a construction document assistant for the project "${projectName ?? "this project"}".
You help Canadian contractors understand their project documents — contracts, blueprints, specifications, invoices, change orders, RFIs, safety plans, permits, and correspondence.
Answer questions based ONLY on the provided document sections. When citing a document, mention it by name in quotes.
Be concise, professional, and construction-industry aware. Use CAD for currency unless stated otherwise.
If the answer is not in the provided material, say so honestly. Do not guess or hallucinate.`;

  // ── Attempt hybrid RAG (vector + full-text) ───────────────────────────────
  let usedSemanticRag = false;
  try {
    const { results: chunks, semantic } = await hybridSearch(projectId, companyId, question.trim(), 8);
    usedSemanticRag = semantic;

    if (chunks.length > 0) {
      const context = chunks.map((c, i) =>
        `[${i + 1}] From "${c.filename}":\n${c.content}`
      ).join("\n\n---\n\n");

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: `${systemPrompt}\n\n## Relevant document sections:\n\n${context}` },
        ...(history.slice(-8).map(h => ({
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
      return { ok: true, body: { answer, citations: [...citedDocs.values()], ragEnabled: usedSemanticRag } };
    }
  } catch (err) {
    logger.warn({ err }, "Full-text RAG failed, falling back to summaries");
  }

  // ── Fallback: extractedText stuffing ──────────────────────────────────────
  const analyzedDocs = docs.filter(d => d.aiSummary || d.extractedText || d.extractedData);
  if (analyzedDocs.length === 0) {
    return {
      ok: true,
      body: {
        answer: "No documents have been analyzed yet. Click 'Analyze' on your documents so I can read their contents.",
        citations: [],
        ragEnabled: false,
      },
    };
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
      ...(history.slice(-6).map(h => ({
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
    const hasChunks = (await getChunkCountForProject(projectId)) > 0;

    // Find analyzed docs that have zero chunks (need re-index)
    const analyzedDocIds = docs.filter(d => d.status === "ready" && (d.aiSummary || d.extractedText)).map(d => d.id);
    let hasAnalyzedDocsWithNoChunks = false;
    if (analyzedDocIds.length > 0) {
      const chunkedDocIds = await getChunkedDocIds(projectId, analyzedDocIds);
      hasAnalyzedDocsWithNoChunks = analyzedDocIds.some(id => !chunkedDocIds.has(id));
    }

    return { ok: true, body: { answer, citations, ragEnabled: false, hasChunks, hasAnalyzedDocsWithNoChunks } };
  } catch (err) {
    logger.error({ err }, "Document Q&A failed");
    return { ok: false, status: 500, error: "Q&A failed" };
  }
}
