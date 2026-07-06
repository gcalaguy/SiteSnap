import type { EstimatorCostModel, EstimatorAddon } from "@workspace/db";
import {
  hasGlobalCostModelTemplates,
  insertGlobalCostModelTemplates,
  hasGlobalAddonTemplates,
  insertGlobalAddonTemplates,
  hasCompanyCostModels,
  getAllGlobalCostModelTemplates,
  insertCompanyCostModels,
  hasCompanyAddons,
  getAllGlobalAddonTemplates,
  insertCompanyAddons,
  getCompanyEstimatorConfig,
} from "../../repositories/estimator";

export const DEFAULT_PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_new_build:  "Residential New Build",
  commercial_new_build:   "Commercial New Build",
  renovation_residential: "Residential Renovation",
  renovation_commercial:  "Commercial Renovation",
  addition:               "Home Addition",
  garage:                 "Garage",
  deck_patio:             "Deck / Patio",
  basement_finish:        "Basement Finish",
  roofing:                "Roofing",
  concrete_flatwork:      "Concrete Flatwork",
  framing_only:           "Framing Only",
  landscaping:            "Landscaping",
};

const COST_MODEL_SEED: Omit<EstimatorCostModel, "id" | "createdAt" | "updatedAt" | "companyId" | "sourceType" | "sourceId">[] = [
  // Residential New Build
  { projectType: "residential_new_build", finishLevel: "basic",    name: "Residential New Build — Basic",    baseCostPerSqft: "185", laborCostPerSqft: "75",  materialCostPerSqft: "85",  overheadPct: "10", contingencyPct: "10", notes: "Builder-grade finishes, standard fixtures, vinyl flooring" },
  { projectType: "residential_new_build", finishLevel: "standard", name: "Residential New Build — Standard", baseCostPerSqft: "225", laborCostPerSqft: "90",  materialCostPerSqft: "110", overheadPct: "10", contingencyPct: "10", notes: "Mid-range finishes, laminate/hardwood mix, quality fixtures" },
  { projectType: "residential_new_build", finishLevel: "premium",  name: "Residential New Build — Premium",  baseCostPerSqft: "285", laborCostPerSqft: "115", materialCostPerSqft: "145", overheadPct: "10", contingencyPct: "12", notes: "High-end finishes, hardwood throughout, premium fixtures" },
  { projectType: "residential_new_build", finishLevel: "luxury",   name: "Residential New Build — Luxury",   baseCostPerSqft: "400", laborCostPerSqft: "160", materialCostPerSqft: "210", overheadPct: "12", contingencyPct: "15", notes: "Custom millwork, stone counters, imported tile, smart home" },
  // Commercial New Build
  { projectType: "commercial_new_build", finishLevel: "basic",    name: "Commercial New Build — Basic",    baseCostPerSqft: "250", laborCostPerSqft: "100", materialCostPerSqft: "125", overheadPct: "12", contingencyPct: "12", notes: "Warehouse/industrial grade, concrete floors, basic HVAC" },
  { projectType: "commercial_new_build", finishLevel: "standard", name: "Commercial New Build — Standard", baseCostPerSqft: "325", laborCostPerSqft: "130", materialCostPerSqft: "165", overheadPct: "12", contingencyPct: "12", notes: "Office-grade, drop ceiling, carpet/VCT tile, standard HVAC" },
  { projectType: "commercial_new_build", finishLevel: "premium",  name: "Commercial New Build — Premium",  baseCostPerSqft: "420", laborCostPerSqft: "170", materialCostPerSqft: "210", overheadPct: "12", contingencyPct: "12", notes: "Class A office, hardwood/polished concrete, premium HVAC" },
  { projectType: "commercial_new_build", finishLevel: "luxury",   name: "Commercial New Build — Luxury",   baseCostPerSqft: "600", laborCostPerSqft: "240", materialCostPerSqft: "300", overheadPct: "15", contingencyPct: "15", notes: "Boutique/flagship retail, full custom interior, high-end MEP" },
  // Residential Renovation
  { projectType: "renovation_residential", finishLevel: "basic",    name: "Residential Renovation — Basic",    baseCostPerSqft: "95",  laborCostPerSqft: "40",  materialCostPerSqft: "45",  overheadPct: "10", contingencyPct: "15", notes: "Paint, carpet, basic fixtures. Existing structure maintained" },
  { projectType: "renovation_residential", finishLevel: "standard", name: "Residential Renovation — Standard", baseCostPerSqft: "145", laborCostPerSqft: "60",  materialCostPerSqft: "70",  overheadPct: "10", contingencyPct: "15", notes: "Kitchen/bath refresh, laminate floors, mid-grade finishes" },
  { projectType: "renovation_residential", finishLevel: "premium",  name: "Residential Renovation — Premium",  baseCostPerSqft: "200", laborCostPerSqft: "85",  materialCostPerSqft: "100", overheadPct: "10", contingencyPct: "15", notes: "Full gut reno, hardwood, custom cabinetry, premium tile" },
  { projectType: "renovation_residential", finishLevel: "luxury",   name: "Residential Renovation — Luxury",   baseCostPerSqft: "300", laborCostPerSqft: "125", materialCostPerSqft: "150", overheadPct: "12", contingencyPct: "15", notes: "High-end gut reno, custom millwork, stone, imported materials" },
  // Commercial Renovation
  { projectType: "renovation_commercial", finishLevel: "basic",    name: "Commercial Renovation — Basic",    baseCostPerSqft: "150", laborCostPerSqft: "65",  materialCostPerSqft: "70",  overheadPct: "12", contingencyPct: "15", notes: "Paint, flooring, ceiling tiles. Minimal demo" },
  { projectType: "renovation_commercial", finishLevel: "standard", name: "Commercial Renovation — Standard", baseCostPerSqft: "200", laborCostPerSqft: "85",  materialCostPerSqft: "95",  overheadPct: "12", contingencyPct: "15", notes: "Open-plan office refit, drop ceiling, mid-grade finishes" },
  { projectType: "renovation_commercial", finishLevel: "premium",  name: "Commercial Renovation — Premium",  baseCostPerSqft: "280", laborCostPerSqft: "115", materialCostPerSqft: "140", overheadPct: "12", contingencyPct: "15", notes: "Full commercial gut-reno, glass partition, premium finishes" },
  { projectType: "renovation_commercial", finishLevel: "luxury",   name: "Commercial Renovation — Luxury",   baseCostPerSqft: "400", laborCostPerSqft: "165", materialCostPerSqft: "200", overheadPct: "15", contingencyPct: "15", notes: "High-end retail/hospitality renovation, bespoke interiors" },
  // Addition
  { projectType: "addition", finishLevel: "basic",    name: "Home Addition — Basic",    baseCostPerSqft: "175", laborCostPerSqft: "72",  materialCostPerSqft: "82",  overheadPct: "10", contingencyPct: "12", notes: "Basic room addition, matches existing exterior" },
  { projectType: "addition", finishLevel: "standard", name: "Home Addition — Standard", baseCostPerSqft: "220", laborCostPerSqft: "90",  materialCostPerSqft: "108", overheadPct: "10", contingencyPct: "12", notes: "Quality addition, insulated, mid-grade finishes throughout" },
  { projectType: "addition", finishLevel: "premium",  name: "Home Addition — Premium",  baseCostPerSqft: "285", laborCostPerSqft: "118", materialCostPerSqft: "142", overheadPct: "10", contingencyPct: "12", notes: "Premium addition, custom windows, hardwood, quality mechanicals" },
  { projectType: "addition", finishLevel: "luxury",   name: "Home Addition — Luxury",   baseCostPerSqft: "390", laborCostPerSqft: "158", materialCostPerSqft: "205", overheadPct: "12", contingencyPct: "15", notes: "Luxury addition, structural changes, premium everything" },
  // Garage
  { projectType: "garage", finishLevel: "basic",    name: "Garage — Basic",    baseCostPerSqft: "70",  laborCostPerSqft: "28",  materialCostPerSqft: "35",  overheadPct: "10", contingencyPct: "10", notes: "Unheated single/double garage, concrete floor, steel door" },
  { projectType: "garage", finishLevel: "standard", name: "Garage — Standard", baseCostPerSqft: "90",  laborCostPerSqft: "36",  materialCostPerSqft: "45",  overheadPct: "10", contingencyPct: "10", notes: "Insulated, electrical, garage door opener, drywall interior" },
  { projectType: "garage", finishLevel: "premium",  name: "Garage — Premium",  baseCostPerSqft: "120", laborCostPerSqft: "50",  materialCostPerSqft: "60",  overheadPct: "10", contingencyPct: "10", notes: "Heated, epoxy floor, cabinets, pot lights, premium doors" },
  { projectType: "garage", finishLevel: "luxury",   name: "Garage — Luxury",   baseCostPerSqft: "180", laborCostPerSqft: "75",  materialCostPerSqft: "90",  overheadPct: "10", contingencyPct: "10", notes: "Car lift ready, finished walls, custom storage, showroom grade" },
  // Deck & Patio
  { projectType: "deck_patio", finishLevel: "basic",    name: "Deck / Patio — Basic",    baseCostPerSqft: "45", laborCostPerSqft: "20",  materialCostPerSqft: "22",  overheadPct: "10", contingencyPct: "10", notes: "Pressure-treated wood deck, standard railing, basic footings" },
  { projectType: "deck_patio", finishLevel: "standard", name: "Deck / Patio — Standard", baseCostPerSqft: "65", laborCostPerSqft: "28",  materialCostPerSqft: "32",  overheadPct: "10", contingencyPct: "10", notes: "Cedar or composite deck, cable/glass railing, built-in stairs" },
  { projectType: "deck_patio", finishLevel: "premium",  name: "Deck / Patio — Premium",  baseCostPerSqft: "95", laborCostPerSqft: "40",  materialCostPerSqft: "48",  overheadPct: "10", contingencyPct: "10", notes: "Composite/hardwood, glass railing, built-in lighting, pergola" },
  { projectType: "deck_patio", finishLevel: "luxury",   name: "Deck / Patio — Luxury",   baseCostPerSqft: "150",laborCostPerSqft: "62",  materialCostPerSqft: "78",  overheadPct: "10", contingencyPct: "10", notes: "Ipe/Cumaru hardwood, custom pergola, outdoor kitchen rough-in" },
  // Basement Finish
  { projectType: "basement_finish", finishLevel: "basic",    name: "Basement Finish — Basic",    baseCostPerSqft: "55",  laborCostPerSqft: "22",  materialCostPerSqft: "28",  overheadPct: "10", contingencyPct: "12", notes: "Framing, insulation, drywall, basic flooring, one bathroom" },
  { projectType: "basement_finish", finishLevel: "standard", name: "Basement Finish — Standard", baseCostPerSqft: "80",  laborCostPerSqft: "34",  materialCostPerSqft: "40",  overheadPct: "10", contingencyPct: "12", notes: "Rec room, bedroom, full bath, bar rough-in, LVP flooring" },
  { projectType: "basement_finish", finishLevel: "premium",  name: "Basement Finish — Premium",  baseCostPerSqft: "115", laborCostPerSqft: "48",  materialCostPerSqft: "58",  overheadPct: "10", contingencyPct: "12", notes: "Full suite, wet bar, home theatre, heated floors, quality finishes" },
  { projectType: "basement_finish", finishLevel: "luxury",   name: "Basement Finish — Luxury",   baseCostPerSqft: "175", laborCostPerSqft: "72",  materialCostPerSqft: "88",  overheadPct: "12", contingencyPct: "15", notes: "Legal suite, wine cellar, gym, full kitchen, premium everything" },
  // Roofing (per sqft of roof area)
  { projectType: "roofing", finishLevel: "basic",    name: "Roofing — Basic (3-tab)",      baseCostPerSqft: "8",  laborCostPerSqft: "4",   materialCostPerSqft: "3",   overheadPct: "10", contingencyPct: "10", notes: "3-tab asphalt shingles, standard underlayment, ice & water shield at eaves" },
  { projectType: "roofing", finishLevel: "standard", name: "Roofing — Standard (30yr)",    baseCostPerSqft: "12", laborCostPerSqft: "5",   materialCostPerSqft: "6",   overheadPct: "10", contingencyPct: "10", notes: "30-yr architectural shingles, full ice & water shield, ridge vent" },
  { projectType: "roofing", finishLevel: "premium",  name: "Roofing — Premium (50yr)",     baseCostPerSqft: "18", laborCostPerSqft: "7",   materialCostPerSqft: "9",   overheadPct: "10", contingencyPct: "10", notes: "50-yr premium shingles or standing-seam metal, full membrane" },
  { projectType: "roofing", finishLevel: "luxury",   name: "Roofing — Luxury (Metal/Slate)",baseCostPerSqft: "35", laborCostPerSqft: "14",  materialCostPerSqft: "18",  overheadPct: "10", contingencyPct: "10", notes: "Standing-seam steel or natural slate, custom flashing, copper details" },
  // Concrete Flatwork
  { projectType: "concrete_flatwork", finishLevel: "basic",    name: "Concrete Flatwork — Basic",    baseCostPerSqft: "12", laborCostPerSqft: "5",  materialCostPerSqft: "6",  overheadPct: "10", contingencyPct: "10", notes: "Plain grey 4\" slab, broom finish, control joints, basic rebar" },
  { projectType: "concrete_flatwork", finishLevel: "standard", name: "Concrete Flatwork — Standard", baseCostPerSqft: "16", laborCostPerSqft: "7",  materialCostPerSqft: "8",  overheadPct: "10", contingencyPct: "10", notes: "5\" reinforced slab, broom/exposed aggregate, thickened edges" },
  { projectType: "concrete_flatwork", finishLevel: "premium",  name: "Concrete Flatwork — Premium",  baseCostPerSqft: "22", laborCostPerSqft: "10", materialCostPerSqft: "11", overheadPct: "10", contingencyPct: "10", notes: "Exposed aggregate, stamped concrete, integrated colouring, sealer" },
  { projectType: "concrete_flatwork", finishLevel: "luxury",   name: "Concrete Flatwork — Luxury",   baseCostPerSqft: "40", laborCostPerSqft: "18", materialCostPerSqft: "20", overheadPct: "10", contingencyPct: "10", notes: "Polished concrete, custom inlays, radiant heat, premium sealer" },
  // Framing Only
  { projectType: "framing_only", finishLevel: "basic",    name: "Framing — Basic",    baseCostPerSqft: "35", laborCostPerSqft: "20",  materialCostPerSqft: "14",  overheadPct: "10", contingencyPct: "10", notes: "Standard 2x6 wood frame, simple plan, no engineered components" },
  { projectType: "framing_only", finishLevel: "standard", name: "Framing — Standard", baseCostPerSqft: "45", laborCostPerSqft: "25",  materialCostPerSqft: "18",  overheadPct: "10", contingencyPct: "10", notes: "2x6 or engineered lumber, standard truss roof, insulated headers" },
  { projectType: "framing_only", finishLevel: "premium",  name: "Framing — Premium",  baseCostPerSqft: "60", laborCostPerSqft: "34",  materialCostPerSqft: "24",  overheadPct: "10", contingencyPct: "12", notes: "Engineered lumber throughout, complex roofline, steel beams" },
  { projectType: "framing_only", finishLevel: "luxury",   name: "Framing — Luxury",   baseCostPerSqft: "85", laborCostPerSqft: "48",  materialCostPerSqft: "34",  overheadPct: "10", contingencyPct: "12", notes: "Complex structure, ICF/SIP panels, post & beam elements, heavy timber" },
  // Landscaping
  { projectType: "landscaping", finishLevel: "basic",    name: "Landscaping — Basic",    baseCostPerSqft: "15", laborCostPerSqft: "8",  materialCostPerSqft: "7",  overheadPct: "10", contingencyPct: "10", notes: "Grading, topsoil, sod, basic plantings, no hardscape" },
  { projectType: "landscaping", finishLevel: "standard", name: "Landscaping — Standard", baseCostPerSqft: "25", laborCostPerSqft: "12", materialCostPerSqft: "12", overheadPct: "10", contingencyPct: "10", notes: "Sod + plantings, paving stone path, basic irrigation zone" },
  { projectType: "landscaping", finishLevel: "premium",  name: "Landscaping — Premium",  baseCostPerSqft: "45", laborCostPerSqft: "20", materialCostPerSqft: "23", overheadPct: "10", contingencyPct: "10", notes: "Full hardscape, interlock patio, garden beds, full irrigation, lighting" },
  { projectType: "landscaping", finishLevel: "luxury",   name: "Landscaping — Luxury",   baseCostPerSqft: "85", laborCostPerSqft: "38", materialCostPerSqft: "42", overheadPct: "10", contingencyPct: "12", notes: "Custom stone, water feature, pergola, outdoor kitchen, landscape lighting" },
];

