import { db, usersTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";

export interface AuditEventData {
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
  if (!userId || !companyId) {
    return; // silently skip if auth context is missing
  }

  const userName = `${req.headers["x-user-first-name"] ?? ""} ${req.headers["x-user-last-name"] ?? ""}`.trim();
  const fallbackName = userId.toString();

  await logAuditEvent({
    userId: userId.toString(),
    userName: userName || fallbackName,
    userRole: req.userRole ?? "unknown",
    action,
    details,
    projectName: opts?.projectName,
    ipAddress: req.ip ?? undefined,
    companyId: companyId.toString(),
  });
}

/** Resolve the user's display name from the DB (for when headers aren't available). */
async function resolveUserName(userId: number): Promise<string> {
  const [u] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return u ? `${u.firstName} ${u.lastName}`.trim() : String(userId);
}
