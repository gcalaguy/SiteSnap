import { Router, type IRouter } from "express";
import { createReadStream } from "fs";
import fs from "fs";
import {
  db,
  companiesTable,
  documentTemplatesTable,
  documentTemplateTypeEnum,
  type DocumentTemplateType,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError, ValidationError, NotFoundError, BadRequestError } from "../lib/errors";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { scanFile } from "../lib/virusScan";
import { ObjectStorageService } from "../lib/objectStorage";
import { detectMergeTags, fileTypeFromMime } from "../lib/documentTemplateStorage";
import { getActiveTemplate, renderDocumentWithTemplate } from "../lib/documentTemplateService";
import { buildSampleMergeData, buildDefaultPreviewPdf } from "../lib/documentTemplateSampleData";
import { MERGE_TAG_CATALOG } from "../lib/documentTemplateMergeTags";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024; // 10MB, per spec
const ALLOWED_TEMPLATE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/html",
]);
const DOCUMENT_TYPES = documentTemplateTypeEnum.enumValues;

function assertValidDocumentType(value: unknown): asserts value is DocumentTemplateType {
  if (typeof value !== "string" || !(DOCUMENT_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid documentType. Must be one of: ${DOCUMENT_TYPES.join(", ")}`);
  }
}

/**
 * GET /templates — one entry per document type this feature covers, each
 * either the tenant's active custom template or null (meaning: falls back to
 * the default branded PDF theme).
 */
router.get(
  "/templates",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(documentTemplatesTable)
      .where(eq(documentTemplatesTable.companyId, req.companyId!));
    const byType = new Map(rows.map((r) => [r.documentType, r]));

    const templates = DOCUMENT_TYPES.map((documentType) => {
      const row = byType.get(documentType);
      return {
        documentType,
        hasCustomTemplate: !!row,
        template: row
          ? {
              id: row.id,
              originalFilename: row.originalFilename,
              fileType: row.fileType,
              mimeType: row.mimeType,
              fileSizeBytes: row.fileSizeBytes,
              detectedMergeTags: row.detectedMergeTags,
              updatedAt: row.updatedAt,
            }
          : null,
      };
    });

    res.json({ templates });
  }),
);

/** GET /templates/merge-tags — the "Available Dynamic Variables" cheat sheet source of truth. */
router.get(
  "/templates/merge-tags",
  requireAuth,
  requireCompany,
  asyncHandler(async (_req, res) => {
    res.json({ catalog: MERGE_TAG_CATALOG });
  }),
);

/**
 * POST /templates/upload — multipart, field "file" plus a "documentType" text
 * field. Parses {{merge_tags}} out of the file and saves it as the tenant's
 * active template for that document type (replacing any existing one).
 */
router.post(
  "/templates/upload",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  diskUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new BadRequestError("No file uploaded");
    }

    try {
      assertValidDocumentType(req.body.documentType);
    } catch (err) {
      await cleanupUpload(req.file.path);
      throw err;
    }
    const documentType = req.body.documentType as DocumentTemplateType;

    const mimeType = req.file.mimetype || "";
    const fileType = fileTypeFromMime(mimeType);
    if (!fileType || !ALLOWED_TEMPLATE_MIME_TYPES.has(mimeType)) {
      await cleanupUpload(req.file.path);
      throw new ValidationError("Only .docx, .html, or .pdf files are accepted for document templates", { mimeType });
    }
    if (req.file.size > TEMPLATE_MAX_BYTES) {
      await cleanupUpload(req.file.path);
      throw new ValidationError("File exceeds the 10MB template size limit");
    }

    const scan = await scanFile(req.file.path, mimeType);
    if (!scan.clean) {
      await cleanupUpload(req.file.path);
      throw new ValidationError("File failed virus scan");
    }

    try {
      const buffer = await fs.promises.readFile(req.file.path);
      const detectedMergeTags = await detectMergeTags(buffer, fileType);

      const objectPath = await objectStorageService.uploadStream(createReadStream(req.file.path), mimeType);
      await objectStorageService.trySetCompanyReadAcl(objectPath, String(req.userId!), String(req.companyId!));

      const existing = await getActiveTemplate(req.companyId!, documentType);

      const [saved] = await db
        .insert(documentTemplatesTable)
        .values({
          companyId: req.companyId!,
          documentType,
          fileType,
          originalFilename: req.file.originalname,
          objectPath,
          mimeType,
          fileSizeBytes: req.file.size,
          detectedMergeTags,
          uploadedByUserId: req.userId!,
        })
        .onConflictDoUpdate({
          target: [documentTemplatesTable.companyId, documentTemplatesTable.documentType],
          set: {
            fileType,
            originalFilename: req.file.originalname,
            objectPath,
            mimeType,
            fileSizeBytes: req.file.size,
            detectedMergeTags,
            uploadedByUserId: req.userId!,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (existing && existing.objectPath !== objectPath) {
        objectStorageService.deleteObjectByPath(existing.objectPath).catch((err) => {
          req.log?.warn({ err, objectPath: existing.objectPath }, "Failed to delete replaced document template file");
        });
      }

      res.status(200).json({ template: saved });
    } finally {
      await cleanupUpload(req.file?.path);
    }
  }),
);

/**
 * POST /templates/preview — body { documentType }. Renders either the active
 * custom template or (if none) the default branded theme, both populated
 * with dummy sample data, and returns the PDF binary for inline preview.
 */
router.post(
  "/templates/preview",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    assertValidDocumentType(req.body?.documentType);
    const documentType = req.body.documentType as DocumentTemplateType;

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, req.companyId!)).limit(1);
    if (!company) throw new NotFoundError("Company not found");

    const mergeData = buildSampleMergeData(documentType, company.name);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderDocumentWithTemplate({
        companyId: req.companyId!,
        documentType,
        mergeData,
        defaultFallback: () => buildDefaultPreviewPdf(documentType, company.name),
      });
    } catch (err) {
      req.log?.error({ err, documentType }, "Document template preview render failed");
      throw new AppError(502, "Failed to render template preview", "TEMPLATE_RENDER_FAILED");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="template-preview.pdf"');
    res.send(pdfBuffer);
  }),
);

/** DELETE /templates/:documentType — "Reset to System Default": removes the
 * tenant's custom template (and its stored file) so generation falls back to
 * the default branded PDF theme. */
router.delete(
  "/templates/:documentType",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    assertValidDocumentType(req.params.documentType);
    const documentType = req.params.documentType as DocumentTemplateType;

    const [deleted] = await db
      .delete(documentTemplatesTable)
      .where(and(eq(documentTemplatesTable.companyId, req.companyId!), eq(documentTemplatesTable.documentType, documentType)))
      .returning();

    if (!deleted) {
      throw new NotFoundError("No custom template found for this document type");
    }

    objectStorageService.deleteObjectByPath(deleted.objectPath).catch((err) => {
      req.log?.warn({ err, objectPath: deleted.objectPath }, "Failed to delete document template file during reset");
    });

    res.json({ ok: true, documentType });
  }),
);

export default router;
