import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  pgPolicy,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable } from "./index";
import { subcontractorTradeTypeEnum } from "./cor";

// ── Project Communications Hub (Phase 1 — Email Integration Foundation) ───────

export const emailProviderEnum = pgEnum("email_provider", ["outlook", "gmail"]);
export const emailSyncFrequencyEnum = pgEnum("email_sync_frequency", [
  "15min",
  "hourly",
  "daily",
]);
export const emailAccountStatusEnum = pgEnum("email_account_status", [
  "active",
  "disconnected",
  "error",
  "reauth_required",
]);

// ── Project Communications Hub (Phase 2 — Intelligent Project Organization) ───

export const emailTriageStatusEnum = pgEnum("email_triage_status", [
  "unassigned",
  "suggested",
  "assigned",
  "archived",
  "ignored",
  "merged",
]);
export const emailMatchSourceEnum = pgEnum("email_match_source", ["engine", "rule", "manual"]);
export const emailPriorityEnum = pgEnum("email_priority", ["low", "medium", "high", "urgent"]);
export const filingRuleConditionLogicEnum = pgEnum("filing_rule_condition_logic", ["AND", "OR"]);

export interface MatchReason {
  signal: string;
  value: string;
  points: number;
}

export type FilingRuleField =
  | "subject"
  | "from_email"
  | "from_name"
  | "to_emails"
  | "cc_emails"
  | "body_text";
export type FilingRuleOperator = "contains" | "equals" | "starts_with";
export interface FilingRuleCondition {
  field: FilingRuleField;
  operator: FilingRuleOperator;
  value: string;
}
export type FilingRuleAction =
  | { type: "move_to_project"; projectId: number }
  | { type: "assign_category"; category: string };

export type CommunicationAttachmentType = "pdf" | "word" | "excel" | "image" | "cad";
export interface CommunicationSearchCriteria {
  keywords?: string;
  subject?: string;
  sender?: string;
  recipient?: string;
  client?: string;
  vendor?: string;
  address?: string;
  projectNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  attachmentTypes?: CommunicationAttachmentType[];
  priority?: "low" | "medium" | "high" | "urgent";
  flagged?: boolean;
  hasConversation?: boolean;
  projectId?: number | null;
}

// ── Project Communications Hub (Phase 3 — AI Communications Intelligence) ─────

export const projectSignalTypeEnum = pgEnum("project_signal_type", [
  "sender_email",
  "sender_domain",
  "subject_keyword",
]);

export interface EmailAiDeadline {
  description: string;
  date: string | null;
}

export interface EmailAiEntities {
  projectMentions: string[];
  clientMentions: string[];
  vendorMentions: string[];
  inspectionMentioned: boolean;
  permitNumbers: string[];
  invoiceNumbers: string[];
  quoteNumbers: string[];
  poNumbers: string[];
  changeOrderMentions: string[];
  deadlines: EmailAiDeadline[];
  risks: string[];
  actionItems: string[];
}

