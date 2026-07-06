import { countQuotesForCompany } from "../../repositories/estimator";

export async function getNextQuoteNumber(companyId: number): Promise<string> {
  const count = await countQuotesForCompany(companyId);
  const num = count + 1;
  return `QUO-${String(num).padStart(4, "0")}`;
}

export function calcQuoteTotals(items: { quantity: number; unitPrice: number }[], taxRate = 0.13) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}
