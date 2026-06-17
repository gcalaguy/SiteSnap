import { Router } from "express";
import { db, timeEntriesTable, projectsTable, usersTable, userMembershipsTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// GET /time-entries — owner/foreman see company-wide entries; workers see only their own
// Query params: projectId, userId (ignored for workers), from (YYYY-MM-DD), to (YYYY-MM-DD)
router.get("/time-entries", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const { projectId, userId, from, to } = req.query;
  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

  const conditions: ReturnType<typeof eq>[] = [
    eq(timeEntriesTable.companyId, req.companyId!),
  ];
  if (projectId) conditions.push(eq(timeEntriesTable.projectId, parseInt(projectId as string)));
  if (isPrivileged && userId) conditions.push(eq(timeEntriesTable.userId, parseInt(userId as string)));
  if (!isPrivileged) conditions.push(eq(timeEntriesTable.userId, req.userId!));
  if (from) conditions.push(gte(timeEntriesTable.date, from as string));
  if (to) conditions.push(lte(timeEntriesTable.date, to as string));

  const entries = await db
    .select({
      id: timeEntriesTable.id,
      projectId: timeEntriesTable.projectId,
      userId: timeEntriesTable.userId,
      date: timeEntriesTable.date,
      hours: timeEntriesTable.hours,
      description: timeEntriesTable.description,
      createdAt: timeEntriesTable.createdAt,
      user: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: userMembershipsTable.role,
      },
      project: {
        id: projectsTable.id,
        name: projectsTable.name,
      },
    })
    .from(timeEntriesTable)
    .leftJoin(usersTable, eq(timeEntriesTable.userId, usersTable.id))
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, timeEntriesTable.userId),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
    .leftJoin(projectsTable, eq(timeEntriesTable.projectId, projectsTable.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntriesTable.date), desc(timeEntriesTable.createdAt))
    .limit(500);

  res.json(entries);
}))

export default router;
