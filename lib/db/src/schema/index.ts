import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  date,
  pgEnum,
  json,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

export * from "./conversations";
export * from "./messages";
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
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  referralCode: text("referral_code").unique(),
  referredByCode: text("referred_by_code"),
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
  pushToken: text("push_token"),
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

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  assignedToUserId: integer("assigned_to_user_id").references(
    () => usersTable.id,
  ),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

// ── Daily Report Photos ───────────────────────────────────────────────────────

export const dailyReportPhotosTable = pgTable("daily_report_photos", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => dailyReportsTable.id),
  objectPath: text("object_path").notNull(),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertDailyReportPhotoSchema = createInsertSchema(
  dailyReportPhotosTable,
).omit({ id: true, uploadedAt: true });
export type InsertDailyReportPhoto = z.infer<
  typeof insertDailyReportPhotoSchema
>;
export type DailyReportPhoto = typeof dailyReportPhotosTable.$inferSelect;

// ── Project Documents ─────────────────────────────────────────────────────────

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const projectDocumentsTable = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  uploadedByUserId: integer("uploaded_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  objectPath: text("object_path").notNull(),
  fileSize: integer("file_size"),
  status: documentStatusEnum("status").notNull().default("pending"),
  extractedData: json("extracted_data"),
  aiSummary: text("ai_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectDocumentSchema = createInsertSchema(
  projectDocumentsTable,
).omit({ id: true, createdAt: true });
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectDocument = typeof projectDocumentsTable.$inferSelect;

// ── Notifications ─────────────────────────────────────────────────────────────

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  type: text("type").notNull(), // "task" | "rfi"
  title: text("title").notNull(),
  body: text("body").notNull(),
  referenceId: integer("reference_id").notNull(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;

// ── Quotes ────────────────────────────────────────────────────────────────────

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "converted",
]);

export type QuoteLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  quoteNumber: text("quote_number").notNull(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  status: quoteStatusEnum("status").notNull().default("draft"),
  voiceInput: text("voice_input"),
  lineItems: json("line_items").$type<QuoteLineItem[]>().notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull().default("0.1300"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  validUntil: date("valid_until"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

// ── Invoices ──────────────────────────────────────────────────────────────────

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  quoteId: integer("quote_id").references(() => quotesTable.id),
  invoiceNumber: text("invoice_number").notNull(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  lineItems: json("line_items").$type<QuoteLineItem[]>().notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull().default("0.1300"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  dueDate: date("due_date"),
  sentAt: timestamp("sent_at"),
  paidAt: timestamp("paid_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

// ── QuickBooks Connections ─────────────────────────────────────────────────────

export const quickbooksConnectionsTable = pgTable("quickbooks_connections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id),
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  environment: text("environment").notNull().default("sandbox"),
  lastInvoiceSyncAt: timestamp("last_invoice_sync_at"),
  lastCostSyncAt: timestamp("last_cost_sync_at"),
  syncedInvoiceCount: integer("synced_invoice_count").default(0),
  syncedCostCount: integer("synced_cost_count").default(0),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type QuickbooksConnection = typeof quickbooksConnectionsTable.$inferSelect;

// ── Project Members ────────────────────────────────────────────────────────────

export const projectMembersTable = pgTable(
  "project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.projectId, t.userId)],
);

export type ProjectMember = typeof projectMembersTable.$inferSelect;

// ── Worker Schedules ───────────────────────────────────────────────────────────

export const workerSchedulesTable = pgTable("worker_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WorkerSchedule = typeof workerSchedulesTable.$inferSelect;

// ── Client Portal ──────────────────────────────────────────────────────────────

export const clientPortalTokensTable = pgTable("client_portal_tokens", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  clientName: text("client_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientPortalToken = typeof clientPortalTokensTable.$inferSelect;

export const clientPortalUploadsTable = pgTable("client_portal_uploads", {
  id: serial("id").primaryKey(),
  portalTokenId: integer("portal_token_id")
    .notNull()
    .references(() => clientPortalTokensTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  objectPath: text("object_path").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientPortalUpload = typeof clientPortalUploadsTable.$inferSelect;
