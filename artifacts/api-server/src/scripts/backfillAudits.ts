import { db, pool } from "@workspace/db";
import {
  projectsTable,
  invoicesTable,
  dailyReportsTable,
  usersTable,
  userMembershipsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";

async function backfillAudits() {
  console.log("Fetching existing records...");

  // 1. Fetch all target tables in parallel
  const [projects, invoices, dailyReports] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(invoicesTable),
    db.select().from(dailyReportsTable),
  ]);

  console.log(
    `Found ${projects.length} projects, ${invoices.length} invoices, ${dailyReports.length} daily reports`,
  );

  if (projects.length === 0 && invoices.length === 0 && dailyReports.length === 0) {
    console.log("No records found to backfill.");
    return;
  }

  // 2. Build projectId -> companyId map (daily reports don't store companyId directly)
  const projectCompanyMap = new Map<number, number>();
  for (const p of projects) {
    projectCompanyMap.set(p.id, p.companyId);
  }

  // 3. Collect all user IDs we need
  const userIdSet = new Set<number>();
  for (const inv of invoices) userIdSet.add(inv.createdByUserId);
  for (const dr of dailyReports) userIdSet.add(dr.submittedByUserId);
  const allUserIds = Array.from(userIdSet);

  // 4. Collect all company IDs we need
  const companyIdSet = new Set<number>();
  for (const p of projects) companyIdSet.add(p.companyId);
  for (const inv of invoices) companyIdSet.add(inv.companyId);
  for (const dr of dailyReports) {
    const cid = projectCompanyMap.get(dr.projectId);
    if (cid) companyIdSet.add(cid);
  }
  const allCompanyIds = Array.from(companyIdSet);

  // 5. Fetch users and active memberships in parallel
  const [users, memberships] = await Promise.all([
    allUserIds.length > 0
      ? db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, allUserIds))
      : Promise.resolve([]),
    allCompanyIds.length > 0
      ? db
          .select({
            companyId: userMembershipsTable.companyId,
            userId: userMembershipsTable.userId,
            role: userMembershipsTable.role,
          })
          .from(userMembershipsTable)
          .where(
            and(
              inArray(userMembershipsTable.companyId, allCompanyIds),
              eq(userMembershipsTable.isActive, true),
            ),
          )
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  // 6. Determine a canonical owner for each company (prefer owner, then foreman, then any)
  const companyOwnerMap = new Map<number, { userId: number; role: string }>();
  const rolePriority: Record<string, number> = { owner: 0, foreman: 1, worker: 2 };

  const sortedMemberships = [...memberships].sort((a, b) => {
    return (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3);
  });

  for (const m of sortedMemberships) {
    if (!companyOwnerMap.has(m.companyId)) {
      companyOwnerMap.set(m.companyId, { userId: m.userId, role: m.role });
    }
  }

  // 7. Quick lookup for a user's role inside a specific company
  const userCompanyRoleMap = new Map<string, string>();
  for (const m of memberships) {
    const key = `${m.userId}:${m.companyId}`;
    if (!userCompanyRoleMap.has(key)) {
      userCompanyRoleMap.set(key, m.role);
    }
  }

  // 8. Build audit log rows
  const auditRows: Array<{
    companyId: number;
    userId: number;
    userName: string;
    userRole: string;
    action: string;
    details: string;
    projectName: string | null;
    ipAddress: string | null;
    createdAt: Date;
  }> = [];

  // Projects (no creator stored — assign company owner)
  for (const p of projects) {
    const owner = companyOwnerMap.get(p.companyId);
    if (!owner) continue;
    const user = userMap.get(owner.userId);
    if (!user) continue;
    auditRows.push({
      companyId: p.companyId,
      userId: owner.userId,
      userName: `${user.firstName} ${user.lastName}`.trim() || `User ${user.id}`,
      userRole: owner.role,
      action: "Project Created",
      details: `Created project "${p.name}"`,
      projectName: p.name,
      ipAddress: null,
      createdAt: p.createdAt,
    });
  }

  // Invoices
  for (const inv of invoices) {
    const user = userMap.get(inv.createdByUserId);
    if (!user) continue;
    const role = userCompanyRoleMap.get(`${inv.createdByUserId}:${inv.companyId}`) ?? "owner";
    auditRows.push({
      companyId: inv.companyId,
      userId: inv.createdByUserId,
      userName: `${user.firstName} ${user.lastName}`.trim() || `User ${user.id}`,
      userRole: role,
      action: "Invoice Created",
      details: `Created invoice "${inv.title}" (${inv.invoiceNumber})`,
      projectName: null,
      ipAddress: null,
      createdAt: inv.createdAt,
    });
  }

  // Daily Reports
  for (const dr of dailyReports) {
    const companyId = projectCompanyMap.get(dr.projectId);
    if (!companyId) continue;
    const user = userMap.get(dr.submittedByUserId);
    if (!user) continue;
    const role = userCompanyRoleMap.get(`${dr.submittedByUserId}:${companyId}`) ?? "worker";
    auditRows.push({
      companyId,
      userId: dr.submittedByUserId,
      userName: `${user.firstName} ${user.lastName}`.trim() || `User ${user.id}`,
      userRole: role,
      action: "Daily Report Created",
      details: `Submitted daily report for ${dr.reportDate} in project ${dr.projectId}`,
      projectName: null,
      ipAddress: null,
      createdAt: dr.createdAt,
    });
  }

  // 9. Batch insert
  if (auditRows.length === 0) {
    console.log("No audit rows could be generated (missing user/membership data).");
    return;
  }

  console.log(`Inserting ${auditRows.length} audit log rows...`);
  await db.insert(auditLogsTable).values(auditRows);
  console.log(`Successfully backfilled ${auditRows.length} historical audit logs`);
}

async function main() {
  try {
    await backfillAudits();
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
