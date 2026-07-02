import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";
import { logger } from "../lib/logger";

interface AuditEventData {
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  details: string;
  projectName?: string;
  ipAddress?: string;
  companyId: string;
}

/**
 * Insert a single audit log record into the database.
 * All fields are passed in explicitly to keep the call site readable.
 */
export async function logAuditEvent(data: AuditEventData): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      companyId: Number(data.companyId),
      userId: Number(data.userId),
      userName: data.userName,
      userRole: data.userRole,
      action: data.action,
      details: data.details,
      projectName: data.projectName ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  } catch (err) {
    logger.error({ err, action: data.action, userId: data.userId }, "Failed to write audit log entry");
  }
}

/**
 * Convenience helper that derives user identity from the Express request.
 * Use inside route handlers where `req` already has `userId`, `companyId`,
 * etc. set by the auth middleware.
 */
export async function logAuditEventFromRequest(
  req: Request,
  action: string,
  details: string,
  opts?: {
    projectName?: string;
  },
): Promise<void> {
  const userId = req.userId;
  const companyId = req.companyId;
  if (userId == null || companyId == null) {
    return; // silently skip if auth context is missing
  }

  const userName = req.userDisplayName || "";
  if (!userName) {
    logger.warn(
      { userId, hasDisplay: req.userDisplayName !== undefined },
      "logAuditEventFromRequest: empty userName — falling back to user ID",
    );
  }

  await logAuditEvent({
    userId: userId.toString(),
    userName: userName || userId.toString(),
    userRole: req.userRole ?? "unknown",
    action,
    details,
    projectName: opts?.projectName,
    ipAddress: req.ip ?? undefined,
    companyId: companyId.toString(),
  });
}

