import type { DocumentTemplateType } from "@workspace/db";

export interface MergeTagDef {
  tag: string;
  label: string;
  description: string;
}

const COMMON_TAGS: MergeTagDef[] = [
  { tag: "company_name", label: "Company Name", description: "Your company's name" },
  { tag: "company_address", label: "Company Address", description: "Your company's mailing address" },
  { tag: "company_phone", label: "Company Phone", description: "Your company's phone number" },
  { tag: "contractor.license_no", label: "Contractor License #", description: "Your contractor license number" },
  { tag: "project_name", label: "Project Name", description: "The name of the project" },
  { tag: "project.address", label: "Project Address", description: "The project site address" },
  { tag: "client_name", label: "Client Name", description: "The client or customer's name" },
  { tag: "date", label: "Date", description: "The date the document was generated" },
  { tag: "signature_block", label: "Signature Block", description: "Signature line(s), rendered as a formatted block" },
];

/** Catalog of available {{merge_tags}} per document type — the source of
 * truth for the "Available Dynamic Variables" cheat sheet, so the frontend
 * never hardcodes a list that can drift from what the renderer actually
 * supports. */
export const MERGE_TAG_CATALOG: Record<DocumentTemplateType, MergeTagDef[]> = {
  quote: [
    ...COMMON_TAGS,
    { tag: "quote.number", label: "Quote Number", description: "The quote's reference number" },
    { tag: "line_items", label: "Line Items", description: "Table of quoted line items (description, qty, unit price, total)" },
    { tag: "subtotal", label: "Subtotal", description: "Sum of line items before tax" },
    { tag: "tax_amount", label: "Tax Amount", description: "Calculated tax" },
    { tag: "total_price", label: "Total Price", description: "Final total, including tax" },
    { tag: "valid_until", label: "Valid Until", description: "Quote expiration date" },
    { tag: "notes", label: "Notes", description: "Additional notes or terms" },
  ],
  invoice: [
    ...COMMON_TAGS,
    { tag: "invoice.number", label: "Invoice Number", description: "The invoice's reference number" },
    { tag: "line_items", label: "Line Items", description: "Table of invoiced line items (description, qty, unit price, total)" },
    { tag: "subtotal", label: "Subtotal", description: "Sum of line items before tax" },
    { tag: "tax_amount", label: "Tax Amount", description: "Calculated tax" },
    { tag: "total_price", label: "Total Price", description: "Final total, including tax" },
    { tag: "due_date", label: "Due Date", description: "Payment due date" },
    { tag: "notes", label: "Notes", description: "Additional notes or terms" },
  ],
  rfi: [
    ...COMMON_TAGS,
    { tag: "rfi.number", label: "RFI Number", description: "The RFI's reference number" },
    { tag: "rfi.subject", label: "Subject", description: "The RFI subject/title" },
    { tag: "rfi.question", label: "Question", description: "The question being asked" },
    { tag: "rfi.response", label: "Response", description: "The response, if answered" },
    { tag: "rfi.due_date", label: "Due Date", description: "Date a response is needed by" },
  ],
  proposal: [
    ...COMMON_TAGS,
    { tag: "proposal.number", label: "Proposal Number", description: "The proposal's reference number" },
    { tag: "line_items", label: "Line Items", description: "Table of proposed scope/pricing items" },
    { tag: "total_price", label: "Total Price", description: "Proposed total price" },
    { tag: "scope_of_work", label: "Scope of Work", description: "Description of the work being proposed" },
  ],
  change_order: [
    ...COMMON_TAGS,
    { tag: "change_order.number", label: "Change Order Number", description: "The change order's reference number" },
    { tag: "change_order.reason", label: "Reason", description: "Reason for the change" },
    { tag: "line_items", label: "Line Items", description: "Table of added/changed line items" },
    { tag: "total_price", label: "Adjusted Total", description: "Net change amount" },
  ],
};
