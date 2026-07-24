import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./index";

export const backupFrequencyEnum = pgEnum("backup_frequency", [
  "daily",
  "weekly",
  "monthly",
]);

export const backupDestinationTypeEnum = pgEnum("backup_destination_type", [
  "platform_storage",
  "custom_cloud_storage",
  "network_drive",
]);

export const backupStatusEnum = pgEnum("backup_status", [
  "in_progress",
  "completed",
  "failed",
]);

/** Per-tenant recurring backup configuration — one row per company. */
export const backupSchedulesTable = pgTable("backup_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" })
    .unique(),
  frequency: backupFrequencyEnum("frequency").notNull().default("weekly"),
  enabled: boolean("enabled").notNull().default(true),
  retentionDays: integer("retention_days").notNull().default(90),
  destinationType: backupDestinationTypeEnum("destination_type")
    .notNull()
    .default("platform_storage"),
  // network_drive only — a key into the operator-configured BACKUP_MOUNT_PATHS
  // allowlist, plus an owner-controlled subdirectory under that mount.
  destinationMountKey: text("destination_mount_key"),
  destinationSubpath: text("destination_subpath"),
  // custom_cloud_storage only — AES-256-GCM encrypted {iv, authTag, ciphertext}
  // wrapping { bucketName, serviceAccountKeyJson }. See backupConfigCrypto.ts.
  customCloudConfig: jsonb("custom_cloud_config"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** One row per backup run (scheduled or manual). */
export const backupLogsTable = pgTable(
  "backup_logs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    status: backupStatusEnum("status").notNull().default("in_progress"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    destinationType: backupDestinationTypeEnum("destination_type").notNull(),
    // Resolved object-storage path / mount path actually written to. The
    // durable pointer used to stream a download later — signed URLs expire,
    // so none are persisted here.
    destinationPath: text("destination_path"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("idx_backup_logs_company").on(t.companyId)],
);

export type BackupSchedule = typeof backupSchedulesTable.$inferSelect;
export type InsertBackupSchedule = typeof backupSchedulesTable.$inferInsert;
export type BackupLog = typeof backupLogsTable.$inferSelect;
export type InsertBackupLog = typeof backupLogsTable.$inferInsert;
