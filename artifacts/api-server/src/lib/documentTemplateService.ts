import { db, documentTemplatesTable, type DocumentTemplateType, type DocumentTemplate } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { docxBufferToHtml, compileAndRenderTemplate } from "./documentTemplateRenderer";
import { logger } from "./logger.js";

const objectStorageService = new ObjectStorageService();

export async function getActiveTemplate(
  companyId: number,
  documentType: DocumentTemplateType,
): Promise<DocumentTemplate | null> {
  const [row] = await db
    .select()
    .from(documentTemplatesTable)
    .where(and(eq(documentTemplatesTable.companyId, companyId), eq(documentTemplatesTable.documentType, documentType)))
    .limit(1);
  return row ?? null;
}

async function downloadTemplateBuffer(objectPath: string): Promise<Buffer> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Resolves and renders a document (quote, invoice, RFI, proposal, change
 * order) to PDF for a tenant: if an active custom .docx/.html template
 * exists, populate it with `mergeData` and rasterize to PDF; otherwise (no
 * template, or the stored template is a raw .pdf that can't be
 * merge-populated) fall back to `defaultFallback`, the caller's existing
 * pdfkit-based "branded default" builder.
 */
export async function renderDocumentWithTemplate({
  companyId,
  documentType,
  mergeData,
  defaultFallback,
}: {
  companyId: number;
  documentType: DocumentTemplateType;
  mergeData: Record<string, unknown>;
  defaultFallback: () => Promise<Buffer>;
}): Promise<Buffer> {
  const template = await getActiveTemplate(companyId, documentType);
  if (!template || template.fileType === "pdf") {
    return defaultFallback();
  }

  try {
    const buffer = await downloadTemplateBuffer(template.objectPath);
    const html = template.fileType === "docx" ? await docxBufferToHtml(buffer) : buffer.toString("utf-8");
    return await compileAndRenderTemplate(html, mergeData);
  } catch (err) {
    logger.error(
      { err, companyId, documentType, templateId: template.id },
      "Custom template render failed — falling back to default PDF theme",
    );
    return defaultFallback();
  }
}
