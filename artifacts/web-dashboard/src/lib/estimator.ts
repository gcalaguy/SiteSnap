export type LineItem = {
  id: string;
  description: string;
  category: "labour" | "materials" | "addon" | "overhead";
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  editable: boolean;
};

export type EstimateSummary = {
  laborTotal: number;
  materialsTotal: number;
  addonsTotal: number;
  overhead: number;
  overheadPct: number;
  subtotal: number;
  contingency: number;
  contingencyPct: number;
  totalLow: number;
  totalHigh: number;
  suggestedMarginPct: number;
  suggestedMarginAmount: number;
  priceToClient: number;
};

export function fmtCurrency(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export type EstimateTotals = {
  subtotal: number;
  contingency: number;
  margin: number;
  priceToClient: number;
};

export function computeEstimateTotals(lineItems: LineItem[], contingencyPct: number, marginPct: number): EstimateTotals {
  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const contingency = Math.round(subtotal * (contingencyPct / 100));
  const margin = Math.round((subtotal + contingency) * (marginPct / 100));
  return { subtotal, contingency, margin, priceToClient: subtotal + contingency + margin };
}
