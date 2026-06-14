import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable, projectsTable, usersTable, contactsTable } from "./index";

// ── Inventory Assets ──────────────────────────────────────────────────────────
// Covers fleet vehicles, heavy equipment, and small tools.
// category drives which board the asset appears on.

export const inventoryAssetsTable = pgTable(
  "inventory_assets",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // fleet | heavy_equipment | small_tool
    category: text("category").notNull().default("fleet"),
    // truck|excavator|bobcat|crane|lift|compactor|generator|saw|laser|drill|welder|other
    assetType: text("asset_type").notNull().default("other"),
    make: text("make"),
    model: text("model"),
    year: text("year"),
    serialNumber: text("serial_number"),
    // available | in_use | maintenance | retired
    status: text("status").notNull().default("available"),
    photoUrl: text("photo_url"),
    dailyCost: numeric("daily_cost", { precision: 10, scale: 2 }),
    lastKnownLat: numeric("last_known_lat", { precision: 10, scale: 6 }),
    lastKnownLng: numeric("last_known_lng", { precision: 11, scale: 6 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_inventory_assets_company_id").on(t.companyId),
    index("idx_inventory_assets_company_category").on(t.companyId, t.category),
    index("idx_inventory_assets_company_status").on(t.companyId, t.status),
  ],
);

export const insertInventoryAssetSchema = createInsertSchema(inventoryAssetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInventoryAsset = z.infer<typeof insertInventoryAssetSchema>;
export type InventoryAsset = typeof inventoryAssetsTable.$inferSelect;

// ── Asset Schedules (Dispatch Board) ─────────────────────────────────────────
// Fleet/heavy-equipment assignments to projects over date ranges.
// Renders as colored bars on the timeline grid.

export const assetSchedulesTable = pgTable(
  "asset_schedules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => inventoryAssetsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    assignedToUserId: integer("assigned_to_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    notes: text("notes"),
    color: text("color").notNull().default("#D4AF37"),
    // scheduled | active | completed | cancelled
    status: text("status").notNull().default("scheduled"),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_asset_schedules_company_id").on(t.companyId),
    index("idx_asset_schedules_asset_id").on(t.assetId),
    index("idx_asset_schedules_project_id").on(t.projectId),
    index("idx_asset_schedules_company_dates").on(
      t.companyId,
      t.startDate,
      t.endDate,
    ),
  ],
);

export const insertAssetScheduleSchema = createInsertSchema(
  assetSchedulesTable,
).omit({ id: true, createdAt: true });
export type InsertAssetSchedule = z.infer<typeof insertAssetScheduleSchema>;
export type AssetSchedule = typeof assetSchedulesTable.$inferSelect;

// ── Inventory Materials ───────────────────────────────────────────────────────
// Bulk commodity tracking with reorder thresholds.
// stockStatus is derived server-side from qty vs threshold.

export const inventoryMaterialsTable = pgTable(
  "inventory_materials",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // lumber | concrete | gravel | safety_gear | hardware | plumbing | electrical | other
    category: text("category").notNull().default("other"),
    // bags | cubic_yards | board_feet | each | lbs | gallons | boxes | rolls | sheets
    unit: text("unit").notNull().default("each"),
    quantityOnHand: numeric("quantity_on_hand", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0"),
    reorderThreshold: numeric("reorder_threshold", {
      precision: 10,
      scale: 2,
    }),
    reorderQty: numeric("reorder_qty", { precision: 10, scale: 2 }),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
    // "Main Yard", "Warehouse B", etc.
    location: text("location"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_inventory_materials_company_id").on(t.companyId),
    index("idx_inventory_materials_company_category").on(
      t.companyId,
      t.category,
    ),
  ],
);

export const insertInventoryMaterialSchema = createInsertSchema(
  inventoryMaterialsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryMaterial = z.infer<
  typeof insertInventoryMaterialSchema
>;
export type InventoryMaterial = typeof inventoryMaterialsTable.$inferSelect;

// ── Tool Checkouts ────────────────────────────────────────────────────────────
// Tracks which foreman / crew member has a small tool currently.
// status=checked_out → asset is off-site; status=returned → back in yard.

export const toolCheckoutsTable = pgTable(
  "tool_checkouts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => inventoryAssetsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    checkedOutToUserId: integer("checked_out_to_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    checkedOutToContactId: integer("checked_out_to_contact_id").references(
      () => contactsTable.id,
      { onDelete: "set null" },
    ),
    // freeform name fallback when person is not in the system
    checkedOutToName: text("checked_out_to_name"),
    // checked_out | returned
    status: text("status").notNull().default("checked_out"),
    notes: text("notes"),
    checkedOutAt: timestamp("checked_out_at").defaultNow().notNull(),
    expectedReturnDate: date("expected_return_date"),
    returnedAt: timestamp("returned_at"),
    checkedOutByUserId: integer("checked_out_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    returnedByUserId: integer("returned_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tool_checkouts_company_id").on(t.companyId),
    index("idx_tool_checkouts_asset_id").on(t.assetId),
    index("idx_tool_checkouts_company_status").on(t.companyId, t.status),
    index("idx_tool_checkouts_user").on(t.checkedOutToUserId),
  ],
);

export const insertToolCheckoutSchema = createInsertSchema(
  toolCheckoutsTable,
).omit({ id: true, createdAt: true });
export type InsertToolCheckout = z.infer<typeof insertToolCheckoutSchema>;
export type ToolCheckout = typeof toolCheckoutsTable.$inferSelect;
