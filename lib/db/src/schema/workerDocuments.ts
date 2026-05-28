import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, companiesTable } from "./index";

export const workerDocumentsTable = pgTable(
  "worker_documents",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    fileUrl: text("file_url").notNull(),
    filePath: text("file_path"),
    expirationDate: date("expiration_date", { mode: "date" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_worker_docs_worker").on(table.workerId),
    index("idx_worker_docs_company").on(table.companyId),
    index("idx_worker_docs_type").on(table.documentType),
    index("idx_worker_docs_status").on(table.status),
    index("idx_worker_docs_company_worker").on(table.companyId, table.workerId),
  ],
);

export const insertWorkerDocumentSchema = createInsertSchema(workerDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkerDocument = z.infer<typeof insertWorkerDocumentSchema>;
export type WorkerDocument = typeof workerDocumentsTable.$inferSelect;
