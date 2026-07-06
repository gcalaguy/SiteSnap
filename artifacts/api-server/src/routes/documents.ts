import { Router } from "express";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requirePermission } from "../lib/permissionGate.js";
import { canAccessProject } from "../lib/projectAccess.js";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { z } from "zod";
import { RegisterDocumentBody } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage.js";

import {
  getProjectCompanyId,
  getProjectCompanyAndName,
  listDocumentsForProject,
  getChunkCountsByDoc,
  insertDocument,
  getDocument,
  deleteDocument,
  updateDocument,
  deleteChunksByDocProjectCompany,
} from "../repositories/documents";
import { storeChunks } from "../services/documents/chunkingService";
import { searchDocuments } from "../services/documents/searchService";
import { answerQuestion } from "../services/documents/qaService";
import {
  runImageAnalysis,
  runPDFAnalysis,
  runWordAnalysis,
  runDocumentProfile,
  reindexDocument,
  pushDocumentToCosts,
  isImage,
  isPDF,
  isWord,
} from "../services/documents/analysisService";

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

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /projects/:projectId/documents
router.get("/", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewDocuments"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const docs = await listDocumentsForProject(projectId);

  // Attach chunk counts for RAG status
  const chunkMap = await getChunkCountsByDoc(projectId);
  const docsWithRag = docs.map(d => ({ ...d, chunkCount: chunkMap[d.id] ?? 0 }));

  res.json(docsWithRag);
}));

// POST /projects/:projectId/documents
router.post("/", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = RegisterDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues }); return; }

  try {
    await objectStorageService.trySetCompanyReadAcl(
      parsed.data.objectPath,
      String(req.userId!),
      String(req.companyId!),
    );
  } catch (err) {
    req.log.warn({ err }, "Rejected document with invalid or already-owned object path");
    res.status(400).json({ error: "Invalid file reference" });
    return;
  }

  const doc = await insertDocument({
    projectId,
    uploadedByUserId: req.userId!,
    filename: parsed.data.filename,
    fileType: parsed.data.fileType,
    objectPath: parsed.data.objectPath,
    fileSize: parsed.data.fileSize ?? null,
    status: "pending",
  });

  res.status(201).json({ ...doc, chunkCount: 0 });
}));

// DELETE /projects/:projectId/documents/:docId
router.delete("/:docId", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  await deleteChunksByDocProjectCompany(docId, projectId, req.companyId!);
  await deleteDocument(docId, projectId);
  res.status(204).send();
}));

// POST /projects/:projectId/documents/:docId/embed — manual re-chunk (kept for back-compat)
router.post("/:docId/embed", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const doc = await getDocument(docId, projectId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (!doc.extractedText) { res.status(400).json({ error: "Document has no extracted text yet. Analyze it first." }); return; }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  const count = await storeChunks(docId, projectId, projectCompanyId, doc.extractedText);
  res.json({ ok: true, chunks: count });
}));

// POST /projects/:projectId/documents/:docId/extract (legacy)
router.post("/:docId/extract", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const doc = await getDocument(docId, projectId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  if (!isImage(doc.fileType)) {
    await updateDocument(docId, projectId, { status: "failed", aiSummary: "Use the Analyze button for full AI analysis." });
    res.json({ status: "failed", message: "Use /analyze instead" });
    return;
  }
  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  const result = await runImageAnalysis(doc, docId, projectId, projectCompanyId);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ ...result.document, chunkCount: result.chunkCount });
}));

// POST /projects/:projectId/documents/:docId/analyze
router.post("/:docId/analyze", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const doc = await getDocument(docId, projectId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }
  await updateDocument(docId, projectId, { status: "processing" });

  let result;
  if (isImage(doc.fileType)) {
    result = await runImageAnalysis(doc, docId, projectId, projectCompanyId);
  } else if (isPDF(doc.fileType) || doc.filename.toLowerCase().endsWith(".pdf")) {
    result = await runPDFAnalysis(doc, docId, projectId, projectCompanyId);
  } else if (isWord(doc.fileType) || doc.filename.toLowerCase().endsWith(".docx") || doc.filename.toLowerCase().endsWith(".doc")) {
    result = await runWordAnalysis(doc, docId, projectId, projectCompanyId);
  } else {
    result = await runDocumentProfile(doc, docId, projectId, projectCompanyId);
  }

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ ...result.document, chunkCount: result.chunkCount });
}));

// POST /projects/:projectId/documents/search
router.post("/search", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  // P0: verify the project belongs to the requester's company before exposing document content
  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const parsedSearch = SearchDocumentsBody.safeParse(req.body);
  if (!parsedSearch.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsedSearch.error.issues });
    return;
  }
  const { query } = parsedSearch.data;

  const result = await searchDocuments(projectId, projectCompanyId, query);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.body);
}));

// POST /projects/:projectId/documents/qa — RAG-powered Q&A with multi-turn
router.post("/qa", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const parsedQA = QADocumentsBody.safeParse(req.body);
  if (!parsedQA.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsedQA.error.issues });
    return;
  }
  const { question, history = [] } = parsedQA.data;

  // P0: verify the project belongs to the requester's company before exposing AI context
  const project = await getProjectCompanyAndName(projectId);
  if (!project || project.companyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const result = await answerQuestion(projectId, project.companyId, project.name, question, history);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.body);
}));

// POST /projects/:projectId/documents/:docId/reindex — re-run OCR + chunk for full-text search
router.post("/:docId/reindex", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const doc = await getDocument(docId, projectId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (doc.status !== "ready") {
    res.status(400).json({ error: "Document must be fully analyzed before re-indexing." }); return;
  }

  const projectCompanyId = await getProjectCompanyId(projectId);
  if (projectCompanyId === null || projectCompanyId !== req.companyId) { res.status(404).json({ error: "Project not found" }); return; }

  const result = await reindexDocument(doc, docId, projectId, projectCompanyId);
  res.json(result);
}));

// POST /projects/:projectId/documents/:docId/push-to-costs
router.post("/:docId/push-to-costs", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const docId = parseInt(req.params.docId as string);
  if (isNaN(projectId) || isNaN(docId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const { category } = req.body as { category?: string };

  const doc = await getDocument(docId, projectId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const result = await pushDocumentToCosts(doc, projectId, category);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.status(201).json(result.entry);
}));

export default router;
