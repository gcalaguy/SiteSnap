import type { CommunicationAttachmentType, EmailAiEntities } from "@workspace/db";

/**
 * Categorizes email attachments (Phase 4). Deliberately no per-attachment LLM
 * call — classification is either a filename/content-type heuristic (cheap,
 * deterministic, runs synchronously during sync) or, once the parent message
 * has been through AI extraction, a free reuse of its already-extracted
 * aiEntities to bias a still-generic category toward something more specific
 * (invoice/quote/permit/inspection_report). See emailIntelligenceService.ts's
 * reclassifyAttachmentsForMessage() for the second step.
 */

const CAD_KEYWORDS = ["dwg", "dxf", "cad"];
const BLUEPRINT_KEYWORDS = ["blueprint", "plan", "elevation", "floorplan"];

export interface ClassificationResult {
  category: CommunicationAttachmentType;
  categorySource: "heuristic" | "ai_entity_bias";
}

export function classifyAttachment(input: {
  filename: string;
  contentType: string | null;
}): ClassificationResult {
  const filename = input.filename.toLowerCase();
  const contentType = (input.contentType ?? "").toLowerCase();

  if (contentType === "application/pdf" || filename.endsWith(".pdf")) {
    return { category: "pdf", categorySource: "heuristic" };
  }
  if (
    contentType === "application/msword" ||
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".doc") ||
    filename.endsWith(".docx")
  ) {
    return { category: "word", categorySource: "heuristic" };
  }
  if (
    contentType === "application/vnd.ms-excel" ||
    contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filename.endsWith(".xls") ||
    filename.endsWith(".xlsx")
  ) {
    return { category: "excel", categorySource: "heuristic" };
  }
  if (contentType.startsWith("image/")) {
    return { category: "image", categorySource: "heuristic" };
  }
  if (CAD_KEYWORDS.some((k) => filename.includes(k) || contentType.includes(k))) {
    return { category: "cad", categorySource: "heuristic" };
  }
  if (BLUEPRINT_KEYWORDS.some((k) => filename.includes(k))) {
    return { category: "blueprint", categorySource: "heuristic" };
  }
  return { category: "other", categorySource: "heuristic" };
}

// Only these starting categories are generic enough to be worth upgrading —
// e.g. never override "image" (a photo attached to an invoice email is still
// a photo, not the invoice document itself).
const UPGRADABLE_CATEGORIES: ReadonlySet<CommunicationAttachmentType> = new Set(["pdf", "other"]);

/**
 * Biases a still-generic attachment category using the parent message's
 * aiEntities (already extracted for search/matching — no new LLM call here).
 * Returns null when there's nothing to upgrade to, so callers can skip the
 * write entirely.
 */
export function reclassifyFromEntities(input: {
  currentCategory: CommunicationAttachmentType | null;
  entities: EmailAiEntities;
}): ClassificationResult | null {
  if (input.currentCategory != null && !UPGRADABLE_CATEGORIES.has(input.currentCategory)) return null;

  const { entities } = input;
  if (entities.permitNumbers.length > 0) {
    return { category: "permit", categorySource: "ai_entity_bias" };
  }
  if (entities.invoiceNumbers.length > 0) {
    return { category: "invoice", categorySource: "ai_entity_bias" };
  }
  if (entities.quoteNumbers.length > 0) {
    return { category: "quote", categorySource: "ai_entity_bias" };
  }
  if (entities.inspectionMentioned) {
    return { category: "inspection_report", categorySource: "ai_entity_bias" };
  }
  return null;
}
