import type { DocumentTemplateType } from "@workspace/db";
import { buildQuotePdfBuffer } from "./quotePdf";
import { buildInvoicePdfBuffer } from "./invoicePdf";
import { buildGenericDocumentPdfBuffer } from "./documentTemplateDefaultPdf";
import { fmtUSD, lineItemsHtml, signatureBlockHtml } from "./documentTemplateHtmlHelpers";

const SAMPLE_LINE_ITEMS = [
  { description: "Labor — framing crew (3 days)", quantity: 3, unit: "day", unitPrice: 850, total: 2550 },
  { description: "Materials — lumber & fasteners", quantity: 1, unit: "lot", unitPrice: 1180.5, total: 1180.5 },
  { description: "Dumpster rental", quantity: 1, unit: "week", unitPrice: 420, total: 420 },
];

/**
 * Builds a plausible fake merge-data object for a document type, used by the
 * "Preview with Sample Data" action so a tenant can see how their uploaded
 * template renders before it's ever used on a real document.
 */
export function buildSampleMergeData(documentType: DocumentTemplateType, companyName: string): Record<string, unknown> {
  const today = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const subtotal = SAMPLE_LINE_ITEMS.reduce((sum, i) => sum + i.total, 0);
  const taxAmount = subtotal * 0.08;
  const total = subtotal + taxAmount;

  const base = {
    company_name: companyName,
    company_address: "123 Main Street, Springfield, ST 00000",
    company_phone: "(555) 010-1234",
    contractor: { license_no: "LIC-000000" },
    project_name: "Sample Project — 45 Riverside Ave",
    project: { address: "45 Riverside Ave, Springfield, ST 00000" },
    client_name: "Jordan Client",
    date: today,
    signature_block: signatureBlockHtml("Jordan Client", today),
  };

  switch (documentType) {
    case "quote":
      return {
        ...base,
        quote: { number: "Q-1024" },
        line_items: lineItemsHtml(SAMPLE_LINE_ITEMS),
        subtotal: fmtUSD(subtotal),
        tax_amount: fmtUSD(taxAmount),
        total_price: fmtUSD(total),
        valid_until: today,
        notes: "This is a sample preview generated with placeholder data.",
      };
    case "invoice":
      return {
        ...base,
        invoice: { number: "INV-2048" },
        line_items: lineItemsHtml(SAMPLE_LINE_ITEMS),
        subtotal: fmtUSD(subtotal),
        tax_amount: fmtUSD(taxAmount),
        total_price: fmtUSD(total),
        due_date: today,
        notes: "This is a sample preview generated with placeholder data.",
      };
    case "rfi":
      return {
        ...base,
        rfi: {
          number: "RFI-012",
          subject: "Clarification on window header detail",
          question: "Please confirm the header size for the south-facing window openings on Level 2.",
          response: "Awaiting response.",
          due_date: today,
        },
      };
    case "proposal":
      return {
        ...base,
        proposal: { number: "P-305" },
        line_items: lineItemsHtml(SAMPLE_LINE_ITEMS),
        total_price: fmtUSD(total),
        scope_of_work: "Demolition of existing deck, construction of new 200 sq ft composite deck with railing.",
      };
    case "change_order":
      return {
        ...base,
        change_order: { number: "CO-007", reason: "Owner-requested upgrade to fixtures" },
        line_items: lineItemsHtml(SAMPLE_LINE_ITEMS),
        total_price: fmtUSD(total),
      };
  }
}

/**
 * Renders the "branded default" PDF (the same theme used when no custom
 * template is uploaded) with sample data, for the Preview action when a
 * tenant has no active custom template for a given document type — lets
 * them compare the default against a custom template before uploading one.
 */
export async function buildDefaultPreviewPdf(documentType: DocumentTemplateType, companyName: string): Promise<Buffer> {
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" }).format(new Date());
  const subtotal = SAMPLE_LINE_ITEMS.reduce((sum, i) => sum + i.total, 0);
  const taxAmount = subtotal * 0.08;

  switch (documentType) {
    case "quote":
      return buildQuotePdfBuffer({
        quoteNumber: "Q-1024",
        title: "Sample Quote",
        clientName: "Jordan Client",
        status: "draft",
        lineItems: SAMPLE_LINE_ITEMS,
        subtotal,
        taxRate: 8,
        taxAmount,
        total: subtotal + taxAmount,
        notes: "This is a sample preview generated with placeholder data.",
        createdAt: today,
        companyName,
      });
    case "invoice":
      return buildInvoicePdfBuffer({
        invoiceNumber: "INV-2048",
        title: "Sample Invoice",
        clientName: "Jordan Client",
        status: "draft",
        lineItems: SAMPLE_LINE_ITEMS,
        subtotal,
        taxRate: 8,
        taxAmount,
        total: subtotal + taxAmount,
        notes: "This is a sample preview generated with placeholder data.",
        createdAt: today,
        companyName,
      });
    case "rfi":
      return buildGenericDocumentPdfBuffer({
        title: "Request for Information",
        documentNumber: "RFI-012",
        companyName,
        clientName: "Jordan Client",
        projectName: "Sample Project — 45 Riverside Ave",
        createdAt: today,
        fields: [
          { label: "Subject", value: "Clarification on window header detail" },
          { label: "Question", value: "Please confirm the header size for the south-facing window openings on Level 2." },
          { label: "Due Date", value: today },
        ],
      });
    case "proposal":
      return buildGenericDocumentPdfBuffer({
        title: "Proposal",
        documentNumber: "P-305",
        companyName,
        clientName: "Jordan Client",
        projectName: "Sample Project — 45 Riverside Ave",
        createdAt: today,
        fields: [
          { label: "Scope of Work", value: "Demolition of existing deck, construction of new 200 sq ft composite deck with railing." },
          { label: "Total Price", value: fmtUSD(subtotal + taxAmount) },
        ],
      });
    case "change_order":
      return buildGenericDocumentPdfBuffer({
        title: "Change Order",
        documentNumber: "CO-007",
        companyName,
        clientName: "Jordan Client",
        projectName: "Sample Project — 45 Riverside Ave",
        createdAt: today,
        fields: [
          { label: "Reason", value: "Owner-requested upgrade to fixtures" },
          { label: "Adjusted Total", value: fmtUSD(subtotal + taxAmount) },
        ],
      });
  }
}
