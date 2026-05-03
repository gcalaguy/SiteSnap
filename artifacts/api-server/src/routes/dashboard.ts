import { Router } from "express";
import {
  db,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  costAnalysesTable,
  usersTable,
  invitationsTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";

const router = Router();

// GET /dashboard/summary — company-wide overview
router.get("/dashboard/summary", requireAuth, requireCompany, async (req, res) => {
  const companyId = req.companyId!;

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId));

  const projectIds = projects.map((p) => p.id);

  const members = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId));

  // Reports this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekStr = oneWeekAgo.toISOString().split("T")[0];

  let reportsThisWeek = 0;
  let openRFIs = 0;
  let totalSpentThisMonth = 0;

  if (projectIds.length > 0) {
    for (const pid of projectIds) {
      const reports = await db
        .select()
        .from(dailyReportsTable)
        .where(
          and(
            eq(dailyReportsTable.projectId, pid),
            gte(dailyReportsTable.reportDate, weekStr),
          ),
        );
      reportsThisWeek += reports.length;

      const rfis = await db
        .select()
        .from(rfisTable)
        .where(
          and(
            eq(rfisTable.projectId, pid),
            sql`${rfisTable.status} IN ('open', 'in_review')`,
          ),
        );
      openRFIs += rfis.length;

      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      const analyses = await db
        .select()
        .from(costAnalysesTable)
        .where(
          and(
            eq(costAnalysesTable.projectId, pid),
            gte(costAnalysesTable.createdAt, thisMonthStart),
          ),
        );
      totalSpentThisMonth += analyses.reduce((s, a) => s + parseFloat(a.totalCost), 0);
    }
  }

  const totalBudget = projects.reduce(
    (s, p) => s + (p.budget ? parseFloat(p.budget) : 0),
    0,
  );

  res.json({
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === "active").length,
    completedProjects: projects.filter((p) => p.status === "completed").length,
    reportsThisWeek,
    openRFIs,
    totalSpentThisMonth,
    totalBudgetAllProjects: totalBudget,
    teamMemberCount: members.length,
  });
});

// GET /dashboard/activity — recent activity feed
router.get("/dashboard/activity", requireAuth, requireCompany, async (req, res) => {
  const companyId = req.companyId!;

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId));
  const projectIds = projects.map((p) => p.id);
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const members = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId));
  const userMap = Object.fromEntries(
    members.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
  );

  const activity: Array<{
    id: string;
    type: string;
    description: string;
    projectName: string | null;
    userName: string;
    createdAt: Date;
  }> = [];

  if (projectIds.length > 0) {
    for (const pid of projectIds) {
      const reports = await db
        .select()
        .from(dailyReportsTable)
        .where(eq(dailyReportsTable.projectId, pid));
      for (const r of reports) {
        const workPreview = r.workPerformed?.trim();
        const description = workPreview
          ? workPreview.length > 120
            ? `${workPreview.slice(0, 120).trimEnd()}…`
            : workPreview
          : `Daily report submitted for ${projectMap[pid]}`;
        activity.push({
          id: `report-${r.id}`,
          type: "daily_report",
          description,
          projectName: projectMap[pid] ?? null,
          userName: userMap[r.submittedByUserId] ?? "Unknown",
          createdAt: r.createdAt,
        });
      }

      const rfis = await db
        .select()
        .from(rfisTable)
        .where(eq(rfisTable.projectId, pid));
      for (const r of rfis) {
        activity.push({
          id: `rfi-${r.id}`,
          type: "rfi_created",
          description: `${r.rfiNumber}: ${r.subject}`,
          projectName: projectMap[pid] ?? null,
          userName: userMap[r.submittedByUserId] ?? "Unknown",
          createdAt: r.createdAt,
        });
      }
    }

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
  }

  // Sort by date descending, return last 20
  activity.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json(activity.slice(0, 20));
});

export default router;
