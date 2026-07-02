import { Router } from "express";
import {
  db,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  costAnalysesTable,
  usersTable,
  userMembershipsTable,
  tasksTable,
  workerSchedulesTable,
  quotesTable,
  invoicesTable,
  formSubmissionsTable,
  timesheetsTable,
  contactsTable,
  leadsTable,
} from "@workspace/db";
import { eq, and, gte, sql, inArray, lt, ne, isNotNull, desc } from "drizzle-orm";
import { getAccessibleProjectIds } from "../lib/projectAccess";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { parsePagination } from "../lib/pagination";

const router = Router();

// L4: TTL cache for smart-summary — regenerated at most every 5 minutes per company.
// Expired entries are swept on each write so the Map can't grow unboundedly.
const smartSummaryCache = new Map<number, { summary: string; lines: string[]; expiresAt: number }>();
const SMART_SUMMARY_TTL_MS = 5 * 60 * 1000;

function setSmartSummaryCache(companyId: number, value: { summary: string; lines: string[]; expiresAt: number }) {
  const now = Date.now();
  for (const [k, v] of smartSummaryCache) {
    if (v.expiresAt <= now) smartSummaryCache.delete(k);
  }
  smartSummaryCache.set(companyId, value);
}


function displayName(firstName: string, lastName: string, email?: string): string {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return full || email || "Unknown";
}

// GET /dashboard/summary — company-wide (or worker-scoped) overview
router.get("/dashboard/summary", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;

  const projectIds = await getAccessibleProjectIds(companyId, userId, userRole);

  const [memberCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));
  const teamMemberCount = memberCountResult?.count ?? 0;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekStr = oneWeekAgo.toISOString().split("T")[0];

  let reportsThisWeek = 0;
  let openRFIs = 0;
  let totalSpend = 0;
  let totalBudget = 0;
  let activeProjects = 0;
  let totalProjects = projectIds.length;

  if (projectIds.length > 0) {
    const [projectAgg] = await db
      .select({
        activeCount: sql<number>`COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int`,
        totalBudget: sql<number>`COALESCE(SUM(budget::numeric) FILTER (WHERE budget IS NOT NULL), 0)`,
      })
      .from(projectsTable)
      .where(inArray(projectsTable.id, projectIds));

    activeProjects = projectAgg?.activeCount ?? 0;
    totalBudget = projectAgg ? Number(projectAgg.totalBudget) : 0;

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);

    const [allReports, allRFIs, allAnalyses] = await Promise.all([
      db
        .select({ projectId: dailyReportsTable.projectId })
        .from(dailyReportsTable)
        .where(
          and(
            inArray(dailyReportsTable.projectId, projectIds),
            gte(dailyReportsTable.reportDate, weekStr),
          ),
        ),
      db
        .select({ projectId: rfisTable.projectId })
        .from(rfisTable)
        .where(
          and(
            inArray(rfisTable.projectId, projectIds),
            inArray(rfisTable.status, ["open", "in_review"]),
          ),
        ),
      db
        .select({ totalCost: costAnalysesTable.totalCost })
        .from(costAnalysesTable)
        .where(
          and(
            inArray(costAnalysesTable.projectId, projectIds),
            gte(costAnalysesTable.createdAt, thisMonthStart),
          ),
        ),
    ]);

    reportsThisWeek = allReports.length;
    openRFIs = allRFIs.length;
    totalSpend = allAnalyses.reduce((s, a) => s + parseFloat(a.totalCost), 0);
  }

  const contactRows = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(eq(contactsTable.companyId, companyId));

  // Overdue invoices: sent/overdue status + past due date
  const today = new Date().toISOString().split("T")[0]!;
  const overdueInvoiceRows = await db
    .select()
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        sql`${invoicesTable.status} IN ('sent', 'overdue')`,
        isNotNull(invoicesTable.dueDate),
        lt(invoicesTable.dueDate, today),
      ),
    );
  const overdueInvoices = overdueInvoiceRows.length;
  const overdueInvoiceAmount = overdueInvoiceRows.reduce(
    (s, inv) => s + parseFloat(inv.total ?? "0"),
    0,
  );

  // Revenue pipeline: sum of estimatedValue from active leads
  const activeLeadRows = await db
    .select({ estimatedValue: leadsTable.estimatedValue, stage: leadsTable.stage })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.companyId, companyId),
        sql`${leadsTable.stage} NOT IN ('won', 'lost')`,
      ),
    );
  const activeLeads = activeLeadRows.length;
  const revenuePipeline = activeLeadRows.reduce(
    (s, l) => s + parseFloat(l.estimatedValue ?? "0"),
    0,
  );

  // Pending safety form review count
  const [pendingFormsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(formSubmissionsTable)
    .where(
      and(
        eq(formSubmissionsTable.companyId, companyId),
        sql`${formSubmissionsTable.status} = 'submitted'`,
      ),
    );
  const pendingForms = pendingFormsResult?.count ?? 0;

  res.json({
    totalProjects,
    activeProjects,
    completedProjects: 0,
    reportsThisWeek,
    openRFIs,
    pendingRFIs: openRFIs,
    totalSpentThisMonth: totalSpend,
    totalSpend,
    totalBudget,
    totalBudgetAllProjects: totalBudget,
    teamMemberCount,
    totalContacts: contactRows.length,
    overdueInvoices,
    overdueInvoiceAmount,
    revenuePipeline,
    activeLeads,
    pendingForms,
  });
}))

