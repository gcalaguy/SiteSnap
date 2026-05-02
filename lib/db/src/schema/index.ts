import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["owner", "foreman", "worker"]);
export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);
export const rfiStatusEnum = pgEnum("rfi_status", [
  "open",
  "in_review",
  "answered",
  "closed",
]);
export const rfiPriorityEnum = pgEnum("rfi_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
]);

// ── Companies ─────────────────────────────────────────────────────────────────

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  province: text("province").notNull(),
  city: text("city").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  companyId: integer("company_id").references(() => companiesTable.id),
  role: userRoleEnum("role").notNull().default("worker"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// ── Invitations ───────────────────────────────────────────────────────────────

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("worker"),
  token: text("token").notNull().unique(),
  status: invitationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvitationSchema = createInsertSchema(
  invitationsTable,
).omit({ id: true, createdAt: true });
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;

// ── Projects ──────────────────────────────────────────────────────────────────

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull(),
  status: projectStatusEnum("status").notNull().default("planning"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: numeric("budget", { precision: 12, scale: 2 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

// ── Daily Reports ─────────────────────────────────────────────────────────────

export const dailyReportsTable = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  submittedByUserId: integer("submitted_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  reportDate: date("report_date").notNull(),
  weather: text("weather"),
  temperature: text("temperature"),
  crewCount: integer("crew_count").notNull(),
  workPerformed: text("work_performed").notNull(),
  materialsUsed: text("materials_used"),
  equipment: text("equipment"),
  issues: text("issues"),
  aiSummary: text("ai_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDailyReportSchema = createInsertSchema(
  dailyReportsTable,
).omit({ id: true, createdAt: true });
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;

// ── Cost Analyses ─────────────────────────────────────────────────────────────

export const costAnalysesTable = pgTable("cost_analyses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  periodLabel: text("period_label").notNull(),
  labourCost: numeric("labour_cost", { precision: 12, scale: 2 }).notNull(),
  materialsCost: numeric("materials_cost", {
    precision: 12,
    scale: 2,
  }).notNull(),
  equipmentCost: numeric("equipment_cost", {
    precision: 12,
    scale: 2,
  }).notNull(),
  otherCost: numeric("other_cost", { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  aiAnalysis: text("ai_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCostAnalysisSchema = createInsertSchema(
  costAnalysesTable,
).omit({ id: true, createdAt: true });
export type InsertCostAnalysis = z.infer<typeof insertCostAnalysisSchema>;
export type CostAnalysis = typeof costAnalysesTable.$inferSelect;

// ── RFIs ──────────────────────────────────────────────────────────────────────

export const rfisTable = pgTable("rfis", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  rfiNumber: text("rfi_number").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  submittedByUserId: integer("submitted_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  assignedToUserId: integer("assigned_to_user_id").references(
    () => usersTable.id,
  ),
  status: rfiStatusEnum("status").notNull().default("open"),
  priority: rfiPriorityEnum("priority").notNull().default("medium"),
  response: text("response"),
  aiDraftResponse: text("ai_draft_response"),
  dueDate: date("due_date"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRFISchema = createInsertSchema(rfisTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRFI = z.infer<typeof insertRFISchema>;
export type RFI = typeof rfisTable.$inferSelect;
