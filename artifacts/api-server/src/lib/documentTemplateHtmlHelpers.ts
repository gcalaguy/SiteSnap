import Handlebars from "handlebars";

export interface MergeLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export const fmtUSD = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const esc = Handlebars.Utils.escapeExpression;

export function lineItemsHtml(items: MergeLineItem[]): Handlebars.SafeString {
  const rows = items
    .map(
      (i) =>
        `<tr><td>${esc(i.description)}</td><td style="text-align:right">${esc(String(i.quantity))} ${esc(i.unit)}</td><td style="text-align:right">${fmtUSD(i.unitPrice)}</td><td style="text-align:right">${fmtUSD(i.total)}</td></tr>`,
    )
    .join("");
  const html = `<table style="width:100%;border-collapse:collapse" cellpadding="6">
    <thead><tr style="border-bottom:2px solid #121212;text-align:left">
      <th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return new Handlebars.SafeString(html);
}

export function signatureBlockHtml(name: string, dateStr: string): Handlebars.SafeString {
  const html = `<div style="margin-top:32px">
    <div style="border-top:1px solid #333;width:260px;margin-bottom:4px">&nbsp;</div>
    <div>${esc(name)}</div>
    <div style="color:#666;font-size:0.9em">Signed ${esc(dateStr)}</div>
  </div>`;
  return new Handlebars.SafeString(html);
}