// GET /dashboard/my-tasks — all tasks assigned to the current worker across all their projects
router.get("/dashboard/my-tasks", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;

  const projectIds = await getAccessibleProjectIds(companyId, userId, userRole);

  if (projectIds.length === 0) {
    res.json([]);
    return;
  }

  const whereClause =
    userRole === "worker"
      ? and(inArray(tasksTable.projectId, projectIds), eq(tasksTable.assignedToUserId, userId))
      : inArray(tasksTable.projectId, projectIds);

  const { limit, offset } = parsePagination(req.query, 100, 200);

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(whereClause)
    .orderBy(tasksTable.createdAt)
    .limit(limit)
    .offset(offset);

  res.json(tasks);
}))

// GET /dashboard/action-counts — badge counts for sidebar nav
router.get("/dashboard/action-counts", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;
  const isWorker = userRole === "worker";

  // Quotes: pending_approval (owner/foreman review needed) + draft (worker's own)
  const [pendingQuotesResult] = isWorker
    ? [{ count: 0n }]
    : await db
        .select({ count: sql<bigint>`count(*)` })
        .from(quotesTable)
        .where(and(eq(quotesTable.companyId, companyId), sql`${quotesTable.status} = 'pending_approval'`));

  const [draftQuotesResult] = await db
    .select({ count: sql<bigint>`count(*)` })
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.companyId, companyId),
        sql`${quotesTable.status} = 'draft'`,
        isWorker ? eq(quotesTable.createdByUserId, userId) : sql`1=1`,
      )
    );

  // Invoices: draft count
  const [draftInvoicesResult] = await db
    .select({ count: sql<bigint>`count(*)` })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        sql`${invoicesTable.status} = 'draft'`,
        isWorker ? eq(invoicesTable.createdByUserId, userId) : sql`1=1`,
      )
    );

  // Safety: submitted (unreviewed) forms
  const [submittedFormsResult] = isWorker
    ? [{ count: 0n }]
    : await db
        .select({ count: sql<bigint>`count(*)` })
        .from(formSubmissionsTable)
        .where(and(eq(formSubmissionsTable.companyId, companyId), sql`${formSubmissionsTable.status} = 'submitted'`));

  // Hours: submitted timesheets pending review
  const [pendingTimesheetsResult] = isWorker
    ? [{ count: 0n }]
    : await db
        .select({ count: sql<bigint>`count(*)` })
        .from(timesheetsTable)
        .where(and(eq(timesheetsTable.companyId, companyId), sql`${timesheetsTable.status} = 'submitted'`));

  res.json({
    pendingQuotes: Number(pendingQuotesResult?.count ?? 0),
    draftQuotes: Number(draftQuotesResult?.count ?? 0),
    draftInvoices: Number(draftInvoicesResult?.count ?? 0),
    submittedForms: Number(submittedFormsResult?.count ?? 0),
    pendingTimesheets: Number(pendingTimesheetsResult?.count ?? 0),
  });
}))

