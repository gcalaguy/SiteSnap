import {
  db,
  companiesTable,
  usersTable,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  tasksTable,
} from "@workspace/db";
import { eq, and, lt, ne, inArray, isNotNull } from "drizzle-orm";

export interface ProjectDigest {
  id: number;
  name: string;
  newReports: { workPerformed: string; reportDate: string }[];
  openRFIs: {
    rfiNumber: string;
    subject: string;
    status: string;
    dueDate: string | null;
    isOverdue: boolean;
  }[];
  overdueTasks: { title: string; dueDate: string; priority: string }[];
}

export interface DigestPayload {
  companyId: number;
  companyName: string;
  date: string;
  recipients: { firstName: string; lastName: string; email: string }[];
  projects: ProjectDigest[];
  totals: { reports: number; openRFIs: number; overdueTasks: number };
}

export async function buildDigest(
  companyId: number,
): Promise<DigestPayload | null> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  if (!company) return null;

  // Recipients: owners and foremans
  const recipients = await db
    .select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.companyId, companyId),
        inArray(usersTable.role, ["owner", "foreman"]),
      ),
    );

  if (recipients.length === 0) return null;

  // Active projects for this company
  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.companyId, companyId),
        eq(projectsTable.status, "active"),
      ),
    );

  const projectDigests: ProjectDigest[] = [];

  for (const project of projects) {
    // Yesterday's daily reports
    const newReports = await db
      .select({
        workPerformed: dailyReportsTable.workPerformed,
        reportDate: dailyReportsTable.reportDate,
      })
      .from(dailyReportsTable)
      .where(
        and(
          eq(dailyReportsTable.projectId, project.id),
          eq(dailyReportsTable.reportDate, yesterdayStr),
        ),
      );

    // Open / in-review RFIs
    const openRFIs = await db
      .select({
        rfiNumber: rfisTable.rfiNumber,
        subject: rfisTable.subject,
        status: rfisTable.status,
        dueDate: rfisTable.dueDate,
      })
      .from(rfisTable)
      .where(
        and(
          eq(rfisTable.projectId, project.id),
          inArray(rfisTable.status, ["open", "in_review"]),
        ),
      );

    // Overdue tasks (not done, has a due date in the past)
    const overdueTasks = await db
      .select({
        title: tasksTable.title,
        dueDate: tasksTable.dueDate,
        priority: tasksTable.priority,
      })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.projectId, project.id),
          ne(tasksTable.status, "done"),
          isNotNull(tasksTable.dueDate),
          lt(tasksTable.dueDate, todayStr),
        ),
      );

    if (
      newReports.length > 0 ||
      openRFIs.length > 0 ||
      overdueTasks.length > 0
    ) {
      projectDigests.push({
        id: project.id,
        name: project.name,
        newReports,
        openRFIs: openRFIs.map((r) => ({
          ...r,
          isOverdue: r.dueDate != null && r.dueDate < todayStr,
        })),
        overdueTasks: overdueTasks.filter((t) => t.dueDate != null) as {
          title: string;
          dueDate: string;
          priority: string;
        }[],
      });
    }
  }

  return {
    companyId,
    companyName: company.name,
    date: now.toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    recipients,
    projects: projectDigests,
    totals: {
      reports: projectDigests.reduce((s, p) => s + p.newReports.length, 0),
      openRFIs: projectDigests.reduce((s, p) => s + p.openRFIs.length, 0),
      overdueTasks: projectDigests.reduce(
        (s, p) => s + p.overdueTasks.length,
        0,
      ),
    },
  };
}
