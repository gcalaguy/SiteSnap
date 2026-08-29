import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable } from "./index";

// ── AI Skills (document drafting) ───────────────────────────────────────────

export const aiSkillRunStatusEnum = pgEnum("ai_skill_run_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
]);

export const aiSkillRunsTable = pgTable(
  "ai_skill_runs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    skillKey: text("skill_key").notNull(),
    inputs: jsonb("inputs").notNull(),
    outputText: text("output_text"),
    outputJson: jsonb("output_json"),
    status: aiSkillRunStatusEnum("status").notNull().default("draft"),
    approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_ai_skill_runs_company_project").on(t.companyId, t.projectId),
    index("idx_ai_skill_runs_company_skill").on(t.companyId, t.skillKey),
    index("idx_ai_skill_runs_company_created").on(t.companyId, t.createdAt),
  ],
);

export const insertAiSkillRunSchema = createInsertSchema(aiSkillRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiSkillRun = z.infer<typeof insertAiSkillRunSchema>;
export type AiSkillRun = typeof aiSkillRunsTable.$inferSelect;
