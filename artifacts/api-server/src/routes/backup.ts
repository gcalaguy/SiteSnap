import { Router } from "express";
import { createReadStream } from "node:fs";
import { eq, and, desc } from "drizzle-orm";
import { db, backupSchedulesTable, backupLogsTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { z } from "zod";
import { encryptBackupConfig } from "../lib/backupConfigCrypto";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  startBackupRun,
  getAvailableBackupMounts,
  downloadCustomCloudBackup,
  listMountDirectory,
} from "../services/backupEngine";

const router = Router();
const objectStorageService = new ObjectStorageService();

const UpdateBackupScheduleBody = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  enabled: z.boolean(),
  retentionDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(365)]),
  destinationType: z.enum(["platform_storage", "custom_cloud_storage", "network_drive"]),
  destinationMountKey: z.string().min(1).optional(),
  destinationSubpath: z.string().optional(),
  customCloudConfig: z
    .object({
      bucketName: z.string().min(1),
      serviceAccountKeyJson: z.string().min(1),
    })
    .optional(),
});

// GET /companies/:companyId/backup-schedule
router.get(
  "/companies/:companyId/backup-schedule",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [schedule] = await db
      .select()
      .from(backupSchedulesTable)
      .where(eq(backupSchedulesTable.companyId, companyId))
      .limit(1);

    const logs = await db
      .select({
        id: backupLogsTable.id,
        status: backupLogsTable.status,
        fileSizeBytes: backupLogsTable.fileSizeBytes,
        destinationType: backupLogsTable.destinationType,
        destinationPath: backupLogsTable.destinationPath,
        errorMessage: backupLogsTable.errorMessage,
        startedAt: backupLogsTable.startedAt,
        completedAt: backupLogsTable.completedAt,
      })
      .from(backupLogsTable)
      .where(eq(backupLogsTable.companyId, companyId))
      .orderBy(desc(backupLogsTable.startedAt))
      .limit(20);

    res.json({
      schedule: schedule
        ? {
            frequency: schedule.frequency,
            enabled: schedule.enabled,
            retentionDays: schedule.retentionDays,
            destinationType: schedule.destinationType,
            destinationMountKey: schedule.destinationMountKey,
            destinationSubpath: schedule.destinationSubpath,
            hasCustomCloudConfig: Boolean(schedule.customCloudConfig),
          }
        : null,
      availableMounts: getAvailableBackupMounts(),
      logs,
    });
  }),
);

// PATCH /companies/:companyId/backup-schedule
router.patch(
  "/companies/:companyId/backup-schedule",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = UpdateBackupScheduleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    if (body.destinationType === "network_drive") {
      if (!body.destinationMountKey || !getAvailableBackupMounts().includes(body.destinationMountKey)) {
        res.status(400).json({ error: "Unknown or missing destination mount" });
        return;
      }
    }

    // A settings save that doesn't touch the destination (e.g. just changing
    // frequency) shouldn't force re-pasting the service account key — keep
    // the existing encrypted config unless a new one was submitted.
    let customCloudConfig: ReturnType<typeof encryptBackupConfig> | null = null;
    if (body.destinationType === "custom_cloud_storage") {
      if (body.customCloudConfig) {
        customCloudConfig = encryptBackupConfig(body.customCloudConfig);
      } else {
        const [existing] = await db
          .select({ customCloudConfig: backupSchedulesTable.customCloudConfig })
          .from(backupSchedulesTable)
          .where(eq(backupSchedulesTable.companyId, companyId))
          .limit(1);
        if (!existing?.customCloudConfig) {
          res.status(400).json({ error: "customCloudConfig is required for custom_cloud_storage" });
          return;
        }
        customCloudConfig = existing.customCloudConfig as ReturnType<typeof encryptBackupConfig>;
      }
    }

    const updateFields = {
      frequency: body.frequency,
      enabled: body.enabled,
      retentionDays: body.retentionDays,
      destinationType: body.destinationType,
      destinationMountKey: body.destinationType === "network_drive" ? body.destinationMountKey ?? null : null,
      destinationSubpath: body.destinationType === "network_drive" ? body.destinationSubpath ?? null : null,
      customCloudConfig,
    };

    const [updated] = await db
      .insert(backupSchedulesTable)
      .values({ companyId, ...updateFields })
      .onConflictDoUpdate({ target: backupSchedulesTable.companyId, set: updateFields })
      .returning();

    res.json({
      frequency: updated.frequency,
      enabled: updated.enabled,
      retentionDays: updated.retentionDays,
      destinationType: updated.destinationType,
      destinationMountKey: updated.destinationMountKey,
      destinationSubpath: updated.destinationSubpath,
      hasCustomCloudConfig: Boolean(updated.customCloudConfig),
    });
  }),
);

