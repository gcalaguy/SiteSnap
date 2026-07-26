import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable } from "./index";
import { corRiskLevelEnum, capaTicketsTable } from "./cor";

// ── AI Safety Scanner ─────────────────────────────────────────────────────────

export const safetyScanStatusEnum = pgEnum("safety_scan_status", [
  "complete",
  "failed",
]);

export const safetyScansTable = pgTable(
  "safety_scans",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    submittedByUserId: integer("submitted_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    status: safetyScanStatusEnum("status").notNull().default("complete"),
    photoObjectPaths: jsonb("photo_object_paths").notNull(), // string[]

    // GPS / capture metadata — locked at submission time for a tamper-evident audit trail
    gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }).notNull(),
    gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }).notNull(),
    gpsAltitude: numeric("gps_altitude", { precision: 8, scale: 2 }),
    gpsAccuracyM: numeric("gps_accuracy_m", { precision: 8, scale: 2 }),
    gpsCapturedAt: timestamp("gps_captured_at", { withTimezone: true }).notNull(),
    gpsTimezone: text("gps_timezone"),
    siteAddress: text("site_address"),

    // AI hazard analysis output
    summary: text("summary"),
    complianceScore: integer("compliance_score"), // 0–100
    riskLevel: corRiskLevelEnum("risk_level"),
    ppeDetected: jsonb("ppe_detected"), // [{item, present}]
    aiRawResponse: jsonb("ai_raw_response"),

    // Instant branded PDF report
    reportObjectPath: text("report_object_path"),

    // Digital sign-off
    inspectorSignatureData: text("inspector_signature_data"),
    inspectorSignedAt: timestamp("inspector_signed_at", { withTimezone: true }),
    foremanUserId: integer("foreman_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    foremanSignatureData: text("foreman_signature_data"),
    foremanSignedAt: timestamp("foreman_signed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_safety_scans_company").on(t.companyId),
    index("idx_safety_scans_company_project").on(t.companyId, t.projectId),
    index("idx_safety_scans_company_created").on(t.companyId, t.createdAt),
  ],
);

export const scanHazardsTable = pgTable(
  "scan_hazards",
  {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id")
      .notNull()
      .references(() => safetyScansTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    severity: corRiskLevelEnum("severity").notNull(),
    description: text("description").notNull(),
    remediation: text("remediation"),
    boundingArea: jsonb("bounding_area"), // {x,y,width,height} normalized 0-1, or a free-text label
    sourcePhotoObjectPath: text("source_photo_object_path"),
    capaTicketId: integer("capa_ticket_id").references(() => capaTicketsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_scan_hazards_scan").on(t.scanId),
    index("idx_scan_hazards_company").on(t.companyId),
  ],
);

export const insertSafetyScanSchema = createInsertSchema(safetyScansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSafetyScan = z.infer<typeof insertSafetyScanSchema>;
export type SafetyScan = typeof safetyScansTable.$inferSelect;

export const insertScanHazardSchema = createInsertSchema(scanHazardsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertScanHazard = z.infer<typeof insertScanHazardSchema>;
export type ScanHazard = typeof scanHazardsTable.$inferSelect;
