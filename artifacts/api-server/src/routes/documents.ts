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
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

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
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  const parsed = RegisterDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const userId = (req as any).dbUser?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [doc] = await db
    .insert(projectDocumentsTable)
    .values({
      projectId,
      uploadedByUserId: userId,
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
  if (isNaN(projectId) || isNaN(docId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  await db
    .delete(projectDocumentsTable)
    .where(
      and(
        eq(projectDocumentsTable.id, docId),
        eq(projectDocumentsTable.projectId, projectId),
      ),
    );

  res.status(204).send();
});

// POST /projects/:projectId/documents/:docId/extract
router.post("/:docId/extract", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const docId = parseInt(req.params.docId);
  if (isNaN(projectId) || isNaN(docId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const [doc] = await db
    .select()
    .from(projectDocumentsTable)
    .where(
      and(
        eq(projectDocumentsTable.id, docId),
        eq(projectDocumentsTable.projectId, projectId),
      ),
    );

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!isImage(doc.fileType)) {
    await db
      .update(projectDocumentsTable)
      .set({ status: "failed", aiSummary: "AI extraction is only supported for image files (JPEG, PNG, WebP, GIF). PDF and other document types can be downloaded and reviewed manually." })
      .where(eq(projectDocumentsTable.id, docId));

    res.json({ status: "failed", message: "AI extraction only supported for images" });
    return;
  }

  await db
    .update(projectDocumentsTable)
    .set({ status: "processing" })
    .where(eq(projectDocumentsTable.id, docId));

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
    const [fileContent] = await objectFile.download();
    const base64 = fileContent.toString("base64");
    const mimeType = doc.fileType.includes("/") ? doc.fileType : `image/${doc.fileType}`;

    const prompt = `You are a construction document analyst for Canadian construction companies.

Analyze this image (which may be a receipt, invoice, site photo, delivery slip, or construction document) and return ONLY a JSON object with these exact fields:
- documentType: string (e.g. "Receipt", "Invoice", "Delivery Slip", "Site Photo", "Safety Inspection", "Contract", "Other")
- summary: string (2-3 sentence professional summary of what this document contains)
- extractedData: object with any relevant structured fields found, e.g.:
  - vendor: string or null
  - amount: number or null (total dollar amount if present)
  - currency: "CAD" | "USD" | null
  - date: string or null (ISO format if possible)
  - items: array of {description, quantity, unitPrice, total} or empty array
  - projectReference: string or null
  - invoiceNumber: string or null
  - notes: string or null (any other important details)
- confidence: "high" | "medium" | "low"

Respond with ONLY the JSON object, no markdown, no explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed_result: Record<string, unknown>;
    try {
      parsed_result = JSON.parse(content);
    } catch {
      parsed_result = {
        documentType: "Unknown",
        summary: "Document uploaded and stored. Automatic extraction could not parse the content.",
        extractedData: {},
        confidence: "low",
      };
    }

    await db
      .update(projectDocumentsTable)
      .set({
        status: "ready",
        aiSummary: typeof parsed_result.summary === "string" ? parsed_result.summary : null,
        extractedData: parsed_result,
      })
      .where(eq(projectDocumentsTable.id, docId));

    const [updated] = await db
      .select()
      .from(projectDocumentsTable)
      .where(eq(projectDocumentsTable.id, docId));

    res.json(updated);
  } catch (err: unknown) {
    logger.error({ err }, "Document AI extraction failed");
    await db
      .update(projectDocumentsTable)
      .set({ status: "failed", aiSummary: "Extraction failed. You can still download the file." })
      .where(eq(projectDocumentsTable.id, docId));
    res.status(500).json({ error: "Extraction failed" });
  }
});

export default router;
