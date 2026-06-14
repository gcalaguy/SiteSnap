/**
 * Compliance Context Gatherer.
 *
 * Pulls live project data from the database to enrich the AI prompt with
 * real site context — today's schedule, recent field logs, active crew,
 * and open hazards. All queries are read-only and scoped to the project.
 */

import { db } from "@workspace/db";
import {
  dailyReportsTable,
  scheduleEventsTable,
  timesheetsTable,
  usersTable,
  inspectionsTable,
  tasksTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";

export interface ProjectComplianceContext {
  projectName: string;
  todayScheduleText: string;
  recentDailyReportsText: string;
  activeCrewText: string;
  openHazardsText: string;
}

function todayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function gatherProjectContext(
  projectId: number,
  companyId: number,
  projectName: string,
): Promise<ProjectComplianceContext> {
  const today = todayUtc();

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const threeDaysAgo = new Date(today);
  threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);

  const tomorrowEnd = new Date(today);
  tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);
  tomorrowEnd.setUTCHours(23, 59, 59, 999);

  // Run all context queries in parallel
  const [scheduleRows, dailyReportRows, timesheetRows, hazardRows, overdueTaskRows] =
    await Promise.all([
      // 1. Today's and tomorrow's schedule events for this project or company
      db
        .select({
          title: scheduleEventsTable.title,
          type: scheduleEventsTable.type,
          startTime: scheduleEventsTable.startTime,
          endTime: scheduleEventsTable.endTime,
          location: scheduleEventsTable.location,
          notes: scheduleEventsTable.notes,
          status: scheduleEventsTable.status,
        })
        .from(scheduleEventsTable)
        .where(
          and(
            eq(scheduleEventsTable.companyId, companyId),
            eq(scheduleEventsTable.projectId, projectId),
            gte(scheduleEventsTable.startTime, today),
            lte(scheduleEventsTable.startTime, tomorrowEnd),
          ),
        )
        .orderBy(scheduleEventsTable.startTime)
        .limit(10),

      // 2. Last 3 daily reports for the project
      db
        .select({
          reportDate: dailyReportsTable.reportDate,
          weather: dailyReportsTable.weather,
          crewCount: dailyReportsTable.crewCount,
          workPerformed: dailyReportsTable.workPerformed,
          materialsUsed: dailyReportsTable.materialsUsed,
          issues: dailyReportsTable.issues,
          notes: dailyReportsTable.notes,
        })
        .from(dailyReportsTable)
        .where(
          and(
            eq(dailyReportsTable.projectId, projectId),
            gte(dailyReportsTable.reportDate, dateString(threeDaysAgo)),
          ),
        )
        .orderBy(desc(dailyReportsTable.reportDate))
        .limit(3),

      // 3. Active crew: users with a timesheet for this project this week
      db
        .select({
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          totalHours: timesheetsTable.totalHours,
          description: timesheetsTable.description,
        })
        .from(timesheetsTable)
        .innerJoin(usersTable, eq(timesheetsTable.userId, usersTable.id))
        .where(
          and(
            eq(timesheetsTable.projectId, projectId),
            eq(timesheetsTable.companyId, companyId),
            gte(timesheetsTable.weekStart, dateString(yesterday)),
          ),
        )
        .limit(20),

      // 4. Open hazards: HIGH or Critical risk inspections in last 30 days
      db
        .select({
          inspectionType: inspectionsTable.inspectionType,
          date: inspectionsTable.date,
          riskLevel: inspectionsTable.riskLevel,
          aiSummary: inspectionsTable.aiSummary,
          failedItemAnalysis: inspectionsTable.failedItemAnalysis,
        })
        .from(inspectionsTable)
        .where(
          and(
            eq(inspectionsTable.projectId, projectId),
            inArray(inspectionsTable.riskLevel, ["High", "Critical"]),
            gte(
              inspectionsTable.date,
              dateString(
                new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          ),
        )
        .orderBy(desc(inspectionsTable.date))
        .limit(5),

      // 5. Overdue or high-priority open tasks
      db
        .select({
          title: tasksTable.title,
          description: tasksTable.description,
          status: tasksTable.status,
          priority: tasksTable.priority,
          dueDate: tasksTable.dueDate,
        })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.projectId, projectId),
            inArray(tasksTable.status, ["todo", "in_progress"]),
            inArray(tasksTable.priority, ["high"]),
          ),
        )
        .orderBy(desc(tasksTable.createdAt))
        .limit(10),
    ]);

  // ── Format context strings ─────────────────────────────────────────────────

  const todayScheduleText =
    scheduleRows.length === 0
      ? "No scheduled events for today/tomorrow."
      : scheduleRows
          .map(
            (e) =>
              `[${e.type.toUpperCase()}] ${e.title} @ ${new Date(e.startTime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}` +
              (e.location ? ` at ${e.location}` : "") +
              (e.notes ? ` — Notes: ${e.notes}` : "") +
              ` (Status: ${e.status})`,
          )
          .join("\n");

  const recentDailyReportsText =
    dailyReportRows.length === 0
      ? "No daily reports in the past 3 days."
      : dailyReportRows
          .map(
            (r) =>
              `Date: ${r.reportDate} | Crew: ${r.crewCount} workers | Weather: ${r.weather ?? "N/A"}\n` +
              `Work performed: ${r.workPerformed}\n` +
              (r.materialsUsed ? `Materials: ${r.materialsUsed}\n` : "") +
              (r.issues ? `Issues: ${r.issues}\n` : "") +
              (r.notes ? `Notes: ${r.notes}` : ""),
          )
          .join("\n---\n");

  const activeCrewText =
    timesheetRows.length === 0
      ? "No active crew timesheets found for this week."
      : timesheetRows
          .map(
            (t) =>
              `${t.firstName} ${t.lastName} (${t.totalHours}h this week)` +
              (t.description ? ` — ${t.description}` : ""),
          )
          .join("\n");

  const hazardParts: string[] = [];

  if (hazardRows.length > 0) {
    hazardRows.forEach((h) => {
      hazardParts.push(
        `[${h.riskLevel?.toUpperCase() ?? "UNKNOWN"} RISK] ${h.inspectionType} inspection on ${h.date}` +
          (h.aiSummary ? `\nSummary: ${h.aiSummary}` : "") +
          (h.failedItemAnalysis
            ? `\nFailed items: ${h.failedItemAnalysis}`
            : ""),
      );
    });
  }

  if (overdueTaskRows.length > 0) {
    overdueTaskRows.forEach((t) => {
      hazardParts.push(
        `[OPEN TASK — ${t.priority.toUpperCase()}] ${t.title}` +
          (t.dueDate ? ` (due: ${t.dueDate})` : "") +
          (t.description ? `: ${t.description}` : ""),
      );
    });
  }

  const openHazardsText =
    hazardParts.length === 0
      ? "No open high-risk hazards or overdue tasks found."
      : hazardParts.join("\n---\n");

  return {
    projectName,
    todayScheduleText,
    recentDailyReportsText,
    activeCrewText,
    openHazardsText,
  };
}
