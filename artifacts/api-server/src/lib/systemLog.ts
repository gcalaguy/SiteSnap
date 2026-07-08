import { db, systemLogsTable } from "@workspace/db";
import { logger } from "./logger";

export type SystemLogPlatform = "Backend" | "Web" | "iOS" | "Android";

interface SystemLogData {
  logType: string;
  platform: SystemLogPlatform;
  userId?: number | null;
  tenantId?: number | null;
  message: string;
  stackTrace?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert a single system/error log record. Never throws — a logging failure
 * must never break the caller's real request/flow. Unlike logAuditEventFromRequest,
 * this has no request-scoped convenience wrapper: it must work without `req`
 * context so it can log pre-auth client crashes and background/system events.
 */
export async function logSystemEvent(data: SystemLogData): Promise<void> {
  try {
    await db.insert(systemLogsTable).values({
      logType: data.logType,
      platform: data.platform,
      userId: data.userId ?? null,
      tenantId: data.tenantId ?? null,
      message: data.message,
      stackTrace: data.stackTrace ?? null,
      metadata: data.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err, logType: data.logType, platform: data.platform }, "Failed to write system log entry");
  }
}