// GET /companies/:companyId/backup-mounts/:mountKey/browse?subpath=...
router.get(
  "/companies/:companyId/backup-mounts/:mountKey/browse",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const mountKey = req.params.mountKey as string;
    if (!getAvailableBackupMounts().includes(mountKey)) {
      res.status(404).json({ error: "Unknown backup mount" });
      return;
    }

    const subpath = typeof req.query.subpath === "string" ? req.query.subpath : "";
    try {
      const listing = await listMountDirectory(mountKey, subpath);
      res.json(listing);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid path" });
    }
  }),
);

// POST /companies/:companyId/backups/run-now
router.post(
  "/companies/:companyId/backups/run-now",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [existingRun] = await db
      .select({ id: backupLogsTable.id })
      .from(backupLogsTable)
      .where(and(eq(backupLogsTable.companyId, companyId), eq(backupLogsTable.status, "in_progress")))
      .limit(1);
    if (existingRun) {
      res.status(409).json({ error: "A backup is already in progress", logId: existingRun.id });
      return;
    }

    // No job queue exists in this codebase — startBackupRun inserts the
    // in_progress row and returns immediately; the export + write continue
    // in-process in the background. The client polls GET /backup-schedule
    // for the log row's status.
    const { logId } = await startBackupRun(companyId);

    res.status(202).json({ started: true, logId });
  }),
);

// GET /companies/:companyId/backups/:logId/download
router.get(
  "/companies/:companyId/backups/:logId/download",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const logId = parseInt(req.params.logId as string);

    const [log] = await db
      .select()
      .from(backupLogsTable)
      .where(and(eq(backupLogsTable.id, logId), eq(backupLogsTable.companyId, companyId)))
      .limit(1);

    if (!log || log.status !== "completed" || !log.destinationPath) {
      res.status(404).json({ error: "Backup not found or not completed" });
      return;
    }

    const filename = `sitesnap-backup-company-${companyId}-${log.id}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (log.destinationType === "platform_storage") {
      const file = await objectStorageService.getObjectEntityFile(log.destinationPath);
      const [buffer] = await file.download();
      res.send(buffer);
      return;
    }

    if (log.destinationType === "network_drive") {
      const stream = createReadStream(log.destinationPath);
      stream.on("error", () => {
        res.status(404).json({ error: "Backup file no longer exists at its destination" });
      });
      stream.pipe(res);
      return;
    }

    // custom_cloud_storage — needs the tenant's current schedule config to
    // decrypt the service-account credentials used to read the file back.
    const [schedule] = await db
      .select()
      .from(backupSchedulesTable)
      .where(eq(backupSchedulesTable.companyId, companyId))
      .limit(1);
    if (!schedule?.customCloudConfig) {
      res.status(404).json({ error: "Custom cloud storage destination is no longer configured" });
      return;
    }
    try {
      const buffer = await downloadCustomCloudBackup(schedule, log.destinationPath);
      res.send(buffer);
    } catch {
      res.status(404).json({ error: "Backup file no longer exists at its destination" });
    }
  }),
);

export default router;
