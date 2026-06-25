import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  date,
  jsonb,
  boolean,
  unique,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable, projectsTable, tasksTable } from "./index";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const ihsaElementEnum = pgEnum("ihsa_element", [
  "element_1",  // Management Leadership & Organizational Commitment
  "element_2",  // Hazard Identification, Assessment & Control (PPE)
  "element_3",  // Hazard Control Measures
  "element_4",  // Ongoing Inspections
  "element_5",  // Qualifications, Orientations & Training
  "element_6",  // Emergency Response
  "element_7",  // Incident Reporting & Investigation
  "element_8",  // Program Administration
  "element_9",  // Worker Participation
  "element_10", // Workplace Housekeeping
  "element_11", // Environmental Protection
  "element_12", // Safety Equipment & First Aid
  "element_13", // Fire Safety & Fire Extinguishers
  "element_14", // WHMIS & Controlled Products
  "element_15", // Contractor Management
  "element_16", // Medical Management
  "element_17", // Joint Health & Safety Committee
  "element_18", // Occupational Health
  "element_19", // Records & Statistics
]);

export const corCredentialTypeEnum = pgEnum("cor_credential_type", [
  "working_at_heights",
  "whmis",
  "cor_training",
  "first_aid",
  "fall_protection",
  "confined_space",
  "elevated_work_platform",
]);

export const corCredentialStatusEnum = pgEnum("cor_credential_status", [
  "active",
  "expired",
  "pending",
  "revoked",
]);

export const corSourceTypeEnum = pgEnum("cor_source_type", [
  "form_submission",
  "inspection",
  "safety_signoff",
  "daily_log",
]);

export const corRiskLevelEnum = pgEnum("cor_risk_level", [
  "critical",
  "high",
  "medium",
  "low",
]);

// ── Tables ────────────────────────────────────────────────────────────────────

export const workerCredentialsTable = pgTable(
  "worker_credentials",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    credentialType: corCredentialTypeEnum("credential_type").notNull(),
    certificateNumber: text("certificate_number"),
    issueDate: date("issue_date"),
    expirationDate: date("expiration_date"),
    status: corCredentialStatusEnum("status").notNull().default("active"),
    documentUrl: text("document_url"),
    issuedBy: text("issued_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Unique per worker per credential type — enables ON CONFLICT DO UPDATE
    uniqueIndex("worker_credentials_unique_idx").on(t.companyId, t.userId, t.credentialType),
    index("idx_worker_credentials_company_id").on(t.companyId),
    index("idx_worker_credentials_company_user").on(t.companyId, t.userId),
    index("idx_worker_credentials_expiration").on(t.expirationDate),
    index("idx_worker_credentials_status").on(t.status),
  ],
);

export const corAuditTrailTable = pgTable(
  "cor_audit_trail",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    // Denormalized: who submitted the source record — enables worker self-scoped queries
    submittedByUserId: integer("submitted_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    sourceType: corSourceTypeEnum("source_type").notNull(),
    sourceRecordId: integer("source_record_id").notNull(),
    ihsaElement: ihsaElementEnum("ihsa_element").notNull(),
    ihsaElementName: text("ihsa_element_name").notNull(),
    findingType: text("finding_type").notNull(), // "pass" | "fail"
    findingDescription: text("finding_description").notNull(),
    complianceScore: integer("compliance_score").notNull(), // 0–100
    evidenceSnapshot: jsonb("evidence_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Named unique constraint required for Drizzle .onConflictDoUpdate() target resolution
    unique("uq_cor_audit_trail_idempotency").on(
      t.companyId,
      t.sourceType,
      t.sourceRecordId,
      t.ihsaElement,
    ),
    index("idx_cor_audit_trail_company_project").on(t.companyId, t.projectId),
    index("idx_cor_audit_trail_company_id").on(t.companyId),
    index("idx_cor_audit_trail_submitted_by").on(t.companyId, t.submittedByUserId),
    index("idx_cor_audit_trail_ihsa_element").on(t.ihsaElement),
    index("idx_cor_audit_trail_created_at").on(t.createdAt),
    index("idx_cor_audit_trail_company_created").on(t.companyId, t.createdAt),
  ],
);

export const corVoiceActionLogsTable = pgTable(
  "cor_voice_action_logs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    submittedByUserId: integer("submitted_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    rawTranscript: text("raw_transcript").notNull(),
    riskLevel: corRiskLevelEnum("risk_level").notNull(),
    ihsaElement: ihsaElementEnum("ihsa_element"), // nullable — classification may not always resolve
    correctedTaskId: integer("corrected_task_id").references(() => tasksTable.id, {
      onDelete: "set null",
    }),
    assignedToUserId: integer("assigned_to_user_id").references(() => usersTable.id),
    dueDate: date("due_date"),
    aiClassification: jsonb("ai_classification"), // full LLM response stored for audit trail
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_cor_voice_logs_company_project").on(t.companyId, t.projectId),
    index("idx_cor_voice_logs_user").on(t.companyId, t.submittedByUserId),
    index("idx_cor_voice_logs_risk_level").on(t.riskLevel),
    index("idx_cor_voice_logs_company_created").on(t.companyId, t.createdAt),
  ],
);

