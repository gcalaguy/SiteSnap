import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable, usersTable } from "./index";

export const documentTemplateTypeEnum = pgEnum("document_template_type", [
  "quote",
  "invoice",
  "rfi",
  "proposal",
  "change_order",
]);

export const documentTemplateFileTypeEnum = pgEnum("document_template_file_type", [
  "docx",
  "html",
  "pdf",
]);

// One row per (companyId, documentType) — the currently active custom
// template for that document type. Uploading a new file for a type that
// already has one replaces this row (see routes/documentTemplates.ts).
// "Reset to System Default" deletes the row rather than nulling a column,
// since this is a table (one per doc type) rather than a single column on
// companiesTable like the older logoPath/quoteTemplatePath/invoiceTemplatePath
// header-image fields, which this feature does not touch or replace.
export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  documentType: documentTemplateTypeEnum("document_type").notNull(),
  fileType: documentTemplateFileTypeEnum("file_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  // Merge tags found in the uploaded file, e.g. ["company_name","project_name"].
  // Informational for .pdf uploads (no merge substitution is performed for
  // raw PDFs — see documentTemplateRenderer.ts); authoritative for .docx/.html.
  detectedMergeTags: jsonb("detected_merge_tags").$type<string[]>().notNull().default([]),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("uniq_document_templates_company_type").on(t.companyId, t.documentType),
  index("idx_document_templates_company_id").on(t.companyId),
  pgPolicy("tenant_isolation", {
    as: "permissive",
    using: sql`current_tenant_id() IS NULL OR ${t.companyId} = current_tenant_id()`,
  }),
]).enableRLS();

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
export type DocumentTemplateType = (typeof documentTemplateTypeEnum.enumValues)[number];
export type DocumentTemplateFileType = (typeof documentTemplateFileTypeEnum.enumValues)[number];
