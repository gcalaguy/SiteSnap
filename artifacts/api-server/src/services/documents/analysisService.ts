import { extractJson, extractText } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../../lib/objectStorage.js";
import { logger } from "../../lib/logger.js";
import { convertPDFPagesToImages } from "../../lib/pdfOcr.js";
import { convertHeicToJpeg, isHeic } from "../../lib/imageConvert.js";
import {
  getDocument,
  updateDocument,
  insertCostAnalysis,
  type ProjectDocument,
} from "../../repositories/documents";
import { storeChunks } from "./chunkingService";
import { extractPDFText, extractWordText } from "./extractionService";

const objectStorageService = new ObjectStorageService();

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const PDF_TYPES = ["application/pdf"];
const WORD_TYPES = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

export function isImage(ft: string) { return IMAGE_TYPES.includes(ft.toLowerCase()); }
export function isPDF(ft: string) { return PDF_TYPES.includes(ft.toLowerCase()) || ft.toLowerCase().endsWith("pdf"); }
export function isWord(ft: string) { return WORD_TYPES.includes(ft.toLowerCase()) || ft.toLowerCase().endsWith("docx") || ft.toLowerCase().endsWith("doc"); }

export const MIN_EXTRACTED_CHARS = 80;   // threshold to trigger OCR
const OCR_MAX_PAGES = 10;
const OCR_DPI = 250;

export type AnalysisResult =
  | { ok: true; document: ProjectDocument; chunkCount: number }
  | { ok: false; status: number; error: string };

export async function runImageAnalysis(
  doc: ProjectDocument,
  docId: number, projectId: number, companyId: number,
): Promise<AnalysisResult> {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    let [fileContent] = await objectFile.download();
    let mimeType = doc.fileType.includes("/") ? doc.fileType : `image/${doc.fileType}`;
    if (isHeic(mimeType)) {
      fileContent = await convertHeicToJpeg(fileContent);
      mimeType = "image/jpeg";
    }
    const base64 = fileContent.toString("base64");

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

    const parsed = await extractJson<Record<string, unknown>>({
      prompt,
      images: [{ mimeType, base64 }],
      maxTokens: 8192,
      fallback: { documentType: "Unknown", summary: "Uploaded and stored.", extractedData: {}, confidence: "low", ocrText: "" },
    });

    const ocrText = typeof parsed.ocrText === "string" ? parsed.ocrText : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary : null;
    const extractedText = [summary, ocrText].filter(Boolean).join("\n\n") || null;

    await updateDocument(docId, projectId, {
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    });

    // Store chunks for full-text search (synchronous so chunkCount is accurate)
    let chunkCount = 0;
    if (extractedText && extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const updated = await getDocument(docId, projectId);
    return { ok: true, document: updated!, chunkCount };
  } catch (err) {
    logger.error({ err }, "Image AI analysis failed");
    await updateDocument(docId, projectId, { status: "failed", aiSummary: "Analysis failed." });
    return { ok: false, status: 500, error: "Analysis failed" };
  }
}

export async function runPDFAnalysis(
  doc: ProjectDocument,
  docId: number, projectId: number, companyId: number,
): Promise<AnalysisResult> {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();

    let rawText = await extractPDFText(fileContent);

    // ── OCR Fallback for image-only PDFs ──────────────────────────────
    if (rawText.trim().length < MIN_EXTRACTED_CHARS) {
      logger.info({ docId, filename: doc.filename, extractedChars: rawText.trim().length }, "PDF text too short; triggering OCR fallback");
      await updateDocument(docId, projectId, { status: "processing_ocr" as any });

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

        const visionParsed = await extractJson<Record<string, unknown>>({
          prompt: ocrPrompt,
          images,
          maxTokens: 8192,
          fallback: { documentType: "PDF", summary: "Scanned PDF document uploaded.", extractedData: {}, confidence: "low", ocrText: "" },
        });

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

          const classifyParsed = await extractJson<Record<string, unknown>>({
            prompt: classifyPrompt,
            maxTokens: 2048,
            fallback: { documentType: "PDF", summary: "PDF document uploaded.", extractedData: {}, confidence: "low" },
          });

          const summary = typeof classifyParsed.summary === "string" ? classifyParsed.summary : (typeof visionParsed.summary === "string" ? visionParsed.summary : "PDF document stored.");
          await updateDocument(docId, projectId, {
            status: "ready", aiSummary: summary, extractedData: classifyParsed, extractedText: rawText,
          });

          let chunkCount = 0;
          if (rawText.length > 50) {
            chunkCount = await storeChunks(docId, projectId, companyId, rawText);
          }

          const updated = await getDocument(docId, projectId);
          return { ok: true, document: updated!, chunkCount };
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

    const parsed = await extractJson<Record<string, unknown>>({
      prompt,
      maxTokens: 2048,
      fallback: { documentType: "PDF", summary: "PDF document uploaded.", extractedData: {}, confidence: "low" },
    });

    const summary = typeof parsed.summary === "string" ? parsed.summary : "PDF document stored.";
    const extractedText = rawText.trim() || summary;

    await updateDocument(docId, projectId, {
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    });

    let chunkCount = 0;
    if (extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const updated = await getDocument(docId, projectId);
    return { ok: true, document: updated!, chunkCount };
  } catch (err) {
    logger.error({ err }, "PDF analysis failed");
    await updateDocument(docId, projectId, { status: "failed" });
    return { ok: false, status: 500, error: "Analysis failed" };
  }
}

export async function runWordAnalysis(
  doc: ProjectDocument,
  docId: number, projectId: number, companyId: number,
): Promise<AnalysisResult> {
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

    const parsed = await extractJson<Record<string, unknown>>({
      prompt,
      maxTokens: 2048,
      fallback: { documentType: "Word Document", summary: "Document uploaded.", extractedData: {}, confidence: "low" },
    });

    const summary = typeof parsed.summary === "string" ? parsed.summary : "Word document stored.";
    const extractedText = rawText.trim() || summary;

    await updateDocument(docId, projectId, {
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText,
    });

    let chunkCount = 0;
    if (extractedText.length > 50) {
      chunkCount = await storeChunks(docId, projectId, companyId, extractedText);
    }

    const updated = await getDocument(docId, projectId);
    return { ok: true, document: updated!, chunkCount };
  } catch (err) {
    logger.error({ err }, "Word analysis failed");
    await updateDocument(docId, projectId, { status: "failed" });
    return { ok: false, status: 500, error: "Analysis failed" };
  }
}