const ADDON_SEED: Omit<EstimatorAddon, "id" | "createdAt" | "companyId">[] = [
  { name: "HVAC System",               addonKey: "hvac_system",              description: "Full heating/cooling system supply & install",        costType: "flat",     amount: "15000", applicableTypes: null },
  { name: "Plumbing Rough-In",          addonKey: "plumbing_rough",           description: "Rough-in plumbing for bathroom or kitchen",           costType: "flat",     amount: "12000", applicableTypes: null },
  { name: "Electrical Panel Upgrade",   addonKey: "electrical_panel",         description: "200A panel upgrade + ESA permit",                     costType: "flat",     amount: "3500",  applicableTypes: null },
  { name: "Spray Foam Insulation",      addonKey: "insulation_spray_foam",    description: "Closed-cell spray foam upgrade (per sqft)",           costType: "per_sqft", amount: "4.50",  applicableTypes: null },
  { name: "Permit & Inspection Fees",   addonKey: "permit_fees",              description: "Building permit, inspections, approvals",             costType: "flat",     amount: "2500",  applicableTypes: null },
  { name: "Engineered Drawings (PE)",   addonKey: "engineered_drawings",      description: "Structural engineer drawings + stamp",                costType: "flat",     amount: "4500",  applicableTypes: null },
  { name: "Site Prep & Excavation",     addonKey: "site_prep_excavation",     description: "Excavation, grading, backfill",                       costType: "flat",     amount: "8000",  applicableTypes: null },
  { name: "Foundation Waterproofing",   addonKey: "foundation_waterproofing", description: "Exterior weeping tile, membrane, drain rock",         costType: "flat",     amount: "6500",  applicableTypes: null },
  { name: "Hardwood Flooring Upgrade",  addonKey: "hardwood_flooring",        description: "Engineered hardwood vs standard LVP (per sqft)",      costType: "per_sqft", amount: "12.00", applicableTypes: null },
  { name: "Custom Cabinetry",           addonKey: "custom_cabinetry",         description: "Custom kitchen/bath cabinets vs stock",               costType: "flat",     amount: "15000", applicableTypes: null },
  { name: "Solar Panel System",         addonKey: "solar_panels",             description: "10kW solar system, panels, inverter, permits",        costType: "flat",     amount: "18000", applicableTypes: null },
  { name: "Deck Addition",              addonKey: "deck_addition",            description: "Attached pressure-treated deck (up to 200 sqft)",     costType: "flat",     amount: "8500",  applicableTypes: null },
  { name: "Window & Door Upgrade",      addonKey: "window_upgrade",           description: "Triple-pane windows vs double-pane standard",         costType: "flat",     amount: "6400",  applicableTypes: null },
  { name: "Smart Home Package",         addonKey: "smart_home",               description: "Thermostats, locks, lighting, doorbell, hub",         costType: "flat",     amount: "4200",  applicableTypes: null },
  { name: "Radiant In-Floor Heat",      addonKey: "radiant_floor_heat",       description: "Electric or hydronic radiant floor heating (per sqft)",costType: "per_sqft", amount: "18.00", applicableTypes: null },
  { name: "Tankless Water Heater",      addonKey: "tankless_water_heater",    description: "High-efficiency gas tankless unit + install",         costType: "flat",     amount: "2800",  applicableTypes: null },
  { name: "Stamped Concrete Upgrade",   addonKey: "stamped_concrete",         description: "Decorative stamp + colour for concrete surfaces",     costType: "per_sqft", amount: "8.00",  applicableTypes: "concrete_flatwork,deck_patio" },
  { name: "Basement Waterproofing",     addonKey: "basement_waterproofing",   description: "Interior drain tile system, sump pump, membrane",     costType: "flat",     amount: "9000",  applicableTypes: "basement_finish,renovation_residential" },
];

// Ensures global pricing templates exist (once ever), then clones them for
// this company if it doesn't have its own cost models/addons yet.
export async function seedPricingData(companyId: number): Promise<void> {
  if (!(await hasGlobalCostModelTemplates())) {
    await insertGlobalCostModelTemplates(COST_MODEL_SEED);
    if (!(await hasGlobalAddonTemplates())) {
      await insertGlobalAddonTemplates(ADDON_SEED);
    }
  }

  if (!(await hasCompanyCostModels(companyId))) {
    const allTemplates = await getAllGlobalCostModelTemplates();
    await insertCompanyCostModels(companyId, allTemplates);
  }

  if (!(await hasCompanyAddons(companyId))) {
    const allAddons = await getAllGlobalAddonTemplates();
    await insertCompanyAddons(companyId, allAddons);
  }
}

export async function getProjectTypeLabels(companyId: number): Promise<Record<string, string>> {
  const config = await getCompanyEstimatorConfig(companyId);
  const custom = (config as Record<string, unknown> | null)?.projectTypeLabels as Record<string, string> | undefined;
  return { ...DEFAULT_PROJECT_TYPE_LABELS, ...(custom ?? {}) };
}
