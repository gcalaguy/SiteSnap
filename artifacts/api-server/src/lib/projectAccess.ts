import { db, projectsTable, projectMembersTable, workerSchedulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Returns the project IDs accessible to `userId` within `companyId`.
 *
 * Workers see only projects they are a member of or have a schedule entry on.
 * Owners and foremen see all projects in the company.
 */
export async function getAccessibleProjectIds(
  companyId: number,
  userId: number,
  userRole: string,
): Promise<number[]> {
  if (userRole !== "worker") {
    const rows = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId));
    return rows.map((r) => r.id);
  }

  const [memberRows, scheduleRows] = await Promise.all([
    db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(and(eq(projectMembersTable.companyId, companyId), eq(projectMembersTable.userId, userId))),
    db
      .select({ projectId: workerSchedulesTable.projectId })
      .from(workerSchedulesTable)
      .where(and(eq(workerSchedulesTable.companyId, companyId), eq(workerSchedulesTable.userId, userId))),
  ]);

  const ids = new Set([
    ...memberRows.map((r) => r.projectId),
    ...scheduleRows.map((r) => r.projectId),
  ]);
  return [...ids];
}
