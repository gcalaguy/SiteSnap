import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable } from "./index";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const psiStatusEnum = pgEnum("psi_status", ["draft", "submitted"]);

// ── Hazard category labels (shared source of truth for mobile + web UIs) ──────

export const PSI_HAZARD_CATEGORIES = {
  environmental: {
    title: "Environmental Hazards",
    hasOther: true,
    items: [
      "Exposure to Chemicals",
      "MSDS/SDS Available",
      "Weather Conditions",
      "Ventilation",
      "Heat Stress/Cold Stress",
      "Soil Conditions",
      "Noise Levels",
    ],
  },
  ergonomic: {
    title: "Ergonomic Hazards",
    hasOther: true,
    items: [
      "Working In Tight Area",
      "Awkward Posture",
      "Forceful Exertion",
      "Working Above Your Head",
      "Pinch Points Identified",
      "Repetitive Motion",
      "Vibration",
    ],
  },
  ppe: {
    title: "Ensure PPE Requirements",
    hasOther: true,
    otherLabel: "Additional PPE Required",
    items: [
      "Head Protection",
      "Foot Protection",
      "Hi Vis Vest",
      "Gloves",
      "Fall Protection",
      "Hearing Protection",
      "Respiratory Protection",
    ],
  },
  workingAtHeight: {
    title: "Working at Height Hazards",
    hasOther: true,
    items: [
      "Falls from Height",
      "Fall Protection Equipment Required",
      "Hoisting or Moving Loads",
      "Guardrails/Handrails Required",
      "Protective Floor Coverings Required",
      "Objects/Debris Falling from Above",
      "Others Working Overhead/Below",
      "Work Platform",
      "Ladders",
    ],
  },
  activity: {
    title: "Activity Hazards",
    hasOther: true,
    items: [
      "Working with Hand Tools",
      "Operating Power Equipment/Tools",
      "Operating Motor Vehicle/Heavy Machinery",
      "Burn/Heat Sources/Flammable Gases",
      "Compressed Gasses",
      "Energized Equipment in Area",
      "Electrical Cords/Tools – Condition",
      "Permits Required",
      "Lockout Required",
    ],
  },
  equipment: {
    title: "Equipment/Machinery Checklist",
    hasOther: false,
    items: [
      "Operators Manual Available",
      "Daily Inspection (Circle Check) Completed",
      "Operator Proof of Training Available",
      "Equipment/Tools Inspected",
      "Fire Extinguisher",
      "First Aid Kit",
    ],
  },
  trafficControl: {
    title: "Traffic Control Hazards",
    hasOther: true,
    items: [
      "Traffic Control Person Needed",
      "Traffic Control Devices (Signs, Signals, Barricades, Pylons, etc) Needed",
      "Pedestrians/Other Workers Around Work Area",
      "Nighttime Work (Dark Outside)",
      "Vehicle Reversing/Backing Up",
      "Moving Machinery/Equipment",
      "Collision with Traffic",
      "Uneven Roads",
    ],
  },
  personalLimitation: {
    title: "Personal Limitation Hazards",
    hasOther: false,
    items: [
      "Physical Limitations – Need Assistance",
      "Mental Limitations/Distraction in Work Area",
      "Training Required to Complete Task",
      "Buddy System Required",
      "Unclear Work Instructions",
      "Locates Need to Be Identified",
      "Procedure Not Available for Task",
    ],
  },
  additionalEquipment: {
    title: "Additional Equipment/Machinery",
    hasOther: true,
    hasOther2: true,
    hasOther3: true,
    items: [
      "Operators Manual Available",
      "Daily Inspection (Circle Check) Completed",
      "Operator Proof of Training Available",
      "Equipment/Tools Inspected",
      "Fire Extinguisher",
      "First Aid Kit",
    ],
  },
} as const;

export type PsiHazardCategoryKey = keyof typeof PSI_HAZARD_CATEGORIES;

export const PSI_HAZARD_CATEGORY_KEYS = Object.keys(
  PSI_HAZARD_CATEGORIES,
) as PsiHazardCategoryKey[];

// ── Tables ────────────────────────────────────────────────────────────────────

export const psiChecklistsTable = pgTable(
  "psi_checklists",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id),

    date: date("date").notNull(),
    weatherTemp: text("weather_temp"),
    tradeDescription: text("trade_description"),
    location: text("location"),

    // Keyed by PsiHazardCategoryKey — see PSI_HAZARD_CATEGORIES above.
    // Each value: { checked: string[], otherText?: string, other2Text?: string, other3Text?: string }
    hazards: jsonb("hazards").notNull().default({}),

    // Array<{ id, task, hazard, control }>
    taskRows: jsonb("task_rows").notNull().default([]),

    // Array<{ id, transcript, recordedAt, audioUrl? }>
    voiceNotes: jsonb("voice_notes").notNull().default([]),

    status: psiStatusEnum("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_psi_company_id").on(t.companyId),
    index("idx_psi_company_project").on(t.companyId, t.projectId),
    index("idx_psi_company_status").on(t.companyId, t.status),
    index("idx_psi_company_created").on(t.companyId, t.createdAt),
  ],
);

export const psiSignaturesTable = pgTable(
  "psi_worker_signatures",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    psiId: integer("psi_id")
      .notNull()
      .references(() => psiChecklistsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    signatureUrl: text("signature_url").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_psi_signature_user").on(t.psiId, t.userId),
    index("idx_psi_signatures_company").on(t.companyId),
    index("idx_psi_signatures_psi").on(t.psiId),
  ],
);

// Owner/foreman sign-off — any owner or foreman may approve; existence of a
// row IS the approval (no pending placeholders for a fixed role roster).
export const psiApprovalsTable = pgTable(
  "psi_approvals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    psiId: integer("psi_id")
      .notNull()
      .references(() => psiChecklistsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    signatureUrl: text("signature_url"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_psi_approval_user").on(t.psiId, t.userId),
    index("idx_psi_approvals_company").on(t.companyId),
    index("idx_psi_approvals_psi").on(t.psiId),
  ],
);

// ── Insert schemas & types ────────────────────────────────────────────────────

export const insertPsiChecklistSchema = createInsertSchema(psiChecklistsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPsiChecklist = z.infer<typeof insertPsiChecklistSchema>;
export type PsiChecklist = typeof psiChecklistsTable.$inferSelect;

export const insertPsiSignatureSchema = createInsertSchema(psiSignaturesTable).omit({
  id: true,
  signedAt: true,
});
export type InsertPsiSignature = z.infer<typeof insertPsiSignatureSchema>;
export type PsiSignature = typeof psiSignaturesTable.$inferSelect;

export const insertPsiApprovalSchema = createInsertSchema(psiApprovalsTable).omit({
  id: true,
});
export type InsertPsiApproval = z.infer<typeof insertPsiApprovalSchema>;
export type PsiApproval = typeof psiApprovalsTable.$inferSelect;
