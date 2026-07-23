import { db, taskCategoriesTable } from "@workspace/db";
import { isNull, sql } from "drizzle-orm";

// System-wide task taxonomy for AI scope extraction (companyId = null). Company-specific
// overrides/additions can be added later without a schema change (companyId is nullable).
const TASK_CATEGORIES: { trade: string; canonicalName: string; synonyms: string[] }[] = [
  { trade: "Electrical", canonicalName: "Exhaust Fan Replacement", synonyms: ["replace fan", "change bathroom fan", "install new vent fan", "fan replacement", "swap out fan"] },
  { trade: "Electrical", canonicalName: "Light Fixture Installation", synonyms: ["install light", "hang light fixture", "put up a light", "new light fixture"] },
  { trade: "Electrical", canonicalName: "Outlet Installation", synonyms: ["add outlet", "install plug", "new outlet", "add a socket"] },
  { trade: "Electrical", canonicalName: "Panel Upgrade", synonyms: ["upgrade panel", "breaker box upgrade", "electrical panel replacement"] },
  { trade: "Electrical", canonicalName: "Ceiling Fan Installation", synonyms: ["install ceiling fan", "hang a fan", "put up ceiling fan"] },
  { trade: "Electrical", canonicalName: "Switch Installation", synonyms: ["install switch", "add a light switch", "new switch"] },
  { trade: "Carpentry", canonicalName: "Baseboard Installation", synonyms: ["install baseboard", "put in baseboards", "new trim", "baseboard trim"] },
  { trade: "Carpentry", canonicalName: "Door Installation", synonyms: ["install door", "hang a door", "replace door", "new door"] },
  { trade: "Carpentry", canonicalName: "Window Trim Installation", synonyms: ["install window trim", "window casing", "trim out a window"] },
  { trade: "Carpentry", canonicalName: "Shelving Installation", synonyms: ["install shelves", "put up shelving", "build shelves"] },
  { trade: "Carpentry", canonicalName: "Deck Repair", synonyms: ["fix deck", "repair deck boards", "deck maintenance"] },
  { trade: "Carpentry", canonicalName: "Framing", synonyms: ["frame a wall", "build a wall frame", "rough framing"] },
  { trade: "Drywall", canonicalName: "Drywall Repair", synonyms: ["patch drywall", "fix hole in wall", "repair drywall", "patch a wall"] },
  { trade: "Drywall", canonicalName: "Drywall Installation", synonyms: ["hang drywall", "install drywall", "new drywall"] },
  { trade: "Drywall", canonicalName: "Ceiling Repair", synonyms: ["patch ceiling", "fix ceiling", "repair ceiling drywall"] },
  { trade: "Painting", canonicalName: "Paint Touch-Up", synonyms: ["touch up paint", "paint repaired area", "spot paint", "paint patch area"] },
  { trade: "Painting", canonicalName: "Interior Room Painting", synonyms: ["paint a room", "repaint room", "paint walls", "interior paint job"] },
  { trade: "Painting", canonicalName: "Exterior Painting", synonyms: ["paint outside", "exterior paint job", "paint siding"] },
  { trade: "Painting", canonicalName: "Trim Painting", synonyms: ["paint trim", "paint baseboards", "paint door frames"] },
  { trade: "Plumbing", canonicalName: "Faucet Replacement", synonyms: ["replace faucet", "change tap", "new faucet", "swap faucet"] },
  { trade: "Plumbing", canonicalName: "Toilet Installation", synonyms: ["install toilet", "replace toilet", "new toilet"] },
  { trade: "Plumbing", canonicalName: "Leak Repair", synonyms: ["fix leak", "repair leaking pipe", "stop a leak"] },
  { trade: "Plumbing", canonicalName: "Water Heater Replacement", synonyms: ["replace water heater", "new hot water tank", "install water heater"] },
  { trade: "Plumbing", canonicalName: "Shower/Tub Installation", synonyms: ["install shower", "install tub", "new bathtub", "replace shower"] },
  { trade: "Flooring", canonicalName: "Hardwood Flooring Installation", synonyms: ["install hardwood", "lay hardwood floor", "new hardwood floors"] },
  { trade: "Flooring", canonicalName: "Tile Installation", synonyms: ["install tile", "lay tile", "tile the floor", "new tile"] },
  { trade: "Flooring", canonicalName: "Carpet Installation", synonyms: ["install carpet", "lay carpet", "new carpet"] },
  { trade: "Flooring", canonicalName: "Laminate/Vinyl Flooring Installation", synonyms: ["install laminate", "install vinyl plank", "lvp flooring", "new laminate floor"] },
  { trade: "HVAC", canonicalName: "Furnace Repair", synonyms: ["fix furnace", "repair furnace", "furnace not working"] },
  { trade: "HVAC", canonicalName: "Furnace Installation", synonyms: ["install furnace", "new furnace", "replace furnace"] },
  { trade: "HVAC", canonicalName: "Duct Work", synonyms: ["install ductwork", "fix ducts", "run new ducts"] },
  { trade: "Roofing", canonicalName: "Roof Repair", synonyms: ["fix roof", "patch roof leak", "repair shingles"] },
  { trade: "Roofing", canonicalName: "Roof Replacement", synonyms: ["new roof", "replace roof", "re-roof", "reshingle"] },
  { trade: "Masonry", canonicalName: "Concrete Patching", synonyms: ["patch concrete", "fix concrete crack", "repair concrete"] },
  { trade: "Masonry", canonicalName: "Concrete Pour", synonyms: ["pour concrete", "new concrete slab", "pour a pad"] },
  { trade: "General", canonicalName: "General Cleanup", synonyms: ["clean up site", "final cleanup", "job site cleanup"] },
  { trade: "General", canonicalName: "Demolition", synonyms: ["demo", "tear out", "demolish", "rip out"] },
  { trade: "General", canonicalName: "Insulation Installation", synonyms: ["install insulation", "add insulation", "new insulation"] },
];

async function seedTaskCategories() {
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taskCategoriesTable)
    .where(isNull(taskCategoriesTable.companyId));

  if ((existing?.count ?? 0) > 0) {
    console.log(`task_categories already has ${existing!.count} system row(s) — skipping seed.`);
    process.exit(0);
  }

  await db.insert(taskCategoriesTable).values(
    TASK_CATEGORIES.map((c) => ({ companyId: null, trade: c.trade, canonicalName: c.canonicalName, synonyms: c.synonyms }))
  );
  console.log(`Seeded ${TASK_CATEGORIES.length} system task categories.`);
  process.exit(0);
}

seedTaskCategories().catch((err) => {
  console.error("Failed to seed task categories:", err);
  process.exit(1);
});
