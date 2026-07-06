import type { EstimatorCostModel, EstimatorAddon } from "@workspace/db";

// ── Pricing Engine — Structured Params → Line Items ──────────────────────────

export function runPricingEngine(
  params: { project_type: string; square_feet: number; finish_level: string; addons: string[]; margin_pct?: number },
  costModel: EstimatorCostModel,
  selectedAddons: EstimatorAddon[],
) {
  const sqft = params.square_feet;
  const laborPerSqft = parseFloat(costModel.laborCostPerSqft);
  const materialPerSqft = parseFloat(costModel.materialCostPerSqft);
  const overheadPct = parseFloat(costModel.overheadPct) / 100;
  const contingencyPct = parseFloat(costModel.contingencyPct) / 100;

  const laborBase = Math.round(laborPerSqft * sqft);
  const materialsBase = Math.round(materialPerSqft * sqft);

  const addonLineItems = selectedAddons.map((a) => {
    const unitCost = parseFloat(a.amount);
    const qty = a.costType === "per_sqft" ? sqft : 1;
    const total = Math.round(unitCost * qty);
    return {
      id: a.addonKey,
      description: a.name,
      category: "addon" as const,
      quantity: qty,
      unit: a.costType === "per_sqft" ? "sqft" : "flat",
      unitCost,
      total,
      editable: true,
    };
  });

  const addonTotal = addonLineItems.reduce((s, a) => s + a.total, 0);
  const subtotalBeforeOverhead = laborBase + materialsBase + addonTotal;
  const overhead = Math.round(subtotalBeforeOverhead * overheadPct);
  const subtotal = subtotalBeforeOverhead + overhead;
  const contingency = Math.round(subtotal * contingencyPct);

  const marginPct = params.margin_pct ?? 15;
  const marginAmount = Math.round(subtotal * (marginPct / 100));

  return {
    lineItems: [
      {
        id: "labour",
        description: `Labour — ${costModel.name}`,
        category: "labour" as const,
        quantity: sqft,
        unit: "sqft",
        unitCost: laborPerSqft,
        total: laborBase,
        editable: true,
      },
      {
        id: "materials",
        description: `Materials — ${costModel.name}`,
        category: "materials" as const,
        quantity: sqft,
        unit: "sqft",
        unitCost: materialPerSqft,
        total: materialsBase,
        editable: true,
      },
      ...addonLineItems,
      {
        id: "overhead",
        description: `Overhead & Project Management (${costModel.overheadPct}%)`,
        category: "overhead" as const,
        quantity: 1,
        unit: "flat",
        unitCost: overhead,
        total: overhead,
        editable: true,
      },
    ],
    summary: {
      laborTotal: laborBase,
      materialsTotal: materialsBase,
      addonsTotal: addonTotal,
      overhead,
      overheadPct: parseFloat(costModel.overheadPct),
      subtotal,
      contingency,
      contingencyPct: parseFloat(costModel.contingencyPct),
      totalLow: subtotal,
      totalHigh: subtotal + contingency,
      suggestedMarginPct: marginPct,
      suggestedMarginAmount: marginAmount,
      priceToClient: subtotal + contingency + marginAmount,
    },
    costModelUsed: {
      id: costModel.id,
      name: costModel.name,
      projectType: costModel.projectType,
      finishLevel: costModel.finishLevel,
      notes: costModel.notes,
    },
    params: {
      projectType: params.project_type,
      squareFeet: sqft,
      finishLevel: params.finish_level,
      addons: params.addons,
    },
  };
}
