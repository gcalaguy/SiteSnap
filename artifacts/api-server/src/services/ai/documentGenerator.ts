import { openai } from "@workspace/integrations-openai-ai-server";
import { db, companiesTable, estimatorCostModelsTable, type ScopeItem } from "@workspace/db";
import { eq } from "drizzle-orm";
import { listCostCatalogForCompany } from "../../repositories/costCatalog";
import { seedCostCatalog, getEstimatorSettings, buildCostCatalogPromptBlock } from "../estimator/costCatalogService";

// Canadian provincial/territorial tax rates (GST/HST/PST combined)
const PROVINCE_TAX: Record<string, number> = {
  ON: 0.13, BC: 0.12, AB: 0.05, SK: 0.11, MB: 0.12,
  QC: 0.14975, NB: 0.15, NS: 0.15, PE: 0.15, NL: 0.15,
  NT: 0.05, NU: 0.05, YT: 0.05,
};

/** Returns an AbortSignal that fires after `ms` milliseconds. */
function aiSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error(`OpenAI request timed out after ${ms}ms`)), ms).unref();
  return ctrl.signal;
}

export interface GenerateDocumentDraftInput {
  companyId: number;
  documentType: "quote" | "invoice";
  /** Raw contractor description (fast path — extraction and pricing happen in one call). */
  voiceInput?: string;
  /** Pre-extracted, user-reviewed scope items (used when pricing a scope confirmed via /ai/scope/extract). */
  scopeItems?: ScopeItem[];
  projectName?: string | null;
  clientName?: string | null;
}

/** Shared by /ai/quote/generate and /ai/invoice/generate — same pricing-anchor lookup and prompt shape,
 *  differing only in framing (estimate vs. billing) and response fields. */
export async function generateDocumentDraft(input: GenerateDocumentDraftInput): Promise<Record<string, unknown>> {
  const { companyId, documentType, voiceInput, scopeItems, projectName, clientName } = input;

  await seedCostCatalog(companyId);

  const [companyRow, costModels, catalogItems, estimatorSettings] = await Promise.all([
    db.select({ province: companiesTable.province })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1)
      .then((rows) => rows[0]),
    db.select()
      .from(estimatorCostModelsTable)
      .where(eq(estimatorCostModelsTable.companyId, companyId))
      .orderBy(estimatorCostModelsTable.projectType, estimatorCostModelsTable.finishLevel)
      // High safety cap only — real company cost-model libraries top out around 50-60 rows.
      // The old limit(20) silently dropped every project type past "concrete_flatwork"
      // alphabetically (garage, landscaping, residential_new_build, roofing, etc.) for
      // every company, so those quotes never got anchored to real rates.
      .limit(500),
    listCostCatalogForCompany(companyId),
    getEstimatorSettings(companyId),
  ]);

  const TAX_RATE = PROVINCE_TAX[companyRow?.province?.toUpperCase() ?? "ON"] ?? 0.13;

  const catalogBlock = buildCostCatalogPromptBlock(catalogItems, estimatorSettings);
  const blendedModelBlock = costModels.length > 0
    ? `COMPANY BLENDED RATE MODELS (by project type / finish level) — use only if a line item isn't covered by the cost catalog above:
${costModels.map((m) =>
  `• ${m.name} (${m.projectType}/${m.finishLevel}): labour $${m.laborCostPerSqft}/m², materials $${m.materialCostPerSqft}/m², overhead ${m.overheadPct}%, contingency ${m.contingencyPct}%`
).join("\n")}
For hourly labour line items, derive a per-hour rate from the labour $/m² using typical productivity (0.5–2 m²/hr depending on task complexity).`
    : "";

  const pricingBlock = catalogBlock || blendedModelBlock
    ? [catalogBlock, blendedModelBlock].filter(Boolean).join("\n\n") +
      "\nMultiply each extracted quantity by the appropriate reference rate to populate unitPrice, then set total = quantity × unitPrice (rounded to 2 decimals)."
    : `Use realistic Canadian construction pricing for materials and labour.`;

  const describedScope = scopeItems?.length
    ? `Confirmed scope of work (already broken into tasks — price each, do not re-extract or re-interpret the task list):
${scopeItems.map((s) => `• [${s.trade}${s.room ? ` — ${s.room}` : ""}] ${s.description} — ${s.quantity} ${s.unit}`).join("\n")}`
    : `Contractor voice description:\n"${voiceInput}"`;

  const isQuote = documentType === "quote";
  const prompt = isQuote
    ? `You are a professional construction estimator AI for Canadian construction companies.

A contractor has described a job. Extract and generate a detailed quote from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short quote title, e.g. "Foundation Concrete Work — Phase 1")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, must be a number)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope clarifications, assumptions, or exclusions)

${pricingBlock}
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

${describedScope}

Respond with ONLY the JSON object, no markdown, no explanation.`
    : `You are a professional construction billing AI for Canadian construction companies.

A contractor has described work that has been completed and needs to be invoiced. Extract and generate a detailed invoice from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short invoice title, e.g. "Foundation Concrete Work — Phase 1")
- clientName: string (client/company name if mentioned, otherwise "Client")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, must be a number)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope notes, payment terms, or work summary)

${pricingBlock}
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

${describedScope}

Respond with ONLY the JSON object, no markdown, no explanation.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  }, { signal: aiSignal(45_000) });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const fallbackNotes = voiceInput ?? scopeItems?.map((s) => s.description).join("; ") ?? "";
    return isQuote
      ? { title: "Site Quote", lineItems: [], subtotal: 0, taxAmount: 0, total: 0, notes: fallbackNotes }
      : { title: "Site Invoice", clientName: clientName ?? "Client", lineItems: [], subtotal: 0, taxAmount: 0, total: 0, notes: fallbackNotes };
  }
}