// GET /dashboard/activity — recent activity feed (worker-scoped + tasks + schedules)
router.get("/dashboard/activity", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;

  const projectIds = await getAccessibleProjectIds(companyId, userId, userRole);

  if (projectIds.length === 0) {
    res.json([]);
    return;
  }

  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, createdAt: projectsTable.createdAt })
    .from(projectsTable)
    .where(inArray(projectsTable.id, projectIds));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const members = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, companyId),
      ),
    );
  const userMap = Object.fromEntries(
    members.map((u) => [u.id, displayName(u.firstName, u.lastName, u.email)]),
  );

  const activity: Array<{
    id: string;
    type: string;
    description: string;
    projectName: string | null;
    userName: string;
    createdAt: Date;
  }> = [];

  // Bulk-fetch all activity across all projects in 3 queries (was 3 queries × N projects).
  // Each query is limited to the 20 most-recent rows so we never pull the full history
  // into Node — the JS merge-sort below needs at most 4×20 = 80 rows to produce the
  // final top-20 feed.
  if (projectIds.length > 0) {
    const [allReports, allRfis, allTasks] = await Promise.all([
      db
        .select({
          id: dailyReportsTable.id,
          projectId: dailyReportsTable.projectId,
          submittedByUserId: dailyReportsTable.submittedByUserId,
          workPerformed: dailyReportsTable.workPerformed,
          createdAt: dailyReportsTable.createdAt,
        })
        .from(dailyReportsTable)
        .where(inArray(dailyReportsTable.projectId, projectIds))
        .orderBy(desc(dailyReportsTable.createdAt))
        .limit(20),
      db
        .select({
          id: rfisTable.id,
          rfiNumber: rfisTable.rfiNumber,
          subject: rfisTable.subject,
          projectId: rfisTable.projectId,
          submittedByUserId: rfisTable.submittedByUserId,
          createdAt: rfisTable.createdAt,
        })
        .from(rfisTable)
        .where(inArray(rfisTable.projectId, projectIds))
        .orderBy(desc(rfisTable.createdAt))
        .limit(20),
      db
        .select({
          id: tasksTable.id,
          title: tasksTable.title,
          projectId: tasksTable.projectId,
          assignedToUserId: tasksTable.assignedToUserId,
          createdAt: tasksTable.createdAt,
        })
        .from(tasksTable)
        .where(
          userRole === "worker"
            ? and(inArray(tasksTable.projectId, projectIds), eq(tasksTable.assignedToUserId, userId))
            : inArray(tasksTable.projectId, projectIds),
        )
        .orderBy(desc(tasksTable.createdAt))
        .limit(20),
    ]);

    for (const r of allReports) {
      const workPreview = r.workPerformed?.trim();
      const who = userMap[r.submittedByUserId] ?? "Someone";
      const description = workPreview
        ? workPreview.length > 100
          ? `${workPreview.slice(0, 100).trimEnd()}…`
          : workPreview
        : `Daily report submitted by ${who}`;
      activity.push({
        id: `report-${r.id}`,
        type: "daily_report",
        description,
        projectName: projectMap[r.projectId] ?? null,
        userName: who,
        createdAt: r.createdAt,
      });
    }

    for (const r of allRfis) {
      activity.push({
        id: `rfi-${r.id}`,
        type: "rfi_created",
        description: `RFI ${r.rfiNumber}: ${r.subject}`,
        projectName: projectMap[r.projectId] ?? null,
        userName: userMap[r.submittedByUserId] ?? "Unknown",
        createdAt: r.createdAt,
      });
    }

    for (const t of allTasks) {
      const assignee = t.assignedToUserId ? userMap[t.assignedToUserId] : null;
      const description = assignee
        ? `Task "${t.title}" assigned to ${assignee}`
        : `Task "${t.title}" created`;
      activity.push({
        id: `task-${t.id}`,
        type: "task_created",
        description,
        projectName: projectMap[t.projectId] ?? null,
        userName: assignee ?? "System",
        createdAt: t.createdAt,
      });
    }
  }

  // Project created events
  for (const p of projects) {
    activity.push({
      id: `project-${p.id}`,
      type: "project_created",
      description: `Project "${p.name}" created`,
      projectName: p.name,
      userName: "System",
      createdAt: p.createdAt,
    });
  }

  // Worker schedules — scoped to the accessible projects
  const scheduleRows = await db
    .select({
      id: workerSchedulesTable.id,
      userId: workerSchedulesTable.userId,
      projectId: workerSchedulesTable.projectId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      createdAt: workerSchedulesTable.createdAt,
    })
    .from(workerSchedulesTable)
    .where(
      and(
        eq(workerSchedulesTable.companyId, companyId),
        userRole === "worker"
          ? eq(workerSchedulesTable.userId, userId)
          : inArray(workerSchedulesTable.projectId, projectIds),
      ),
    )
    .orderBy(desc(workerSchedulesTable.createdAt))
    .limit(20);
  for (const s of scheduleRows) {
    const who = s.userId ? (userMap[s.userId] ?? "A worker") : "A subcontractor";
    const proj = projectMap[s.projectId] ?? "a project";
    activity.push({
      id: `schedule-${s.id}`,
      type: "schedule_assigned",
      description:
        userRole === "worker"
          ? `You are scheduled on "${proj}" from ${s.startDate} to ${s.endDate}`
          : `${who} scheduled on "${proj}" from ${s.startDate} to ${s.endDate}`,
      projectName: proj,
      userName: who,
      createdAt: s.createdAt,
    });
  }

  activity.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json(activity.slice(0, 20));
}))