// drizzle-orm's pg-core has no built-in tsvector column type; define one via
// customType so emailMessagesTable.searchVector can be a proper GENERATED ALWAYS
// AS ... STORED column with a GIN index, instead of computing to_tsvector() at
// query time on every search (the pattern documents.ts uses, which doesn't scale
// to a large emails table).
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const emailAccountsTable = pgTable(
  "email_accounts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    connectedByUserId: integer("connected_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    provider: emailProviderEnum("provider").notNull(),
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name"),
    status: emailAccountStatusEnum("status").notNull().default("active"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array(),
    // Outlook: Graph delta query deltaLink (opaque URL). Gmail: historyId (numeric string).
    deltaCursor: text("delta_cursor"),
    selectedFolders: jsonb("selected_folders"), // string[] of provider folder/label ids
    syncFrequency: emailSyncFrequencyEnum("sync_frequency").notNull().default("hourly"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    nextSyncDueAt: timestamp("next_sync_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_email_accounts_company").on(t.companyId),
    index("idx_email_accounts_due").on(t.status, t.nextSyncDueAt),
    uniqueIndex("uq_email_accounts_company_provider_address").on(
      t.companyId,
      t.provider,
      t.emailAddress,
    ),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const emailThreadsTable = pgTable(
  "email_threads",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    emailAccountId: integer("email_account_id")
      .notNull()
      .references(() => emailAccountsTable.id, { onDelete: "cascade" }),
    // Null until a user manually assigns the thread to a project (Phase 1 has no
    // auto-matching — see the manual assign-project endpoint). Phase 2's matching
    // engine will populate this automatically.
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject"),
    participantEmails: text("participant_emails").array(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    messageCount: integer("message_count").notNull().default(0),
    // ── Phase 2: matching engine / triage state ──────────────────────────────
    triageStatus: emailTriageStatusEnum("triage_status").notNull().default("unassigned"),
    suggestedProjectId: integer("suggested_project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    matchConfidence: integer("match_confidence"),
    matchReasons: jsonb("match_reasons").$type<MatchReason[]>(),
    matchSource: emailMatchSourceEnum("match_source"),
    category: text("category"),
    flagged: boolean("flagged").notNull().default(false),
    priority: emailPriorityEnum("priority").notNull().default("medium"),
    mergedIntoThreadId: integer("merged_into_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_email_threads_company").on(t.companyId),
    index("idx_email_threads_project").on(t.projectId),
    index("idx_email_threads_triage_status").on(t.companyId, t.triageStatus),
    uniqueIndex("uq_email_threads_account_provider_thread").on(
      t.emailAccountId,
      t.providerThreadId,
    ),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const emailMessagesTable = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    emailAccountId: integer("email_account_id")
      .notNull()
      .references(() => emailAccountsTable.id, { onDelete: "cascade" }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => emailThreadsTable.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    fromEmail: text("from_email"),
    fromName: text("from_name"),
    toEmails: text("to_emails").array(),
    ccEmails: text("cc_emails").array(),
    subject: text("subject"),
    bodyText: text("body_text"),
    // Sanitized server-side before storing (raw provider HTML is untrusted input) —
    // see emailSyncService.ts. Phase 1 mobile UI renders bodyText only; bodyHtml is
    // stored now so a richer renderer can be added later without a backfill.
    bodyHtml: text("body_html"),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      () =>
        sql`setweight(to_tsvector('english', coalesce(subject, '')), 'A') || setweight(to_tsvector('english', coalesce(body_text, '')), 'B')`,
    ),
    // ── Phase 3: AI entity extraction / summarization ────────────────────────
    // Its own indexed column (not buried in aiEntities jsonb) since "Show all
    // plumbing emails"-style filtering needs a fast equality scan.
    aiTrade: subcontractorTradeTypeEnum("ai_trade"),
    aiSummary: text("ai_summary"),
    aiEntities: jsonb("ai_entities").$type<EmailAiEntities>(),
    // Null until processed by the extraction cron job; drives its work queue
    // (WHERE aiExtractedAt IS NULL). Pre-existing rows are stamped at migration
    // time so the job only ever picks up genuinely new messages — see 0079.
    aiExtractedAt: timestamp("ai_extracted_at", { withTimezone: true }),
    aiExtractionAttempts: integer("ai_extraction_attempts").notNull().default(0),
    aiExtractionError: text("ai_extraction_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_email_messages_company").on(t.companyId),
    index("idx_email_messages_thread").on(t.threadId),
    index("idx_email_messages_sent_at").on(t.sentAt),
    index("idx_email_messages_search_vector").using("gin", t.searchVector),
    index("idx_email_messages_company_trade").on(t.companyId, t.aiTrade),
    index("idx_email_messages_extracted_at").on(t.aiExtractedAt),
    uniqueIndex("uq_email_messages_account_provider_msg").on(
      t.emailAccountId,
      t.providerMessageId,
    ),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const emailAttachmentsTable = pgTable(
  "email_attachments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    messageId: integer("message_id")
      .notNull()
      .references(() => emailMessagesTable.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    // GCS object path only — bytes are never stored in the DB, per the convention
    // established by documents.ts / safetyScan.ts.
    objectPath: text("object_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_email_attachments_company").on(t.companyId),
    index("idx_email_attachments_message").on(t.messageId),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const projectMatchKeywordsTable = pgTable(
  "project_match_keywords",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_match_keywords_company").on(t.companyId),
    index("idx_project_match_keywords_project").on(t.projectId),
    uniqueIndex("uq_project_match_keywords_project_keyword").on(t.projectId, t.keyword),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const emailFilingRulesTable = pgTable(
  "email_filing_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    conditionLogic: filingRuleConditionLogicEnum("condition_logic").notNull().default("AND"),
    conditions: jsonb("conditions").$type<FilingRuleCondition[]>().notNull().default([]),
    actions: jsonb("actions").$type<FilingRuleAction[]>().notNull().default([]),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_email_filing_rules_company").on(t.companyId),
    index("idx_email_filing_rules_company_priority").on(t.companyId, t.priority),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const communicationSearchTemplatesTable = pgTable(
  "communication_search_templates",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    criteria: jsonb("criteria").$type<CommunicationSearchCriteria>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_communication_search_templates_company").on(t.companyId),
    uniqueIndex("uq_communication_search_templates_company_name").on(t.companyId, t.name),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const projectSignalWeightsTable = pgTable(
  "project_signal_weights",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    signalType: projectSignalTypeEnum("signal_type").notNull(),
    signalValue: text("signal_value").notNull(),
    // Incremented every time a manual assignment reinforces this pattern —
    // scoreProjectsForThread() reads this so matching confidence measurably
    // improves as more corrections land on the same sender/project pairing.
    weight: integer("weight").notNull().default(1),
    lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_signal_weights_company").on(t.companyId),
    index("idx_project_signal_weights_lookup").on(t.companyId, t.signalType, t.signalValue),
    uniqueIndex("uq_project_signal_weights_project_signal").on(
      t.companyId,
      t.projectId,
      t.signalType,
      t.signalValue,
    ),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export const emailThreadCorrectionsTable = pgTable(
  "email_thread_corrections",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => emailThreadsTable.id, { onDelete: "cascade" }),
    priorProjectId: integer("prior_project_id"),
    priorSuggestedProjectId: integer("prior_suggested_project_id"),
    priorMatchSource: emailMatchSourceEnum("prior_match_source"),
    priorMatchConfidence: integer("prior_match_confidence"),
    correctedProjectId: integer("corrected_project_id").notNull(),
    correctedByUserId: integer("corrected_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_email_thread_corrections_company").on(t.companyId),
    index("idx_email_thread_corrections_thread").on(t.threadId),
    pgPolicy("tenant_isolation", {
      as: "permissive",
      using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
    }),
  ],
).enableRLS();

export type ProjectSignalWeight = typeof projectSignalWeightsTable.$inferSelect;
export type EmailThreadCorrection = typeof emailThreadCorrectionsTable.$inferSelect;

export const insertProjectMatchKeywordSchema = createInsertSchema(projectMatchKeywordsTable).omit(
  { id: true, createdAt: true },
);
export type InsertProjectMatchKeyword = z.infer<typeof insertProjectMatchKeywordSchema>;
export type ProjectMatchKeyword = typeof projectMatchKeywordsTable.$inferSelect;

export const insertEmailFilingRuleSchema = createInsertSchema(emailFilingRulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailFilingRule = z.infer<typeof insertEmailFilingRuleSchema>;
export type EmailFilingRule = typeof emailFilingRulesTable.$inferSelect;

export const insertCommunicationSearchTemplateSchema = createInsertSchema(
  communicationSearchTemplatesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCommunicationSearchTemplate = z.infer<
  typeof insertCommunicationSearchTemplateSchema
>;
export type CommunicationSearchTemplate = typeof communicationSearchTemplatesTable.$inferSelect;

export const insertEmailAccountSchema = createInsertSchema(emailAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailAccount = typeof emailAccountsTable.$inferSelect;

export const insertEmailThreadSchema = createInsertSchema(emailThreadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;
export type EmailThread = typeof emailThreadsTable.$inferSelect;

export const insertEmailMessageSchema = createInsertSchema(emailMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type EmailMessage = typeof emailMessagesTable.$inferSelect;

export const insertEmailAttachmentSchema = createInsertSchema(emailAttachmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailAttachment = z.infer<typeof insertEmailAttachmentSchema>;
export type EmailAttachment = typeof emailAttachmentsTable.$inferSelect;
