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
  jsonb,
  boolean,
  unique,
  primaryKey,
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
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  hstNumber: text("hst_number"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  referralCode: text("referral_code").unique(),
  referredByCode: text("referred_by_code"),
  logoPath: text("logo_path"),
  quoteTemplatePath: text("quote_template_path"),
  invoiceTemplatePath: text("invoice_template_path"),
  activeFeatures: text("active_features").array(),
  meetingConfig: jsonb("meeting_config"),
  estimatorConfig: jsonb("estimator_config"),
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
  activeCompanyId: integer("active_company_id").references(() => companiesTable.id),
  systemRole: text("system_role"), // null = regular user, 'super_admin' = global admin
  pushToken: text("push_token"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// ── User Memberships (multi-tenancy) ──────────────────────────────────────────

export const memberPermissionsSchema = z.object({
  viewQuotes: z.boolean().optional(),
  viewTimesheets: z.boolean().optional(),
  viewFinancials: z.boolean().optional(),
  viewDocuments: z.boolean().optional(),
  viewSchedules: z.boolean().optional(),
  viewClientMessages: z.boolean().optional(),
  viewRiskTab: z.boolean().optional(),
  viewSafetyTab: z.boolean().optional(),
  viewInspectTab: z.boolean().optional(),
  manageQuotes: z.boolean().optional(),
  submitExpenses: z.boolean().optional(),
  viewAllProjects: z.boolean().optional(),
});
export type MemberPermissions = z.infer<typeof memberPermissionsSchema>;

export const userMembershipsTable = pgTable(
  "user_memberships",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("worker"),
    isActive: boolean("is_active").notNull().default(true),
    permissions: jsonb("permissions").$type<MemberPermissions>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const insertUserMembershipSchema = createInsertSchema(
  userMembershipsTable,
).omit({
  createdAt: true,
});
export type InsertUserMembership = z.infer<typeof insertUserMembershipSchema>;
export type UserMembership = typeof userMembershipsTable.$inferSelect;

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

// ── Contacts (CRM) ────────────────────────────────────────────────────────────

export const contactTypeEnum = pgEnum("contact_type", [
  "client",
  "worker",
  "subcontractor",
  "supplier",
]);

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email"),
  type: contactTypeEnum("type").notNull().default("client"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;

// ── Leads ─────────────────────────────────────────────────────────────────────

export const leadStageEnum = pgEnum("lead_stage", [
  "new_lead",
  "contacted",
  "estimate_scheduled",
  "proposal_sent",
  "won",
  "lost",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "referral",
  "website",
  "ads",
  "social_media",
  "cold_call",
  "other",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "email",
  "meeting",
  "note",
]);

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contactsTable.id),
  title: text("title").notNull(),
  source: leadSourceEnum("source").notNull().default("other"),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  stage: leadStageEnum("stage").notNull().default("new_lead"),
  notes: text("notes"),
  convertedProjectId: integer("converted_project_id").references(
    () => projectsTable.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

export const leadActivitiesTable = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leadsTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  type: activityTypeEnum("type").notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeadActivitySchema = createInsertSchema(
  leadActivitiesTable,
).omit({ id: true, createdAt: true });
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;
export type LeadActivity = typeof leadActivitiesTable.$inferSelect;

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
  "processing_ocr",
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
  extractedText: text("extracted_text"),
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
  projectId: integer("project_id").references(() => projectsTable.id),
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
  clientCompanyName: text("client_company_name"),
  clientAddress: text("client_address"),
  clientPhone: text("client_phone"),
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
  assignedToUserId: integer("assigned_to_user_id").references(() => usersTable.id),
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  convertedAt: timestamp("converted_at"),
  // E-signature audit trail
  signatureData: text("signature_data"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  signedAt: timestamp("signed_at"),
  publicToken: text("public_token").unique(),
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
  assignedToUserId: integer("assigned_to_user_id").references(() => usersTable.id),
  // E-signature audit trail
  signatureData: text("signature_data"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  signedAt: timestamp("signed_at"),
  publicToken: text("public_token").unique(),
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

// ── Time Entries ──────────────────────────────────────────────────────────────

export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  date: date("date").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntriesTable).omit({ id: true, createdAt: true });
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntriesTable.$inferSelect;

// ── Timesheets ─────────────────────────────────────────────────────────────────

export const timesheetsTable = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  weekStart: date("week_start").notNull(), // Monday YYYY-MM-DD
  status: text("status").notNull().default("submitted"), // submitted | approved | denied
  totalHours: numeric("total_hours", { precision: 7, scale: 2 }).notNull().default("0"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  description: text("description"), // worker's description of work done that week
  notes: text("notes"), // denial reason or reviewer comment
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  // E-signature audit trail
  signatureData: text("signature_data"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Timesheet = typeof timesheetsTable.$inferSelect;

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

// ── Client Portal Messages ────────────────────────────────────────────────────

export const clientPortalMessagesTable = pgTable("client_portal_messages", {
  id: serial("id").primaryKey(),
  portalTokenId: integer("portal_token_id")
    .notNull()
    .references(() => clientPortalTokensTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  senderRole: text("sender_role").notNull(), // "client" | "contractor"
  senderName: text("sender_name"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClientPortalMessage = typeof clientPortalMessagesTable.$inferSelect;

// ── Plans ─────────────────────────────────────────────────────────────────────

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: numeric("yearly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  maxSeats: integer("max_seats").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  stripeProductId: text("stripe_product_id"),
  stripeMonthlyPriceId: text("stripe_monthly_price_id"),
  stripeYearlyPriceId: text("stripe_yearly_price_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({
  id: true,
  createdAt: true,
  stripeProductId: true,
  stripeMonthlyPriceId: true,
  stripeYearlyPriceId: true,
});
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;

// ── Features ──────────────────────────────────────────────────────────────────

export const featuresTable = pgTable("features", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  description: text("description"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeatureSchema = createInsertSchema(featuresTable).omit({ id: true, createdAt: true });
export type InsertFeature = z.infer<typeof insertFeatureSchema>;
export type Feature = typeof featuresTable.$inferSelect;

// ── Plan Features ─────────────────────────────────────────────────────────────

export const planFeaturesTable = pgTable(
  "plan_features",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull().references(() => plansTable.id, { onDelete: "cascade" }),
    featureId: integer("feature_id").notNull().references(() => featuresTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.planId, t.featureId)],
);

export type PlanFeature = typeof planFeaturesTable.$inferSelect;

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plansTable.id),
  status: text("status").notNull().default("active"), // active | trial | past_due | cancelled | inactive
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  currentPeriodStart: timestamp("current_period_start").defaultNow(),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;

// ── Safety & Incident Management ──────────────────────────────────────────────

export const formTemplatesTable = pgTable("form_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // safety | injury | hazard | toolbox
  schema: json("schema").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type FormTemplate = typeof formTemplatesTable.$inferSelect;

export const formSubmissionsTable = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => formTemplatesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id"),
  contactId: integer("contact_id").references(() => contactsTable.id),
  data: json("data").notNull(),
  status: text("status").notNull().default("draft"), // draft | submitted | reviewed | approved
  aiSummary: text("ai_summary"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormSubmission = typeof formSubmissionsTable.$inferSelect;

export const submissionPhotosTable = pgTable("submission_photos", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => formSubmissionsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  objectPath: text("object_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type SubmissionPhoto = typeof submissionPhotosTable.$inferSelect;

export const submissionCommentsTable = pgTable("submission_comments", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => formSubmissionsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type SubmissionComment = typeof submissionCommentsTable.$inferSelect;

// ── Estimates ─────────────────────────────────────────────────────────────────

// ── 3D Site Scans ─────────────────────────────────────────────────────────────

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  name: text("name"),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  sourceType: text("source_type").notNull().default("file"), // "file" | "video_capture"
  status: text("status").notNull().default("ready"),          // "ready" | "processing"
  thumbnailPath: text("thumbnail_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Scan = typeof scansTable.$inferSelect;

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  scopeText: text("scope_text"),
  sourceType: text("source_type").notNull().default("text"), // "text" | "file" | "smart" | "scan"
  sourceFilename: text("source_filename"),
  result: json("result"),
  status: text("status").notNull().default("generating"), // "generating" | "ready" | "failed"
  scanId: integer("scan_id").references(() => scansTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Estimate = typeof estimatesTable.$inferSelect;

// ── Estimate Builder + Proposals ──────────────────────────────────────────────

export const builderEstimatesTable = pgTable("builder_estimates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  title: text("title").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type BuilderEstimate = typeof builderEstimatesTable.$inferSelect;

export const builderEstimateItemsTable = pgTable("builder_estimate_items", {
  id: serial("id").primaryKey(),
  estimateId: integer("estimate_id")
    .notNull()
    .references(() => builderEstimatesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  margin: numeric("margin", { precision: 5, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type BuilderEstimateItem = typeof builderEstimateItemsTable.$inferSelect;

export const estimateTemplatesTable = pgTable("estimate_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EstimateTemplate = typeof estimateTemplatesTable.$inferSelect;

export const estimateTemplateItemsTable = pgTable("estimate_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => estimateTemplatesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  margin: numeric("margin", { precision: 5, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type EstimateTemplateItem = typeof estimateTemplateItemsTable.$inferSelect;

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  builderEstimateId: integer("builder_estimate_id")
    .notNull()
    .references(() => builderEstimatesTable.id),
  title: text("title").notNull(),
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft | sent | approved | rejected
  approvedAt: timestamp("approved_at"),
  approvedByName: text("approved_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Proposal = typeof proposalsTable.$inferSelect;

// ── TradeHub (Cross-Tenant Social + Job Board) ────────────────────────────────

export const tradehubProfilesTable = pgTable("tradehub_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companiesTable.id),
  displayName: text("display_name").notNull(),
  trade: text("trade"), // e.g. Electrician, Plumber, General Contractor
  location: text("location"),
  province: text("province"),
  bio: text("bio"),
  website: text("website"),
  isVerified: boolean("is_verified").notNull().default(false),
  avatarUrl: text("avatar_url"),
  voiceIntroUrl: text("voice_intro_url"),
  voiceIntroObjectPath: text("voice_intro_object_path"),
  voiceIntroDuration: integer("voice_intro_duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TradehubProfile = typeof tradehubProfilesTable.$inferSelect;

export const tradehubSavedCalculationsTable = pgTable("tradehub_saved_calculations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  calculatorId: text("calculator_id").notNull(),
  calculatorName: text("calculator_name").notNull(),
  category: text("category").notNull(),
  inputs: jsonb("inputs").notNull().default({}),
  results: jsonb("results").notNull().default([]),
  summary: text("summary").notNull().default(""),
  aiSummary: text("ai_summary"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TradehubSavedCalculation = typeof tradehubSavedCalculationsTable.$inferSelect;

export const tradehubPostsTable = pgTable("tradehub_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  companyId: integer("company_id").references(() => companiesTable.id),
  type: text("type").notNull().default("discussion"), // discussion | job | showcase
  title: text("title").notNull(),
  content: text("content").notNull(),
  trade: text("trade"),
  location: text("location"),
  province: text("province"),
  budget: text("budget"), // for job posts
  jobType: text("job_type"), // full-time | contract | subcontract
  visibility: text("visibility").notNull().default("public"), // public | local
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TradehubPost = typeof tradehubPostsTable.$inferSelect;

export const tradehubPostMediaTable = pgTable("tradehub_post_media", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => tradehubPostsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  objectPath: text("object_path"),
  mediaType: text("media_type").notNull().default("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tradehubCommentsTable = pgTable("tradehub_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => tradehubPostsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TradehubComment = typeof tradehubCommentsTable.$inferSelect;

export const tradehubReactionsTable = pgTable(
  "tradehub_reactions",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").notNull().references(() => tradehubPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    type: text("type").notNull().default("like"),
  },
  (t) => [unique().on(t.postId, t.userId)],
);

export const tradehubJobApplicationsTable = pgTable("tradehub_job_applications", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => tradehubPostsTable.id, { onDelete: "cascade" }),
  applicantId: integer("applicant_id").notNull().references(() => usersTable.id),
  message: text("message"),
  status: text("status").notNull().default("pending"), // pending | reviewed | accepted | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TradehubJobApplication = typeof tradehubJobApplicationsTable.$inferSelect;

export const tradehubReportsTable = pgTable("tradehub_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  targetType: text("target_type").notNull(), // post | comment | user
  targetId: integer("target_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tradehubNotificationsTable = pgTable("tradehub_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(), // comment | reaction | application | application_update
  referenceId: integer("reference_id"),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TradehubNotification = typeof tradehubNotificationsTable.$inferSelect;

export const tradehubConversationsTable = pgTable("tradehub_conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TradehubConversation = typeof tradehubConversationsTable.$inferSelect;

export const tradehubConversationParticipantsTable = pgTable(
  "tradehub_conversation_participants",
  {
    conversationId: integer("conversation_id").notNull().references(() => tradehubConversationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

// ── File Attachments ──────────────────────────────────────────────────────────

export const fileAttachmentsTable = pgTable("file_attachments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  uploadedByUserId: integer("uploaded_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  entityType: text("entity_type").notNull(), // project | contact | task | form_submission
  entityId: integer("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  objectPath: text("object_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type FileAttachment = typeof fileAttachmentsTable.$inferSelect;

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoicesTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: text("method").notNull().default("other"), // cash | cheque | e-transfer | credit_card | other
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Payment = typeof paymentsTable.$inferSelect;

// ── Change Orders ─────────────────────────────────────────────────────────────

export const changeOrdersTable = pgTable("change_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  requestedByUserId: integer("requested_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ChangeOrder = typeof changeOrdersTable.$inferSelect;

// ── Tradehub Messages ─────────────────────────────────────────────────────────
export const tradehubMessagesTable = pgTable("tradehub_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => tradehubConversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TradehubMessage = typeof tradehubMessagesTable.$inferSelect;

// ── AI Smart Estimator — Cost Models ─────────────────────────────────────────

export const estimatorCostModelsTable = pgTable("estimator_cost_models", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  projectType: text("project_type").notNull(),
  finishLevel: text("finish_level").notNull(), // basic | standard | premium | luxury
  name: text("name").notNull(),
  baseCostPerSqft: numeric("base_cost_per_sqft", { precision: 10, scale: 2 }).notNull(),
  laborCostPerSqft: numeric("labor_cost_per_sqft", { precision: 10, scale: 2 }).notNull(),
  materialCostPerSqft: numeric("material_cost_per_sqft", { precision: 10, scale: 2 }).notNull(),
  overheadPct: numeric("overhead_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  contingencyPct: numeric("contingency_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  notes: text("notes"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type EstimatorCostModel = typeof estimatorCostModelsTable.$inferSelect;

export const estimatorAddonsTable = pgTable("estimator_addons", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  addonKey: text("addon_key").notNull(),
  description: text("description"),
  costType: text("cost_type").notNull().default("flat"), // flat | per_sqft
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  applicableTypes: text("applicable_types"), // null = all, comma-sep project types
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EstimatorAddon = typeof estimatorAddonsTable.$inferSelect;

export const estimatorActualsTable = pgTable("estimator_actuals", {
  id: serial("id").primaryKey(),
  estimateId: integer("estimate_id")
    .notNull()
    .references(() => estimatesTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }).notNull(),
  actualCost: numeric("actual_cost", { precision: 12, scale: 2 }).notNull(),
  variancePct: numeric("variance_pct", { precision: 8, scale: 2 }),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
export type EstimatorActual = typeof estimatorActualsTable.$inferSelect;

// ── Equipment ─────────────────────────────────────────────────────────────────

export const equipmentTable = pgTable("equipment", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"), // excavator | lift | crane | truck | tools | other
  status: text("status").notNull().default("available"), // available | in_use | maintenance | retired
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEquipmentSchema = createInsertSchema(equipmentTable).omit({ id: true, createdAt: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipmentTable.$inferSelect;

// ── Schedule Events (meetings, equipment bookings, site visits) ───────────────

export const scheduleEventsTable = pgTable("schedule_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("meeting"), // meeting | equipment_booking | site_visit | inspection | other
  title: text("title").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location"),
  notes: text("notes"),
  meetingPlatform: text("meeting_platform"), // google_meet | zoom | teams
  meetingLink: text("meeting_link"),
  status: text("status").notNull().default("scheduled"), // scheduled | in_progress | completed | cancelled
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduleEventSchema = createInsertSchema(scheduleEventsTable).omit({ id: true, createdAt: true });
export type InsertScheduleEvent = z.infer<typeof insertScheduleEventSchema>;
export type ScheduleEvent = typeof scheduleEventsTable.$inferSelect;

// ── Schedule Event Assignees (users or equipment linked to events) ─────────────

export const scheduleEventAssigneesTable = pgTable("schedule_event_assignees", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => scheduleEventsTable.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(), // user | equipment
  resourceId: integer("resource_id").notNull(),
});

export type ScheduleEventAssignee = typeof scheduleEventAssigneesTable.$inferSelect;

// ── Task Dependencies ──────────────────────────────────────────────────────────

export const taskDependenciesTable = pgTable(
  "task_dependencies",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    dependsOnTaskId: integer("depends_on_task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.taskId, t.dependsOnTaskId)],
);

export type TaskDependency = typeof taskDependenciesTable.$inferSelect;

// ── AI Inspections ─────────────────────────────────────────────────────────────

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id),
  inspectorId: integer("inspector_id").notNull().references(() => usersTable.id),
  inspectionType: text("inspection_type").notNull().default("general"), // general | safety | quality | progress | electrical | structural | fire | environmental
  date: date("date").notNull(),
  score: integer("score"), // 0-100
  status: text("status").notNull().default("draft"), // draft | submitted
  aiSummary: text("ai_summary"),
  riskLevel: text("risk_level"), // Low | Medium | High | Critical
  riskScore: numeric("risk_score", { precision: 4, scale: 1 }), // 0-10
  failedItemAnalysis: text("failed_item_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Inspection = typeof inspectionsTable.$inferSelect;

export const inspectionItemsTable = pgTable("inspection_items", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull().references(() => inspectionsTable.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  status: text("status").notNull().default("pass"), // pass | fail | na
  severity: text("severity").notNull().default("low"), // low | medium | high
  comment: text("comment"),
  photoUrl: text("photo_url"),
});
export type InspectionItem = typeof inspectionItemsTable.$inferSelect;

export const inspectionAlertsTable = pgTable("inspection_alerts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id),
  inspectionId: integer("inspection_id").notNull().references(() => inspectionsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // risk | failure | pattern
  message: text("message").notNull(),
  severity: text("severity").notNull(), // low | medium | high | critical
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectNotesTable = pgTable("project_notes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ProjectNote = typeof projectNotesTable.$inferSelect;
export type InspectionAlert = typeof inspectionAlertsTable.$inferSelect;

// ── Field Automation ────────────────────────────────────────────────────────────

export const dailyLogsTable = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  foremanId: integer("foreman_id")
    .notNull()
    .references(() => usersTable.id),
  notes: text("notes"),
  weatherTemp: text("weather_temp"),
  weatherCondition: text("weather_condition"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable).omit({ id: true, createdAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;

export const sitePhotosTable = pgTable("site_photos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  markupData: jsonb("markup_data"),
  roomLocation: text("room_location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSitePhotoSchema = createInsertSchema(sitePhotosTable).omit({ id: true, createdAt: true });
export type InsertSitePhoto = z.infer<typeof insertSitePhotoSchema>;
export type SitePhoto = typeof sitePhotosTable.$inferSelect;

export const safetySignoffsTable = pgTable("safety_signoffs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  workerId: integer("worker_id")
    .notNull()
    .references(() => usersTable.id),
  responses: jsonb("responses").notNull(),
  signatureUrl: text("signature_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSafetySignoffSchema = createInsertSchema(safetySignoffsTable).omit({ id: true, createdAt: true });
export type InsertSafetySignoff = z.infer<typeof insertSafetySignoffSchema>;
export type SafetySignoff = typeof safetySignoffsTable.$inferSelect;

// ── Provider OAuth Tokens ──────────────────────────────────────────────────────

export const providerTokenTypeEnum = pgEnum("provider_token_type", [
  "google",
  "outlook",
]);

export const providerTokensTable = pgTable("provider_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: providerTokenTypeEnum("provider").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenData: jsonb("token_data"), // provider-specific extra fields
  expiresAt: timestamp("expires_at"),
  scopes: text("scopes").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProviderToken = typeof providerTokensTable.$inferSelect;
export type InsertProviderToken = Omit<ProviderToken, "id" | "createdAt" | "updatedAt">;

export const insertProviderTokenSchema = createInsertSchema(providerTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ── Media Hub (additive, isolated visual annotation engine) ───────────────────
export const mediaHubPhotosTable = pgTable("media_hub_photos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  uploadedById: integer("uploaded_by_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull(),
  roomLocation: text("room_location"),
  markupData: jsonb("markup_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMediaHubPhotoSchema = createInsertSchema(mediaHubPhotosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMediaHubPhoto = z.infer<typeof insertMediaHubPhotoSchema>;
export type MediaHubPhoto = typeof mediaHubPhotosTable.$inferSelect;