export async function runDocumentProfile(
  doc: ProjectDocument,
  docId: number, projectId: number, _companyId: number,
): Promise<AnalysisResult> {
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

    const parsed = await extractJson<Record<string, unknown>>({
      prompt,
      model: "gpt-5-mini",
      maxTokens: 1024,
      fallback: { documentType: ext, summary: `${ext} document uploaded.`, extractedData: {}, confidence: "low" },
    });

    const summary = typeof parsed.summary === "string" ? parsed.summary : `${ext} document stored.`;

    await updateDocument(docId, projectId, {
      status: "ready", aiSummary: summary, extractedData: parsed, extractedText: summary,
    });

    const updated = await getDocument(docId, projectId);
    return { ok: true, document: updated!, chunkCount: 0 };
  } catch (err) {
    logger.error({ err }, "Document profile generation failed");
    await updateDocument(docId, projectId, { status: "failed" });
    return { ok: false, status: 500, error: "Analysis failed" };
  }
}

// ── Reindex ────────────────────────────────────────────────────────────────────

export async function reindexDocument(
  doc: ProjectDocument,
  docId: number, projectId: number, companyId: number,
): Promise<{ chunkCount: number; message?: string }> {
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
          rawText = await extractText({ prompt: ocrPrompt, images, maxTokens: 8192 });
        }
      }

      if (rawText.trim().length > 50) {
        textToChunk = rawText;
        await updateDocument(docId, projectId, { extractedText: rawText });
      }
    } catch (err) {
      logger.error({ err, docId }, "Reindex OCR failed");
    }
  }

  if (textToChunk.trim().length < 50) {
    return { chunkCount: 0, message: "Not enough text to index. Try re-analyzing the document first." };
  }

  const chunkCount = await storeChunks(docId, projectId, companyId, textToChunk);
  return { chunkCount };
}

// ── Push to Costs ──────────────────────────────────────────────────────────────

const VALID_COST_CATEGORIES = ["materials", "labour", "equipment", "other"] as const;
type CostCategory = typeof VALID_COST_CATEGORIES[number];

export type PushToCostsResult =
  | { ok: true; entry: unknown }
  | { ok: false; status: number; error: string };

export async function pushDocumentToCosts(
  doc: ProjectDocument,
  projectId: number,
  category: string | undefined,
): Promise<PushToCostsResult> {
  const cat: CostCategory = (VALID_COST_CATEGORIES.includes(category as CostCategory) ? category : "other") as CostCategory;

  if (doc.status !== "ready" || !doc.extractedData) {
    return { ok: false, status: 400, error: "Document must be analyzed before pushing to costs." };
  }

  const data = doc.extractedData as Record<string, unknown>;
  const fields = (data.extractedData ?? {}) as Record<string, unknown>;
  const rawAmount = typeof fields.amount === "number" ? fields.amount : 0;
  if (rawAmount <= 0) {
    return { ok: false, status: 400, error: "No financial amount found in this document." };
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
  const costs: Record<CostCategory, string> = {
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

  const entry = await insertCostAnalysis({
    projectId,
    periodLabel,
    labourCost: costs.labour,
    materialsCost: costs.materials,
    equipmentCost: costs.equipment,
    otherCost: costs.other,
    totalCost: total,
    notes,
    aiAnalysis: summary || null,
  });

  return { ok: true, entry };
}
