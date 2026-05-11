import { Router } from "express";
import multer from "multer";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  estimatorCostModelsTable,
  estimatorAddonsTable,
  estimatorActualsTable,
  estimatesTable,
  quotesTable,
  type EstimatorCostModel,
  type EstimatorAddon,
} from "@workspace/db";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";

import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
router.use(requireFeature("Smart_Estimator"));

// ── Seed pricing data (runs once, idempotent) ─────────────────────────────────

const COST_MODEL_SEED: Omit<EstimatorCostModel, "id" | "createdAt" | "updatedAt">[] = [
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

const ADDON_SEED: Omit<EstimatorAddon, "id" | "createdAt">[] = [
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

async function seedPricingData() {
  const existing = await db.select({ id: estimatorCostModelsTable.id }).from(estimatorCostModelsTable).limit(1);
  if (existing.length > 0) return; // already seeded

  await db.insert(estimatorCostModelsTable).values(
    COST_MODEL_SEED.map((m) => ({ ...m, createdAt: new Date(), updatedAt: new Date() }))
  );

  const existingAddons = await db.select({ id: estimatorAddonsTable.id }).from(estimatorAddonsTable).limit(1);
  if (existingAddons.length === 0) {
    await db.insert(estimatorAddonsTable).values(
      ADDON_SEED.map((a) => ({ ...a, createdAt: new Date() }))
    );
  }
}

// ── AI Parser — Free Text → Structured JSON ───────────────────────────────────

const VALID_PROJECT_TYPES = [
  "residential_new_build", "commercial_new_build",
  "renovation_residential", "renovation_commercial",
  "addition", "garage", "deck_patio", "basement_finish",
  "roofing", "concrete_flatwork", "framing_only", "landscaping",
] as const;

const VALID_FINISH_LEVELS = ["basic", "standard", "premium", "luxury"] as const;

const VALID_ADDON_KEYS = [
  "hvac_system", "plumbing_rough", "electrical_panel", "insulation_spray_foam",
  "permit_fees", "engineered_drawings", "site_prep_excavation", "foundation_waterproofing",
  "hardwood_flooring", "custom_cabinetry", "solar_panels", "deck_addition",
  "window_upgrade", "smart_home", "radiant_floor_heat", "tankless_water_heater",
  "stamped_concrete", "basement_waterproofing",
];

async function parsePromptToParams(prompt: string): Promise<{
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
}> {
  const systemPrompt = `You are a construction estimating assistant. Extract structured parameters from a construction project description.

Return ONLY valid JSON with exactly these fields:
{
  "project_type": one of: ${VALID_PROJECT_TYPES.join(", ")},
  "square_feet": number (total project area in sqft, estimate if not given),
  "finish_level": one of: basic, standard, premium, luxury,
  "addons": array of applicable keys from: ${VALID_ADDON_KEYS.join(", ")},
  "confidence": number 0-100 (how confident you are in the extraction),
  "notes": "brief note about any assumptions made"
}

Rules:
- square_feet MUST be a number, never null. Estimate from context clues (room count, dimensions mentioned, typical sizes).
- finish_level: basic=builder-grade, standard=mid-range, premium=high-end, luxury=bespoke custom
- addons: only include if explicitly mentioned or strongly implied
- Do NOT invent values — if unsure about sqft, use 1000 as a reasonable default and set confidence low
- Respond with ONLY the JSON object, no markdown, no explanation`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);

  // Validate and sanitize
  const projectType = VALID_PROJECT_TYPES.includes(parsed.project_type)
    ? parsed.project_type
    : "renovation_residential";
  const finishLevel = VALID_FINISH_LEVELS.includes(parsed.finish_level)
    ? parsed.finish_level
    : "standard";
  const sqft = Math.max(1, Math.round(Number(parsed.square_feet) || 1000));
  const addons = Array.isArray(parsed.addons)
    ? parsed.addons.filter((a: string) => VALID_ADDON_KEYS.includes(a))
    : [];

  return {
    project_type: projectType,
    square_feet: sqft,
    finish_level: finishLevel,
    addons,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
    notes: String(parsed.notes || ""),
  };
}

// ── Pricing Engine — Structured Params → Line Items ──────────────────────────

function runPricingEngine(
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

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/estimator/cost-models
router.get(
  "/estimator/cost-models",
  requireAuth,
  requireCompany,
  asyncHandler(async (_req, res) => {
    await seedPricingData();
    const [models, addons] = await Promise.all([
      db.select().from(estimatorCostModelsTable).orderBy(
        estimatorCostModelsTable.projectType,
        estimatorCostModelsTable.finishLevel,
      ),
      db.select().from(estimatorAddonsTable),
    ]);
    res.json({ models, addons });
  }),
);

// POST /api/estimator/cost-models — create a new cost model
const CostModelBody = z.object({
  projectType:         z.string().min(1, "projectType is required"),
  finishLevel:         z.enum(["basic", "standard", "premium", "luxury"]),
  name:                z.string().min(1, "name is required"),
  baseCostPerSqft:     z.string(),
  laborCostPerSqft:    z.string(),
  materialCostPerSqft: z.string(),
  overheadPct:         z.string().default("10"),
  contingencyPct:      z.string().default("10"),
  notes:               z.string().optional(),
});

router.post(
  "/estimator/cost-models",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CostModelBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");
    const { notes, ...rest } = parsed.data;
    const [model] = await db
      .insert(estimatorCostModelsTable)
      .values({ ...rest, notes: notes ?? null, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    res.status(201).json(model);
  }),
);

// PUT /api/estimator/cost-models/:id — update a cost model
router.put(
  "/estimator/cost-models/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const parsed = CostModelBody.partial().safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");
    const { notes, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if ("notes" in parsed.data) updateData.notes = notes ?? null;
    const [model] = await db
      .update(estimatorCostModelsTable)
      .set(updateData)
      .where(eq(estimatorCostModelsTable.id, id))
      .returning();
    if (!model) throw new NotFoundError("Cost model not found");
    res.json(model);
  }),
);

