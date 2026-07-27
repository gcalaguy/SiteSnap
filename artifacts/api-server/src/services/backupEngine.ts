import path from "node:path";
import { promises as fs } from "node:fs";
import { Storage } from "@google-cloud/storage";
import { eq, and, desc } from "drizzle-orm";
import { db, backupSchedulesTable, backupLogsTable, type BackupSchedule } from "@workspace/db";
import { buildTenantExport } from "./tenantExport";
import { ObjectStorageService } from "../lib/objectStorage";
import { decryptBackupConfig, type EncryptedBackupConfig } from "../lib/backupConfigCrypto";
import { logger } from "../lib/logger";

const objectStorageService = new ObjectStorageService();

interface CustomCloudConfig {
  bucketName: string;
  serviceAccountKeyJson: string;
}

/**
 * Operator-configured allowlist of network-drive base paths, e.g.
 * BACKUP_MOUNT_PATHS='{"nas-primary":"/mnt/nas/backups"}'. Owners can only
 * write under one of these — an arbitrary owner-supplied path is not accepted
 * (this is a hosted multi-tenant service; arbitrary filesystem writes on the
 * API server are a path-traversal / disk-exhaustion risk).
 */
function getMountAllowlist(): Record<string, string> {
  const raw = process.env.BACKUP_MOUNT_PATHS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && path.isAbsolute(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch (err) {
    logger.error({ err }, "Invalid BACKUP_MOUNT_PATHS env var — ignoring");
    return {};
  }
}

export function getAvailableBackupMounts(): string[] {
  return Object.keys(getMountAllowlist());
}

function sanitizeSubpath(subpath: string | null | undefined): string {
  const trimmed = (subpath ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("\0") || trimmed.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new Error("Invalid destination subpath");
  }
  return trimmed.replace(/^[/\\]+/, "");
}

function resolveMountDir(mountKey: string, subpath: string | null | undefined): string {
  const base = getMountAllowlist()[mountKey];
  if (!base) {
    throw new Error(`Unknown backup mount key: ${mountKey}`);
  }
  const resolvedBase = path.resolve(base);
  const resolvedDir = path.resolve(resolvedBase, sanitizeSubpath(subpath));
  if (resolvedDir !== resolvedBase && !resolvedDir.startsWith(resolvedBase + path.sep)) {
    throw new Error("Resolved backup destination escapes the allowed mount");
  }
  return resolvedDir;
}

function resolveNetworkDrivePath(mountKey: string, subpath: string | null, filename: string): string {
  return path.join(resolveMountDir(mountKey, subpath), filename);
}

export interface MountDirEntry {
  name: string;
  subpath: string;
}

export interface MountDirListing {
  subpath: string;
  entries: MountDirEntry[];
  exists: boolean;
  error?: string;
}

/**
 * Lists sub-directories under an allowlisted mount, for the "browse to pick a
 * folder" UI. Confined to the same mountKey + subpath sandboxing as actual
 * backup writes — never accepts an arbitrary server path (see the allowlist
 * rationale above).
 */
export async function listMountDirectory(
  mountKey: string,
  subpath: string | null | undefined,
): Promise<MountDirListing> {
  const resolvedDir = resolveMountDir(mountKey, subpath);
  const cleanSubpath = sanitizeSubpath(subpath);

  try {
    const dirents = await fs.readdir(resolvedDir, { withFileTypes: true });
    const entries = dirents
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        subpath: cleanSubpath ? `${cleanSubpath}/${d.name}` : d.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { subpath: cleanSubpath, entries, exists: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { subpath: cleanSubpath, entries: [], exists: false };
    }
    return {
      subpath: cleanSubpath,
      entries: [],
      exists: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function backupFilename(companyId: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `sitesnap-backup-company-${companyId}-${timestamp}.zip`;
}

async function writeToDestination(
  companyId: number,
  schedule: BackupSchedule | undefined,
  destinationType: "platform_storage" | "custom_cloud_storage" | "network_drive",
  zipBuffer: Buffer,
): Promise<string> {
  const filename = backupFilename(companyId);

  if (destinationType === "platform_storage") {
    return objectStorageService.uploadBuffer(zipBuffer, "application/zip");
  }

  if (destinationType === "custom_cloud_storage") {
    if (!schedule?.customCloudConfig) {
      throw new Error("No custom cloud storage destination configured");
    }
    const { bucketName, serviceAccountKeyJson } = decryptBackupConfig<CustomCloudConfig>(
      schedule.customCloudConfig as EncryptedBackupConfig,
    );
    const storage = new Storage({ credentials: JSON.parse(serviceAccountKeyJson) });
    const objectName = `sitesnap-backups/company-${companyId}/${filename}`;
    await storage.bucket(bucketName).file(objectName).save(zipBuffer, {
      contentType: "application/zip",
      resumable: false,
    });
    return `gs://${bucketName}/${objectName}`;
  }

  // network_drive
  if (!schedule?.destinationMountKey) {
    throw new Error("No destination mount configured");
  }
  const fullPath = resolveNetworkDrivePath(schedule.destinationMountKey, schedule.destinationSubpath, filename);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, zipBuffer);
  return fullPath;
}

/** Downloads a previously-written custom_cloud_storage backup using the tenant's current schedule config. */
export async function downloadCustomCloudBackup(schedule: BackupSchedule, destinationPath: string): Promise<Buffer> {
  if (!schedule.customCloudConfig) {
    throw new Error("No custom cloud storage destination configured");
  }
  const { bucketName, serviceAccountKeyJson } = decryptBackupConfig<CustomCloudConfig>(
    schedule.customCloudConfig as EncryptedBackupConfig,
  );
  const storage = new Storage({ credentials: JSON.parse(serviceAccountKeyJson) });
  const gsPrefix = `gs://${bucketName}/`;
  const objectName = destinationPath.startsWith(gsPrefix) ? destinationPath.slice(gsPrefix.length) : destinationPath;
  const [buffer] = await storage.bucket(bucketName).file(objectName).download();
  return buffer;
}

async function deleteFromDestination(
  destinationType: "platform_storage" | "custom_cloud_storage" | "network_drive",
  destinationPath: string,
  customCloudConfig: unknown,
): Promise<void> {
  if (destinationType === "platform_storage") {
    await objectStorageService.deleteObjectByPath(destinationPath);
    return;
  }
  if (destinationType === "custom_cloud_storage") {
    if (!customCloudConfig) return;
    const { bucketName, serviceAccountKeyJson } = decryptBackupConfig<CustomCloudConfig>(
      customCloudConfig as EncryptedBackupConfig,
    );
    const storage = new Storage({ credentials: JSON.parse(serviceAccountKeyJson) });
    const gsPrefix = `gs://${bucketName}/`;
    const objectName = destinationPath.startsWith(gsPrefix) ? destinationPath.slice(gsPrefix.length) : destinationPath;
    await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
    return;
  }
  // network_drive
  await fs.unlink(destinationPath).catch(() => {});
}

async function loadSchedule(companyId: number): Promise<BackupSchedule | undefined> {
  const [schedule] = await db
    .select()
    .from(backupSchedulesTable)
    .where(eq(backupSchedulesTable.companyId, companyId))
    .limit(1);
  return schedule;
}

async function insertInProgressLog(
  companyId: number,
  destinationType: "platform_storage" | "custom_cloud_storage" | "network_drive",
): Promise<number> {
  const [log] = await db
    .insert(backupLogsTable)
    .values({ companyId, status: "in_progress", destinationType })
    .returning({ id: backupLogsTable.id });
  return log.id;
}

async function executeBackupRun(
  companyId: number,
  logId: number,
  schedule: BackupSchedule | undefined,
  destinationType: "platform_storage" | "custom_cloud_storage" | "network_drive",
): Promise<void> {
  try {
    const { zipBuffer } = await buildTenantExport(db, companyId, null);
    const destinationPath = await writeToDestination(companyId, schedule, destinationType, zipBuffer);

    await db
      .update(backupLogsTable)
      .set({
        status: "completed",
        fileSizeBytes: zipBuffer.length,
        destinationPath,
        completedAt: new Date(),
      })
      .where(eq(backupLogsTable.id, logId));
  } catch (err) {
    logger.error({ err, companyId, logId }, "Backup run failed");
    await db
      .update(backupLogsTable)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(backupLogsTable.id, logId));
  }
}

/** Reads the current schedule (if any), exports the tenant, writes it to the configured destination, and logs the result. Awaits the full run — used by the cron sweep. */
export async function runBackupForCompany(companyId: number): Promise<{ logId: number }> {
  const schedule = await loadSchedule(companyId);
  const destinationType = schedule?.destinationType ?? "platform_storage";
  const logId = await insertInProgressLog(companyId, destinationType);
  await executeBackupRun(companyId, logId, schedule, destinationType);
  return { logId };
}

/**
 * Same as runBackupForCompany, but returns as soon as the in_progress log row
 * exists instead of waiting for the export to finish — used by the "run now"
 * API so the client gets a real logId to poll immediately. No job queue exists
 * in this codebase, so the actual work continues in-process in the background.
 */
export async function startBackupRun(companyId: number): Promise<{ logId: number }> {
  const schedule = await loadSchedule(companyId);
  const destinationType = schedule?.destinationType ?? "platform_storage";
  const logId = await insertInProgressLog(companyId, destinationType);
  executeBackupRun(companyId, logId, schedule, destinationType).catch((err) => {
    logger.error({ err, companyId, logId }, "Background backup run failed unexpectedly");
  });
  return { logId };
}

/** Deletes completed backups (and their underlying files) older than each tenant's retentionDays. */
export async function purgeExpiredBackups(): Promise<{ purged: number }> {
  const rows = await db
    .select({
      logId: backupLogsTable.id,
      companyId: backupLogsTable.companyId,
      destinationType: backupLogsTable.destinationType,
      destinationPath: backupLogsTable.destinationPath,
      completedAt: backupLogsTable.completedAt,
      retentionDays: backupSchedulesTable.retentionDays,
      customCloudConfig: backupSchedulesTable.customCloudConfig,
    })
    .from(backupLogsTable)
    .innerJoin(backupSchedulesTable, eq(backupSchedulesTable.companyId, backupLogsTable.companyId))
    .where(eq(backupLogsTable.status, "completed"));

  let purged = 0;
  const now = Date.now();
  for (const row of rows) {
    if (!row.completedAt) continue;
    const ageDays = (now - row.completedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < row.retentionDays) continue;

    try {
      if (row.destinationPath) {
        await deleteFromDestination(row.destinationType, row.destinationPath, row.customCloudConfig);
      }
      await db.delete(backupLogsTable).where(eq(backupLogsTable.id, row.logId));
      purged++;
    } catch (err) {
      logger.warn({ err, logId: row.logId }, "Failed to purge expired backup — will retry next run");
    }
  }
  return { purged };
}

function isDue(frequency: "daily" | "weekly" | "monthly", lastCompletedAt: Date | null): boolean {
  if (!lastCompletedAt) return true;
  const hoursSince = (Date.now() - lastCompletedAt.getTime()) / (1000 * 60 * 60);
  if (frequency === "daily") return hoursSince >= 20;
  if (frequency === "weekly") return hoursSince >= 6.5 * 24;
  return hoursSince >= 27 * 24; // monthly
}

/** Runs every enabled schedule that's due, then purges expired backups. Called from the daily UTC cron. */
export async function runDueBackupsAndPurge(): Promise<{ ranCompanies: number; purged: number }> {
  const schedules = await db.select().from(backupSchedulesTable).where(eq(backupSchedulesTable.enabled, true));

  let ranCompanies = 0;
  for (const schedule of schedules) {
    const [lastCompleted] = await db
      .select({ completedAt: backupLogsTable.completedAt })
      .from(backupLogsTable)
      .where(and(eq(backupLogsTable.companyId, schedule.companyId), eq(backupLogsTable.status, "completed")))
      .orderBy(desc(backupLogsTable.completedAt))
      .limit(1);

    if (!isDue(schedule.frequency, lastCompleted?.completedAt ?? null)) continue;

    await runBackupForCompany(schedule.companyId);
    ranCompanies++;
  }

  const { purged } = await purgeExpiredBackups();
  return { ranCompanies, purged };
}
