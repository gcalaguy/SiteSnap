import { fmtUSD, lineItemsHtml, signatureBlockHtml, type MergeLineItem } from "./documentTemplateHtmlHelpers";

interface CompanyInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function baseMergeData(company: CompanyInfo, opts: { clientName?: string | null; projectName?: string | null; projectAddress?: string | null }) {
  const today = fmtDate(new Date());
  return {
    company_name: company.name,
    company_address: company.address ?? "",
    company_phone: company.phone ?? "",
    contractor: { license_no: "" },
    project_name: opts.projectName ?? "",
    project: { address: opts.projectAddress ?? "" },
    client_name: opts.clientName ?? "",
    date: today,
    signature_block: signatureBlockHtml(opts.clientName ?? "", today),
  };
}

export function buildQuoteMergeData(
  quote: {
    quoteNumber: string;
    clientName: string;
    lineItems: unknown;
    subtotal: string | number;
    taxAmount: string | number;
    total: string | number;
    validUntil?: string | null;
    notes?: string | null;
  },
  company: CompanyInfo,
): Record<string, unknown> {
  return {
    ...baseMergeData(company, { clientName: quote.clientName }),
    quote: { number: quote.quoteNumber },
    line_items: lineItemsHtml((quote.lineItems as MergeLineItem[]) ?? []),
    subtotal: fmtUSD(Number(quote.subtotal)),
    tax_amount: fmtUSD(Number(quote.taxAmount)),
    total_price: fmtUSD(Number(quote.total)),
    valid_until: fmtDate(quote.validUntil),
    notes: quote.notes ?? "",
  };
}

export function buildInvoiceMergeData(
  invoice: {
    invoiceNumber: string;
    clientName: string;
    lineItems: unknown;
    subtotal: string | number;
    taxAmount: string | number;
    total: string | number;
    dueDate?: string | null;
    notes?: string | null;
  },
  company: CompanyInfo,
): Record<string, unknown> {
  return {
    ...baseMergeData(company, { clientName: invoice.clientName }),
    invoice: { number: invoice.invoiceNumber },
    line_items: lineItemsHtml((invoice.lineItems as MergeLineItem[]) ?? []),
    subtotal: fmtUSD(Number(invoice.subtotal)),
    tax_amount: fmtUSD(Number(invoice.taxAmount)),
    total_price: fmtUSD(Number(invoice.total)),
    due_date: fmtDate(invoice.dueDate),
    notes: invoice.notes ?? "",
  };
}

export function buildRfiMergeData(
  rfi: {
    rfiNumber: string;
    subject: string;
    description: string;
    response?: string | null;
    dueDate?: string | null;
  },
  company: CompanyInfo,
  project: { name?: string | null; address?: string | null } | null,
): Record<string, unknown> {
  return {
    ...baseMergeData(company, { projectName: project?.name, projectAddress: project?.address }),
    rfi: {
      number: rfi.rfiNumber,
      subject: rfi.subject,
      question: rfi.description,
      response: rfi.response ?? "Awaiting response.",
      due_date: fmtDate(rfi.dueDate),
    },
  };
}

export function buildProposalMergeData(
  proposal: { id: number; clientName?: string | null; notes?: string | null },
  estimate: { title: string; items: { name: string; description?: string | null; quantity: string | number; unitCost: string | number; margin: string | number }[] },
  company: CompanyInfo,
): Record<string, unknown> {
  const lineItems: MergeLineItem[] = estimate.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost);
    const margin = Number(item.margin);
    const unitPrice = unitCost * (1 + margin / 100);
    return {
      description: item.description ? `${item.name} — ${item.description}` : item.name,
      quantity,
      unit: "unit",
      unitPrice,
      total: unitPrice * quantity,
    };
  });
  const total = lineItems.reduce((sum, i) => sum + i.total, 0);

  return {
    ...baseMergeData(company, { clientName: proposal.clientName, projectName: estimate.title }),
    proposal: { number: `P-${proposal.id}` },
    line_items: lineItemsHtml(lineItems),
    total_price: fmtUSD(total),
    scope_of_work: proposal.notes ?? "",
  };
}

export function buildChangeOrderMergeData(
  changeOrder: { id: number; title: string; description?: string | null; amount: string | number; notes?: string | null },
  company: CompanyInfo,
  project: { name?: string | null; address?: string | null } | null,
): Record<string, unknown> {
  return {
    ...baseMergeData(company, { projectName: project?.name, projectAddress: project?.address }),
    change_order: { number: `CO-${changeOrder.id}`, reason: changeOrder.description ?? changeOrder.title },
    line_items: lineItemsHtml([
      {
        description: changeOrder.title,
        quantity: 1,
        unit: "lot",
        unitPrice: Number(changeOrder.amount),
        total: Number(changeOrder.amount),
      },
    ]),
    total_price: fmtUSD(Number(changeOrder.amount)),
  };
}