// DELETE /api/estimator/cost-models/:id — delete a cost model
router.delete(
  "/estimator/cost-models/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const [deleted] = await db
      .delete(estimatorCostModelsTable)
      .where(eq(estimatorCostModelsTable.id, id))
      .returning({ id: estimatorCostModelsTable.id });
    if (!deleted) throw new NotFoundError("Cost model not found");
    res.json({ success: true });
  }),
);

// POST /api/estimator/parse — AI: free text → structured params
const ParseBody = z.object({
  prompt: z.string().min(10, "Please describe the project (min 10 characters)"),
});

router.post(
  "/estimator/parse",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = ParseBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    await seedPricingData();
    const params = await parsePromptToParams(parsed.data.prompt);
    res.json(params);
  }),
);

// POST /api/estimator/parse-from-file — upload file → extract text → AI parse params
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post(
  "/estimator/parse-from-file",
  requireAuth,
  requireCompany,
  fileUpload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new BadRequestError("No file uploaded");

    let extractedText: string;
    const mime = file.mimetype.toLowerCase();
    const filename = file.originalname.toLowerCase();

    if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|heic)$/.test(filename)) {
      const base64 = file.buffer.toString("base64");
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Analyze this construction plan or document image. Extract a detailed description of the project scope, including project type, approximate size in square feet, finish quality (basic/standard/premium/luxury), and any specific requirements visible. Be specific and comprehensive." },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        }],
      });
      extractedText = visionResponse.choices[0]?.message?.content ?? "";
      if (!extractedText) throw new BadRequestError("Could not extract information from the image");
    } else {
      let text: string | null = null;
      if (mime.includes("pdf") || filename.endsWith(".pdf")) {
        try {
          // @ts-ignore
          const pdfParse = (await import("pdf-parse")).default;
          const parsed = await pdfParse(file.buffer);
          text = parsed.text?.trim() || null;
        } catch { text = null; }
      } else if (mime.includes("word") || mime.includes("docx") || filename.endsWith(".docx") || filename.endsWith(".doc")) {
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          text = result.value?.trim() || null;
        } catch { text = null; }
      } else if (mime.startsWith("text/") || filename.endsWith(".txt")) {
        text = file.buffer.toString("utf-8").trim();
      }
      if (!text || text.length < 10) {
        throw new BadRequestError("Could not extract readable text from the file. Please try a PDF, Word document, text file, or image.");
      }
      extractedText = text;
    }

    const hint = typeof req.body.hint === "string" ? req.body.hint.trim() : "";
    const fullPrompt = hint ? `${extractedText}\n\nAdditional context: ${hint}` : extractedText;
    await seedPricingData();
    const params = await parsePromptToParams(fullPrompt);
    res.json(params);
  }),
);

// POST /api/estimator/calculate — rule engine: params → estimate
const CalculateBody = z.object({
  project_type: z.string(),
  square_feet: z.number().positive("square_feet must be positive"),
  finish_level: z.string(),
  addons: z.array(z.string()).optional().default([]),
  margin_pct: z.number().min(0).max(100).optional().default(15),
});

router.post(
  "/estimator/calculate",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = CalculateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    await seedPricingData();
    const { project_type, square_feet, finish_level, addons, margin_pct } = parsed.data;

    // Look up cost model from DB — AI cannot invent this
    const [costModel] = await db
      .select()
      .from(estimatorCostModelsTable)
      .where(
        and(
          eq(estimatorCostModelsTable.projectType, project_type),
          eq(estimatorCostModelsTable.finishLevel, finish_level),
        ),
      )
      .limit(1);

    if (!costModel) {
      throw new NotFoundError(`No pricing model found for project_type="${project_type}" finish_level="${finish_level}"`);
    }

    const selectedAddons = addons.length > 0
      ? await db.select().from(estimatorAddonsTable).where(
          eq(estimatorAddonsTable.addonKey, addons[0]!) // basic — handle all addons below
        ).then(() =>
          db.select().from(estimatorAddonsTable)
        ).then((all) => all.filter((a) => addons.includes(a.addonKey)))
      : [];

    const result = runPricingEngine({ project_type, square_feet, finish_level, addons, margin_pct }, costModel, selectedAddons);
    res.json(result);
  }),
);

