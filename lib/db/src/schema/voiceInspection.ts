import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable } from "./index";
import { corRiskLevelEnum, capaTicketsTable } from "./cor";

// ── AI Voice Inspection Assistant ───────────────────────────────────────────

export const voiceInspectionStatusEnum = pgEnum("voice_inspection_status", [
  "complete",
  "failed",
]);

export const voiceInspectionPassStatusEnum = pgEnum("voice_inspection_pass_status", [
  "pass",
  "fail",
  "conditional",
]);

export const voiceInspectionsTable = pgTable(
  "voice_inspections",
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
    status: voiceInspectionStatusEnum("status").notNull().default("complete"),

    // Raw evidence — kept for audit trail / replay
    audioObjectPath: text("audio_object_path").notNull(),
    audioDurationSeconds: integer("audio_duration_seconds"),
    transcript: text("transcript").notNull(),

    // GPS / capture metadata — locked at submission time for a tamper-evident audit trail
    gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }).notNull(),
    gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }).notNull(),
    gpsAltitude: numeric("gps_altitude", { precision: 8, scale: 2 }),
    gpsAccuracyM: numeric("gps_accuracy_m", { precision: 8, scale: 2 }),
    gpsCapturedAt: timestamp("gps_captured_at", { withTimezone: true }).notNull(),
    gpsTimezone: text("gps_timezone"),
    siteAddress: text("site_address"),

    // AI-extracted structured inspection report
    equipmentOrArea: text("equipment_or_area"),
    inspectionType: text("inspection_type"),
    passStatus: voiceInspectionPassStatusEnum("pass_status"),
    hazardSummary: text("hazard_summary"),
    severityLevel: corRiskLevelEnum("severity_level"),
    locationDetails: text("location_details"),
    immediateActionRequired: boolean("immediate_action_required").notNull().default(false),
    recommendedActions: jsonb("recommended_actions"), // string[]
    aiRawResponse: jsonb("ai_raw_response"),

    // Link-back to auto-created CAPA ticket (1:1 — one report, one ticket)
    capaTicketId: integer("capa_ticket_id").references(() => capaTicketsTable.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_voice_inspections_company").on(t.companyId),
    index("idx_voice_inspections_company_project").on(t.companyId, t.projectId),
    index("idx_voice_inspections_company_created").on(t.companyId, t.createdAt),
  ],
);

export const insertVoiceInspectionSchema = createInsertSchema(voiceInspectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVoiceInspection = z.infer<typeof insertVoiceInspectionSchema>;
export type VoiceInspection = typeof voiceInspectionsTable.$inferSelect;