// GET /dashboard/smart-summary — rule-based insight text (cached 5 min per company)
router.get("/dashboard/smart-summary", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;

  const cached = smartSummaryCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Cache-Control", "private, max-age=300");
    res.json({ summary: cached.summary, lines: cached.lines });
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;

  // Active projects
  const allProjects = await db
    .select({ id: projectsTable.id, status: projectsTable.status })
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId));
  const activeCount = allProjects.filter(
    (p) => p.status !== "completed" && p.status !== "cancelled",
  ).length;

  // Overdue invoices
  const overdueRows = await db
    .select({ total: invoicesTable.total })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        sql`${invoicesTable.status} IN ('sent', 'overdue')`,
        isNotNull(invoicesTable.dueDate),
        lt(invoicesTable.dueDate, today),
      ),
    );
  const overdueAmt = overdueRows.reduce((s, r) => s + parseFloat(r.total ?? "0"), 0);

  // Idle leads (not updated in 7 days, not won/lost)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const idleLeadRows = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.companyId, companyId),
        sql`${leadsTable.stage} NOT IN ('won', 'lost')`,
        lt(leadsTable.updatedAt, sevenDaysAgo),
      ),
    );

  // Pending form reviews
  const [formsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(formSubmissionsTable)
    .where(
      and(
        eq(formSubmissionsTable.companyId, companyId),
        sql`${formSubmissionsTable.status} = 'submitted'`,
      ),
    );
  const pendingForms = formsResult?.count ?? 0;

  // Overdue tasks
  const taskRows = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
    .where(
      and(
        eq(projectsTable.companyId, companyId),
        ne(tasksTable.status, "done"),
        isNotNull(tasksTable.dueDate),
        lt(tasksTable.dueDate, today),
      ),
    );

  // Build insight sentences
  const lines: string[] = [];

  if (activeCount === 0) {
    lines.push("No active projects at the moment — a great time to pursue new leads.");
  } else {
    lines.push(`You currently have ${activeCount} active project${activeCount !== 1 ? "s" : ""} in progress.`);
  }

  if (overdueRows.length > 0) {
    const fmtAmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(overdueAmt);
    lines.push(`${overdueRows.length} invoice${overdueRows.length !== 1 ? "s are" : " is"} overdue totalling ${fmtAmt} — consider following up with clients.`);
  } else {
    lines.push("All invoices are up to date.");
  }

  if (idleLeadRows.length > 0) {
    lines.push(`${idleLeadRows.length} lead${idleLeadRows.length !== 1 ? "s have" : " has"} had no activity in over 7 days — worth a follow-up.`);
  }

  if (taskRows.length > 0) {
    lines.push(`${taskRows.length} task${taskRows.length !== 1 ? "s are" : " is"} past due across your projects.`);
  }

  if (pendingForms > 0) {
    lines.push(`${pendingForms} safety form${pendingForms !== 1 ? "s are" : " is"} pending review.`);
  }

  const result = { summary: lines.join(" "), lines };
  setSmartSummaryCache(companyId, { ...result, expiresAt: Date.now() + SMART_SUMMARY_TTL_MS });
  res.setHeader("Cache-Control", "private, max-age=300");
  res.json(result);
}))

// GET /rfis — company-wide RFI list (worker-scoped to accessible projects)
router.get("/rfis", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;

  const projectIds = await getAccessibleProjectIds(companyId, userId, userRole);
  if (projectIds.length === 0) { res.json([]); return; }

  const projects = await db.select().from(projectsTable).where(inArray(projectsTable.id, projectIds));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const { limit, offset } = parsePagination(req.query, 50, 200);

  const rfis = await db
    .select()
    .from(rfisTable)
    .where(inArray(rfisTable.projectId, projectIds))
    .orderBy(desc(rfisTable.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = [...new Set(rfis.map((r) => r.submittedByUserId))];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, displayName(u.firstName, u.lastName, u.email)]));

  res.json(rfis.map((r) => ({
    ...r,
    projectName: projectMap[r.projectId] ?? null,
    submittedByName: userMap[r.submittedByUserId] ?? "Unknown",
  })));
}))

// GET /daily-reports — company-wide daily report list (worker-scoped to accessible projects)
router.get("/daily-reports", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = req.companyId!;
  const userId = req.userId!;
  const userRole = req.userRole!;

  const projectIds = await getAccessibleProjectIds(companyId, userId, userRole);
  if (projectIds.length === 0) { res.json([]); return; }

  const projects = await db.select().from(projectsTable).where(inArray(projectsTable.id, projectIds));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const { limit, offset } = parsePagination(req.query, 50, 200);

  const reports = await db
    .select()
    .from(dailyReportsTable)
    .where(inArray(dailyReportsTable.projectId, projectIds))
    .orderBy(desc(dailyReportsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = [...new Set(reports.map((r) => r.submittedByUserId))];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, displayName(u.firstName, u.lastName, u.email)]));

  res.json(reports.map((r) => ({
    ...r,
    projectName: projectMap[r.projectId] ?? null,
    submittedByName: userMap[r.submittedByUserId] ?? "Unknown",
  })));
}))

export default router;