// POST /api/estimator/smart-estimates — save a smart estimate
const SaveSmartEstimateBody = z.object({
  title: z.string().min(1),
  params: z.object({
    project_type: z.string(),
    square_feet: z.number(),
    finish_level: z.string(),
    addons: z.array(z.string()),
    margin_pct: z.number().optional(),
  }),
  result: z.record(z.unknown()),
  sourcePrompt: z.string().optional(),
  scanId: z.number().int().positive().optional(),
});

router.post(
  "/estimator/smart-estimates",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = SaveSmartEstimateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { title, params, result, sourcePrompt, scanId } = parsed.data;

    const [estimate] = await db.insert(estimatesTable).values({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      title,
      scopeText: sourcePrompt ?? null,
      sourceType: scanId ? "scan" : "smart",
      status: "ready",
      result: { ...result, _params: params },
      scanId: scanId ?? null,
    }).returning();

    res.status(201).json(estimate);
  }),
);

// GET /api/estimator/smart-estimates — list saved smart estimates
router.get(
  "/estimator/smart-estimates",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const estimates = await db
      .select()
      .from(estimatesTable)
      .where(
        and(
          eq(estimatesTable.companyId, req.companyId!),
          eq(estimatesTable.sourceType, "smart"),
        ),
      )
      .orderBy(desc(estimatesTable.createdAt));

    res.json(estimates);
  }),
);

// POST /api/estimator/actuals — record actual project cost (learning system)
// ── Helper: quote number + totals ────────────────────────────────────────────
async function getNextQuoteNumber(companyId: number): Promise<string> {
  const [result] = await db
    .select({ count: count() })
    .from(quotesTable)
    .where(eq(quotesTable.companyId, companyId));
  const num = (result?.count ?? 0) + 1;
  return `QUO-${String(num).padStart(4, "0")}`;
}

function calcQuoteTotals(items: { quantity: number; unitPrice: number }[], taxRate = 0.13) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}

// ── POST /api/estimator/to-quote ─────────────────────────────────────────────
const ToQuoteBody = z.object({
  title: z.string().min(1),
  clientName: z.string().min(1),
  clientEmail: z.string().email().optional(),
  notes: z.string().optional(),
  sourcePrompt: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unitPrice: z.number(),
    total: z.number(),
  })),
});

router.post(
  "/estimator/to-quote",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = ToQuoteBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { title, clientName, clientEmail, notes, sourcePrompt, lineItems } = parsed.data;

    const quoteNumber = await getNextQuoteNumber(req.companyId!);
    const { subtotal, taxAmount, total } = calcQuoteTotals(lineItems);

    const [quote] = await db.insert(quotesTable).values({
      companyId: req.companyId!,
      projectId: null,
      quoteNumber,
      title,
      clientName,
      clientEmail: clientEmail ?? null,
      clientCompanyName: null,
      clientAddress: null,
      clientPhone: null,
      voiceInput: sourcePrompt ?? null,
      notes: notes ? `${notes}\n\n[Generated by Smart Estimator]` : "[Generated by Smart Estimator]",
      lineItems: lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[],
      subtotal,
      taxRate: "0.1300",
      taxAmount,
      total,
      validUntil: null,
      createdByUserId: req.userId!,
      status: "draft",
    }).returning();

    res.status(201).json(quote);
  }),
);

const RecordActualBody = z.object({
  estimate_id: z.number().int().positive(),
  estimated_cost: z.number().positive(),
  actual_cost: z.number().positive(),
  notes: z.string().optional(),
});

router.post(
  "/estimator/actuals",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = RecordActualBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { estimate_id, estimated_cost, actual_cost, notes } = parsed.data;

    // Verify estimate belongs to company
    const [estimate] = await db
      .select()
      .from(estimatesTable)
      .where(and(eq(estimatesTable.id, estimate_id), eq(estimatesTable.companyId, req.companyId!)))
      .limit(1);
    if (!estimate) throw new NotFoundError("Estimate not found");

    const variancePct = ((actual_cost - estimated_cost) / estimated_cost) * 100;

    const [actual] = await db.insert(estimatorActualsTable).values({
      estimateId: estimate_id,
      companyId: req.companyId!,
      estimatedCost: String(estimated_cost),
      actualCost: String(actual_cost),
      variancePct: String(Math.round(variancePct * 100) / 100),
      notes: notes ?? null,
      recordedAt: new Date(),
    }).returning();

    res.status(201).json(actual);
  }),
);

// GET /api/estimator/actuals — list all actuals for learning insights
router.get(
  "/estimator/actuals",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const actuals = await db
      .select()
      .from(estimatorActualsTable)
      .where(eq(estimatorActualsTable.companyId, req.companyId!))
      .orderBy(desc(estimatorActualsTable.recordedAt));

    res.json(actuals);
  }),
);

export default router;
