import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable, projectsTable, usersTable } from "./index";

/**
 * Construction permits — single source of truth per permit.
 *
 * Each permit row is linked to exactly one company (tenant boundary) and one
 * project. The unique constraint on (companyId, projectId, title) guarantees
 * a permit is never duplicated: the same record serves both the company-wide
 * "global" view (owners/admins) and the project-scoped view (foremen).
 */
export const permitsTable = pgTable(
  "permits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    expirationDate: timestamp("expiration_date", { mode: "date" }),
    fileUrl: text("file_url"),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("uq_permits_company_project_title").on(
      t.companyId,
      t.projectId,
      t.title,
    ),
    index("idx_permits_company").on(t.companyId),
    index("idx_permits_company_project").on(t.companyId, t.projectId),
    index("idx_permits_expiration").on(t.expirationDate),
  ],
);

export const insertPermitSchema = createInsertSchema(permitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPermit = z.infer<typeof insertPermitSchema>;
export type Permit = typeof permitsTable.$inferSelect;
