import { extractPDFText, extractWordText } from "../services/documents/extractionService.js";
import type { DocumentTemplateFileType } from "@workspace/db";

const MERGE_TAG_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractMergeTags(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MERGE_TAG_PATTERN.exec(text)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found).sort();
}

/**
 * Detects {{merge_tags}} present in an uploaded template file. Authoritative
 * for docx/html (these are the types the renderer can actually populate);
 * informational only for pdf uploads, since arbitrary PDF layouts cannot be
 * re-populated with new data — see documentTemplateRenderer.ts.
 */
export async function detectMergeTags(buffer: Buffer, fileType: DocumentTemplateFileType): Promise<string[]> {
  if (fileType === "html") {
    return extractMergeTags(buffer.toString("utf-8"));
  }
  if (fileType === "docx") {
    const text = await extractWordText(buffer);
    return extractMergeTags(text);
  }
  const text = await extractPDFText(buffer);
  return extractMergeTags(text);
}

export function fileTypeFromMime(mimeType: string): DocumentTemplateFileType | null {
  if (mimeType === "text/html") return "html";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return null;
}
