import type { CostCatalogItem } from "@workspace/db";
import {
  hasGlobalCostCatalogTemplates,
  insertGlobalCostCatalogTemplates,
  hasCompanyCostCatalog,
  getAllGlobalCostCatalogTemplates,
  insertCompanyCostCatalog,
  type CostCatalogItemInput,
} from "../../repositories/costCatalog";
import { getCompanyEstimatorConfig } from "../../repositories/estimator";

export interface EstimatorTierMultipliers {
  basic: number;
  standard: number;
  premium: number;
  luxury: number;
}

export interface EstimatorSettings {
  overheadPercent: number;
  contingencyPercent: number;
  tierMultipliers: EstimatorTierMultipliers;
}

export const DEFAULT_ESTIMATOR_SETTINGS: EstimatorSettings = {
  overheadPercent: 10,
  contingencyPercent: 10,
  tierMultipliers: { basic: 1.0, standard: 1.2, premium: 1.5, luxury: 2.0 },
};

const COST_CATALOG_SEED: CostCatalogItemInput[] = [
  // Framing
  { category: "Framing", itemName: "Wall Framing (2x4/2x6)", description: "Stud wall framing, materials + layout", unitType: "linft", costPrice: "8.00", unitPrice: "10.00", defaultMarkupPercent: "20", projectTypeMultiplier: null },
  { category: "Framing", itemName: "Floor Joist Installation", description: "Engineered or dimensional floor joists", unitType: "sqft", costPrice: "4.50", unitPrice: "5.75", defaultMarkupPercent: "20", projectTypeMultiplier: null },
  { category: "Framing", itemName: "Roof Truss Installation", description: "Set and brace prefabricated roof truss", unitType: "unit", costPrice: "65.00", unitPrice: "85.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Framing", itemName: "Framing Labor", description: "General framing crew labor", unitType: "hour", costPrice: "35.00", unitPrice: "55.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  // Plumbing
  { category: "Plumbing", itemName: "Rough-In Plumbing (per fixture)", description: "Supply + drain rough-in for one fixture", unitType: "unit", costPrice: "250.00", unitPrice: "350.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Plumbing", itemName: "Copper/PEX Supply Line", description: "Run and secure supply line", unitType: "linft", costPrice: "6.00", unitPrice: "9.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Plumbing", itemName: "Water Heater Installation", description: "Standard tank water heater swap", unitType: "flat", costPrice: "900.00", unitPrice: "1250.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Plumbing", itemName: "Plumber Labor", description: "Licensed plumber labor", unitType: "hour", costPrice: "55.00", unitPrice: "95.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  // Electrical
  { category: "Electrical", itemName: "Standard Outlet/Switch Install", description: "Install and terminate a device", unitType: "unit", costPrice: "35.00", unitPrice: "55.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Electrical", itemName: "Panel Upgrade (200A)", description: "Service panel upgrade with permit", unitType: "flat", costPrice: "2200.00", unitPrice: "3200.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Electrical", itemName: "Wiring Run (Romex 12/2)", description: "Run and staple branch circuit wire", unitType: "linft", costPrice: "1.20", unitPrice: "2.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Electrical", itemName: "Electrician Labor", description: "Licensed electrician labor", unitType: "hour", costPrice: "65.00", unitPrice: "100.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  // Concrete
  { category: "Concrete", itemName: "Concrete Slab Pour (4\")", description: "Formed, poured, and finished slab", unitType: "sqft", costPrice: "5.50", unitPrice: "7.50", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Concrete", itemName: "Footing/Foundation Wall", description: "Formed footing or foundation wall pour", unitType: "linft", costPrice: "45.00", unitPrice: "62.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Concrete", itemName: "Concrete Labor", description: "Form, pour, and finish crew labor", unitType: "hour", costPrice: "40.00", unitPrice: "60.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Concrete", itemName: "Sidewalk/Flatwork Finish", description: "Broom-finished exterior flatwork", unitType: "sqft", costPrice: "4.00", unitPrice: "6.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  // Finishes
  { category: "Finishes", itemName: "Baseboard/Trim Install", description: "Supply and install baseboard trim", unitType: "linft", costPrice: "3.50", unitPrice: "5.50", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Finishes", itemName: "Interior Door Install (pre-hung)", description: "Hang pre-hung interior door and hardware", unitType: "unit", costPrice: "120.00", unitPrice: "180.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Finishes", itemName: "Cabinet Installation", description: "Install stock or semi-custom cabinetry", unitType: "linft", costPrice: "45.00", unitPrice: "70.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Finishes", itemName: "Finish Carpenter Labor", description: "Trim and millwork carpenter labor", unitType: "hour", costPrice: "45.00", unitPrice: "70.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  // Drywall
  { category: "Drywall", itemName: "Drywall Hang & Finish (Level 4)", description: "Hang, tape, and finish drywall", unitType: "sqft", costPrice: "1.60", unitPrice: "2.40", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Drywall", itemName: "Drywall Repair Patch", description: "Patch and blend a localized repair", unitType: "unit", costPrice: "85.00", unitPrice: "130.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Drywall", itemName: "Texture/Skim Coat", description: "Apply texture or skim coat finish", unitType: "sqft", costPrice: "0.90", unitPrice: "1.40", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Drywall", itemName: "Drywall Labor", description: "Hanging and finishing crew labor", unitType: "hour", costPrice: "35.00", unitPrice: "55.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  // Roofing
  { category: "Roofing", itemName: "Asphalt Shingle Install (3-tab)", description: "Install 3-tab asphalt shingles", unitType: "sqft", costPrice: "3.20", unitPrice: "4.50", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Roofing", itemName: "Architectural Shingle Install", description: "Install architectural/dimensional shingles", unitType: "sqft", costPrice: "4.50", unitPrice: "6.20", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Roofing", itemName: "Roof Tear-Off & Disposal", description: "Strip existing roofing and haul away", unitType: "sqft", costPrice: "1.50", unitPrice: "2.20", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "Roofing", itemName: "Flashing/Vent Boot Replacement", description: "Replace flashing or pipe vent boot", unitType: "unit", costPrice: "45.00", unitPrice: "70.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  // Painting
  { category: "Painting", itemName: "Interior Wall Painting (2 coat)", description: "Prep and apply two coats interior paint", unitType: "sqft", costPrice: "1.10", unitPrice: "1.75", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Painting", itemName: "Exterior Painting", description: "Prep and apply exterior paint system", unitType: "sqft", costPrice: "1.60", unitPrice: "2.50", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Painting", itemName: "Cabinet Painting/Refinish", description: "Spray-finish cabinet doors and boxes", unitType: "unit", costPrice: "150.00", unitPrice: "225.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Painting", itemName: "Painter Labor", description: "Painting crew labor", unitType: "hour", costPrice: "30.00", unitPrice: "50.00", defaultMarkupPercent: "35", projectTypeMultiplier: null },
  // Tile
  { category: "Tile", itemName: "Floor Tile Installation (ceramic)", description: "Set and grout ceramic/porcelain floor tile", unitType: "sqft", costPrice: "6.50", unitPrice: "9.50", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Tile", itemName: "Wall/Backsplash Tile", description: "Set and grout wall or backsplash tile", unitType: "sqft", costPrice: "8.00", unitPrice: "12.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Tile", itemName: "Shower Tile Surround", description: "Full shower surround tile package", unitType: "flat", costPrice: "1800.00", unitPrice: "2600.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
  { category: "Tile", itemName: "Tile Setter Labor", description: "Licensed tile setter labor", unitType: "hour", costPrice: "45.00", unitPrice: "70.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  // General
  { category: "General", itemName: "General Labor", description: "Unskilled/general site labor", unitType: "hour", costPrice: "30.00", unitPrice: "45.00", defaultMarkupPercent: "25", projectTypeMultiplier: null },
  { category: "General", itemName: "Dumpster/Debris Removal", description: "Roll-off dumpster rental and haul-away", unitType: "flat", costPrice: "450.00", unitPrice: "600.00", defaultMarkupPercent: "20", projectTypeMultiplier: null },
  { category: "General", itemName: "Permit & Inspection Fees", description: "Municipal permit and inspection pass-through", unitType: "flat", costPrice: "0.00", unitPrice: "500.00", defaultMarkupPercent: "0", projectTypeMultiplier: null },
  { category: "General", itemName: "Project Management", description: "Project supervision and coordination", unitType: "hour", costPrice: "50.00", unitPrice: "90.00", defaultMarkupPercent: "30", projectTypeMultiplier: null },
];

/** Ensures global cost catalog templates exist (once ever), then clones them for
 *  this company if it doesn't have its own catalog yet — same clone-on-first-use
 *  convention as seedPricingData() for cost models/addons. */
export async function seedCostCatalog(companyId: number): Promise<void> {
  if (!(await hasGlobalCostCatalogTemplates())) {
    await insertGlobalCostCatalogTemplates(COST_CATALOG_SEED);
  }

  if (!(await hasCompanyCostCatalog(companyId))) {
    const allTemplates = await getAllGlobalCostCatalogTemplates();
    await insertCompanyCostCatalog(companyId, allTemplates);
  }
}

/** Reads the company's global multiplier/overhead/contingency settings from
 *  companies.estimator_config, falling back to sane defaults. */
export async function getEstimatorSettings(companyId: number): Promise<EstimatorSettings> {
  const config = (await getCompanyEstimatorConfig(companyId)) as Record<string, unknown> | null;
  const overheadPercent = typeof config?.overheadPercent === "number" ? config.overheadPercent : DEFAULT_ESTIMATOR_SETTINGS.overheadPercent;
  const contingencyPercent = typeof config?.contingencyPercent === "number" ? config.contingencyPercent : DEFAULT_ESTIMATOR_SETTINGS.contingencyPercent;
  const tiers = config?.tierMultipliers as Partial<EstimatorTierMultipliers> | undefined;
  return {
    overheadPercent,
    contingencyPercent,
    tierMultipliers: { ...DEFAULT_ESTIMATOR_SETTINGS.tierMultipliers, ...(tiers ?? {}) },
  };
}

/** Formats a company's live cost catalog into a prompt block for AI quote/invoice/estimate
 *  generation — the model is instructed to anchor pricing to these rows only. */
export function buildCostCatalogPromptBlock(items: CostCatalogItem[], settings: EstimatorSettings): string {
  if (items.length === 0) {
    return "";
  }
  const byCategory = new Map<string, CostCatalogItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const catalogJson = JSON.stringify(
    items.map((i) => ({
      id: i.id,
      category: i.category,
      itemName: i.itemName,
      unitType: i.unitType,
      unitPrice: i.unitPrice,
      defaultMarkupPercent: i.defaultMarkupPercent,
    })),
  );
  return `COMPANY COST CATALOG — Use ONLY the following company-verified rate database to price line items. Match each extracted task to the closest catalog item by category/itemName, use its unitPrice as the base rate, and set quantity in the catalog item's unitType (sqft, linft, hour, flat, or unit). Do not invent prices for anything covered by the catalog.
${catalogJson}
Company overhead: ${settings.overheadPercent}%, contingency: ${settings.contingencyPercent}%. Tier multipliers — basic ${settings.tierMultipliers.basic}x, standard ${settings.tierMultipliers.standard}x, premium ${settings.tierMultipliers.premium}x, luxury ${settings.tierMultipliers.luxury}x.
For any task not covered by the catalog, use realistic Canadian construction pricing and note it as a non-catalog estimate.`;
}