// ── Audit Package tables ──────────────────────────────────────────────────────

export const corAuditPackageStatusEnum = pgEnum("cor_audit_package_status", [
  "generating",
  "ready",
  "failed",
]);

export const corAuditPackagesTable = pgTable(
  "cor_audit_packages",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    generatedByUserId: integer("generated_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    label: text("label").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    projectIds: jsonb("project_ids"), // number[] | null — used for re-download
    status: corAuditPackageStatusEnum("status").notNull().default("generating"),
    fileSizeBytes: integer("file_size_bytes"),
    totalEntries: integer("total_entries").notNull().default(0),
    totalInspections: integer("total_inspections").notNull().default(0),
    totalWorkers: integer("total_workers").notNull().default(0),
    elementSummary: jsonb("element_summary"),
    checksum: text("checksum"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_cor_audit_packages_company").on(t.companyId),
    index("idx_cor_audit_packages_status").on(t.companyId, t.status),
  ],
);

// Append-only tamper-evident log using SHA-256 chain hashing
export const corAuditLogEntriesTable = pgTable(
  "cor_audit_log_entries",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    packageId: integer("package_id").references(() => corAuditPackagesTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    metadata: jsonb("metadata"),
    // SHA-256(prev_chain_hash || JSON(this entry's fields)) — forms a verifiable chain
    chainHash: text("chain_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_cor_audit_log_company_time").on(t.companyId, t.createdAt),
    index("idx_cor_audit_log_package").on(t.packageId),
  ],
);

export type CorAuditPackage = typeof corAuditPackagesTable.$inferSelect;
export type CorAuditLogEntry = typeof corAuditLogEntriesTable.$inferSelect;

// ── Policy Documents & Sign-offs ──────────────────────────────────────────────

export const corDocumentTypeEnum = pgEnum("cor_document_type", [
  "swp",           // Safe Work Procedure
  "jha",           // Job Hazard Analysis
  "company_rules", // Company Rules / Code of Conduct
  "policy",        // General Policy / Orientation document
]);

export const policyDocumentsTable = pgTable(
  "policy_documents",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    documentType: corDocumentTypeEnum("document_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    fileUrl: text("file_url"),
    contentText: text("content_text"),
    ihsaElement: ihsaElementEnum("ihsa_element").notNull(),
    requiresAnnualRenewal: boolean("requires_annual_renewal").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
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
    index("idx_policy_docs_company").on(t.companyId),
    index("idx_policy_docs_company_type").on(t.companyId, t.documentType),
    index("idx_policy_docs_active").on(t.companyId, t.isActive),
  ],
);

export const policySignoffsTable = pgTable(
  "policy_signoffs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    policyDocumentId: integer("policy_document_id")
      .notNull()
      .references(() => policyDocumentsTable.id, { onDelete: "cascade" }),
    workerUserId: integer("worker_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    signatureData: text("signature_data"),
    isValid: boolean("is_valid").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_policy_signoff_worker_doc").on(t.policyDocumentId, t.workerUserId),
    index("idx_policy_signoffs_company").on(t.companyId),
    index("idx_policy_signoffs_document").on(t.policyDocumentId),
    index("idx_policy_signoffs_worker").on(t.workerUserId),
    index("idx_policy_signoffs_company_worker").on(t.companyId, t.workerUserId),
  ],
);

export const insertPolicyDocumentSchema = createInsertSchema(policyDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPolicyDocument = z.infer<typeof insertPolicyDocumentSchema>;
export type PolicyDocument = typeof policyDocumentsTable.$inferSelect;

export const insertPolicySignoffSchema = createInsertSchema(policySignoffsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPolicySignoff = z.infer<typeof insertPolicySignoffSchema>;
export type PolicySignoff = typeof policySignoffsTable.$inferSelect;

// ── Subcontractor Compliance ──────────────────────────────────────────────────

export const subcontractorTradeTypeEnum = pgEnum("subcontractor_trade_type", [
  "electrical", "plumbing", "hvac", "concrete", "framing", "drywall",
  "roofing", "masonry", "excavation", "landscaping", "painting", "flooring",
  "mechanical", "fire_protection", "steel_erection", "insulation", "glazing",
  "general", "other",
]);

export const subcontractorComplianceStatusEnum = pgEnum("subcontractor_compliance_status", [
  "compliant", "non_compliant", "expired", "pending",
]);

export const subcontractorDocTypeEnum = pgEnum("subcontractor_doc_type", [
  "wsib_clearance", "safety_manual", "insurance_certificate",
  "health_safety_policy", "cor_certificate", "other",
]);

export const subcontractorDocStatusEnum = pgEnum("subcontractor_doc_status", [
  "valid", "expired", "pending", "rejected",
]);

export const subcontractorsTable = pgTable(
  "subcontractors",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    tradeType: subcontractorTradeTypeEnum("trade_type").notNull(),
    overallStatus: subcontractorComplianceStatusEnum("overall_status").notNull().default("pending"),
    notes: text("notes"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_subcontractors_company").on(t.companyId),
    index("idx_subcontractors_status").on(t.companyId, t.overallStatus),
  ],
);

export const subcontractorDocsTable = pgTable(
  "subcontractor_docs",
  {
    id: serial("id").primaryKey(),
    subcontractorId: integer("subcontractor_id").notNull()
      .references(() => subcontractorsTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    docType: subcontractorDocTypeEnum("doc_type").notNull(),
    docStatus: subcontractorDocStatusEnum("doc_status").notNull().default("pending"),
    documentUrl: text("document_url"),
    issueDate: text("issue_date"),
    expiryDate: text("expiry_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_sub_doc_type").on(t.subcontractorId, t.docType),
    index("idx_subdocs_sub").on(t.subcontractorId),
    index("idx_subdocs_company").on(t.companyId),
  ],
);

export const insertSubcontractorSchema = createInsertSchema(subcontractorsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type Subcontractor = typeof subcontractorsTable.$inferSelect;

export const insertSubcontractorDocSchema = createInsertSchema(subcontractorDocsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertSubcontractorDoc = z.infer<typeof insertSubcontractorDocSchema>;
export type SubcontractorDoc = typeof subcontractorDocsTable.$inferSelect;

// ── Insert schemas & types ────────────────────────────────────────────────────

export const insertWorkerCredentialSchema = createInsertSchema(workerCredentialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkerCredential = z.infer<typeof insertWorkerCredentialSchema>;
export type WorkerCredential = typeof workerCredentialsTable.$inferSelect;

export const insertCorAuditTrailSchema = createInsertSchema(corAuditTrailTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCorAuditTrail = z.infer<typeof insertCorAuditTrailSchema>;
export type CorAuditTrail = typeof corAuditTrailTable.$inferSelect;

export const insertCorVoiceActionLogSchema = createInsertSchema(corVoiceActionLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCorVoiceActionLog = z.infer<typeof insertCorVoiceActionLogSchema>;
export type CorVoiceActionLog = typeof corVoiceActionLogsTable.$inferSelect;

// ── CAPA (Corrective & Preventive Actions) ────────────────────────────────────

export const capaStatusEnum = pgEnum("capa_status", [
  "open", "in_progress", "pending_review", "closed", "void",
]);

export const capaPriorityEnum = pgEnum("capa_priority", [
  "critical", "high", "medium", "low",
]);

export const capaSourceTypeEnum = pgEnum("capa_source_type", [
  "audit_trail", "inspection", "manual", "voice_log",
]);

export const capaTicketsTable = pgTable(
  "capa_tickets",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    sourceType: capaSourceTypeEnum("source_type").notNull().default("manual"),
    sourceRecordId: integer("source_record_id"),
    sourceItemRef: text("source_item_ref"), // per-item dedup key (e.g. inspection item name)
    ihsaElement: ihsaElementEnum("ihsa_element"),
    priority: capaPriorityEnum("priority").notNull().default("medium"),
    status: capaStatusEnum("status").notNull().default("open"),
    assignedToUserId: integer("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: text("due_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: integer("closed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    closureNotes: text("closure_notes"),
    evidencePhotoUrl: text("evidence_photo_url"),
    isLocked: boolean("is_locked").notNull().default(false),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_capa_company").on(t.companyId),
    index("idx_capa_status").on(t.companyId, t.status),
    index("idx_capa_assigned").on(t.assignedToUserId),
    index("idx_capa_source").on(t.sourceRecordId),
  ],
);

export const insertCapaTicketSchema = createInsertSchema(capaTicketsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCapaTicket = z.infer<typeof insertCapaTicketSchema>;
export type CapaTicket = typeof capaTicketsTable.$inferSelect;

// ── Credential Expiry Alert Log ───────────────────────────────────────────────

export const credentialAlertLogsTable = pgTable(
  "credential_alert_logs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    credentialType: text("credential_type").notNull(),
    alertType: text("alert_type").notNull(),     // "60_day" | "30_day" | "expired"
    sentForExpiry: text("sent_for_expiry").notNull(), // expiry date this alert targeted
    sentToEmail: text("sent_to_email"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("uq_credential_alert").on(t.companyId, t.userId, t.credentialType, t.alertType, t.sentForExpiry),
    index("idx_alert_logs_user").on(t.userId),
    index("idx_alert_logs_company").on(t.companyId),
  ],
);
export type CredentialAlertLog = typeof credentialAlertLogsTable.$inferSelect;

// ── External Auditor Tokens ───────────────────────────────────────────────────

export const externalAuditorTokensTable = pgTable(
  "external_auditor_tokens",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    label: text("label").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    accessCount: integer("access_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_ext_auditor_tokens_company").on(t.companyId),
    uniqueIndex("idx_ext_auditor_tokens_token").on(t.token),
  ],
);

export type ExternalAuditorToken = typeof externalAuditorTokensTable.$inferSelect;
