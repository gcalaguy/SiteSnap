import {
  db,
  projectsTable,
  dailyReportsTable,
  tasksTable,
  rfisTable,
  usersTable,
  userMembershipsTable,
  quotesTable,
  invoicesTable,
  leadsTable,
  contactsTable,
  timesheetsTable,
  formSubmissionsTable,
  formTemplatesTable,
  inspectionsTable,
} from "@workspace/db";
import { eq, desc, and, asc, ne, inArray } from "drizzle-orm";

function trunc(s: string | null | undefined, max = 200): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function fmtMoney(n: string | number | null | undefined): string {
  if (n == null || n === "") return "—";
  return `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
}

/**
 * Build a human-readable tenant context string by querying the live database.
 * The result is injected into the AI system prompt so the assistant can answer
 * with precise, up-to-date company data.
 *
 * P1 fix: accepts userRole to filter sensitive sections (finance, HR, CRM)
 * for workers. Workers only see project/task/safety/schedule data relevant to
 * their daily work — not quotes, invoices, leads, team salaries, or payroll.
 */
export async function buildTenantContext(
  companyId: number,
  userId?: number | null,
  userRole?: string | null,
): Promise<string> {
  const isWorker = userRole === "worker";
  const isPrivileged = userRole === "owner" || userRole === "foreman" || !userRole;
  const today = new Date().toLocaleDateString("en-CA");

  const [
    projects,
    reports,
    tasks,
    rfis,
    teamMembers,
    quotes,
    invoices,
    leads,
    contacts,
    timesheets,
    safetyForms,
    inspections,
  ] = await Promise.all([
    // All projects for the company
    db
      .select({
        name: projectsTable.name,
        status: projectsTable.status,
        city: projectsTable.city,
        province: projectsTable.province,
        startDate: projectsTable.startDate,
        endDate: projectsTable.endDate,
        budget: projectsTable.budget,
      })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId))
      .orderBy(desc(projectsTable.createdAt)),

    // Recent 15 daily reports
    db
      .select({
        reportDate: dailyReportsTable.reportDate,
        crewCount: dailyReportsTable.crewCount,
        workPerformed: dailyReportsTable.workPerformed,
        issues: dailyReportsTable.issues,
        projectName: projectsTable.name,
      })
      .from(dailyReportsTable)
      .innerJoin(
        projectsTable,
        and(
          eq(dailyReportsTable.projectId, projectsTable.id),
          eq(projectsTable.companyId, companyId),
        ),
      )
      .orderBy(desc(dailyReportsTable.reportDate))
      .limit(15),

    // Non-done tasks
    db
      .select({
        title: tasksTable.title,
        status: tasksTable.status,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
        projectName: projectsTable.name,
        assigneeFirst: usersTable.firstName,
        assigneeLast: usersTable.lastName,
      })
      .from(tasksTable)
      .innerJoin(
        projectsTable,
        and(
          eq(tasksTable.projectId, projectsTable.id),
          eq(projectsTable.companyId, companyId),
        ),
      )
      .leftJoin(usersTable, eq(tasksTable.assignedToUserId, usersTable.id))
      .where(ne(tasksTable.status, "done"))
      .orderBy(tasksTable.dueDate)
      .limit(30),

    // Open / in-review RFIs
    db
      .select({
        rfiNumber: rfisTable.rfiNumber,
        subject: rfisTable.subject,
        status: rfisTable.status,
        priority: rfisTable.priority,
        description: rfisTable.description,
        dueDate: rfisTable.dueDate,
        projectName: projectsTable.name,
      })
      .from(rfisTable)
      .innerJoin(
        projectsTable,
        and(
          eq(rfisTable.projectId, projectsTable.id),
          eq(projectsTable.companyId, companyId),
        ),
      )
      .where(inArray(rfisTable.status, ["open", "in_review"]))
      .orderBy(desc(rfisTable.createdAt))
      .limit(20),

    // Team members
    db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: userMembershipsTable.role,
      })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .orderBy(asc(userMembershipsTable.role), asc(usersTable.firstName)),

    // Recent 10 quotes — privileged only (not shown to workers)
    isPrivileged
      ? db
          .select({
            quoteNumber: quotesTable.quoteNumber,
            title: quotesTable.title,
            clientName: quotesTable.clientName,
            status: quotesTable.status,
            total: quotesTable.total,
          })
          .from(quotesTable)
          .where(eq(quotesTable.companyId, companyId))
          .orderBy(desc(quotesTable.createdAt))
          .limit(10)
      : Promise.resolve([]),

    // Recent 10 invoices — privileged only
    isPrivileged
      ? db
          .select({
            invoiceNumber: invoicesTable.invoiceNumber,
            title: invoicesTable.title,
            clientName: invoicesTable.clientName,
            status: invoicesTable.status,
            total: invoicesTable.total,
            dueDate: invoicesTable.dueDate,
          })
          .from(invoicesTable)
          .where(eq(invoicesTable.companyId, companyId))
          .orderBy(desc(invoicesTable.createdAt))
          .limit(10)
      : Promise.resolve([]),

    // Active leads — privileged only (CRM is not a worker concern)
    isPrivileged
      ? db
          .select({
            title: leadsTable.title,
            stage: leadsTable.stage,
            estimatedValue: leadsTable.estimatedValue,
            contactName: contactsTable.name,
            contactCompany: contactsTable.company,
          })
          .from(leadsTable)
          .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
          .where(
            and(
              eq(leadsTable.companyId, companyId),
              and(ne(leadsTable.stage, "won"), ne(leadsTable.stage, "lost")),
            ),
          )
          .orderBy(desc(leadsTable.updatedAt))
          .limit(20)
      : Promise.resolve([]),

    // Contacts — privileged only
    isPrivileged
      ? db
          .select({
            name: contactsTable.name,
            company: contactsTable.company,
            type: contactsTable.type,
            phone: contactsTable.phone,
            email: contactsTable.email,
          })
          .from(contactsTable)
          .where(eq(contactsTable.companyId, companyId))
          .orderBy(desc(contactsTable.updatedAt))
          .limit(20)
      : Promise.resolve([]),

    // Timesheets — workers only see their own; owners/foremen see all
    db
      .select({
        weekStart: timesheetsTable.weekStart,
        totalHours: timesheetsTable.totalHours,
        status: timesheetsTable.status,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(timesheetsTable)
      .leftJoin(usersTable, eq(timesheetsTable.userId, usersTable.id))
      .where(
        isWorker && userId != null
          ? and(eq(timesheetsTable.companyId, companyId), eq(timesheetsTable.userId, userId))
          : eq(timesheetsTable.companyId, companyId),
      )
      .orderBy(desc(timesheetsTable.createdAt))
      .limit(5),

    // Recent 5 safety form submissions with template name
    db
      .select({
        status: formSubmissionsTable.status,
        aiSummary: formSubmissionsTable.aiSummary,
        createdAt: formSubmissionsTable.createdAt,
        templateName: formTemplatesTable.name,
        templateCategory: formTemplatesTable.category,
      })
      .from(formSubmissionsTable)
      .leftJoin(
        formTemplatesTable,
        eq(formSubmissionsTable.templateId, formTemplatesTable.id),
      )
      .where(eq(formSubmissionsTable.companyId, companyId))
      .orderBy(desc(formSubmissionsTable.createdAt))
      .limit(5),

    // Recent 5 inspections with project name
    db
      .select({
        date: inspectionsTable.date,
        inspectionType: inspectionsTable.inspectionType,
        status: inspectionsTable.status,
        riskLevel: inspectionsTable.riskLevel,
        score: inspectionsTable.score,
        projectName: projectsTable.name,
      })
      .from(inspectionsTable)
      .leftJoin(projectsTable, eq(inspectionsTable.projectId, projectsTable.id))
      .where(eq(inspectionsTable.companyId, companyId))
      .orderBy(desc(inspectionsTable.date))
      .limit(5),
  ]);

  // ── Serialize to readable text ─────────────────────────────────────────────

  const lines: string[] = [
    `=== COMPANY DATA SNAPSHOT — ${today} ===`,
    "Live data from your account. Reference it directly when answering.",
    "",
  ];

  // Projects
  lines.push(`--- PROJECTS (${projects.length}) ---`);
  if (projects.length === 0) {
    lines.push("(none)");
  } else {
    for (const p of projects) {
      const budget = p.budget ? fmtMoney(p.budget) : "no budget set";
      const dates =
        p.startDate || p.endDate
          ? ` | ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`
          : "";
      lines.push(
        `[${p.status.toUpperCase()}] ${p.name} | ${p.city}, ${p.province}${dates} | ${budget}`,
      );
    }
  }
  lines.push("");

  // Daily Reports
  lines.push(`--- RECENT DAILY REPORTS (${reports.length}) ---`);
  if (reports.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of reports) {
      lines.push(`${fmtDate(r.reportDate)} — ${r.projectName} (crew: ${r.crewCount})`);
      lines.push(`  Work: ${trunc(r.workPerformed, 200)}`);
      if (r.issues) lines.push(`  Issues: ${trunc(r.issues, 150)}`);
    }
  }
  lines.push("");

  // Tasks
  lines.push(`--- OPEN TASKS (${tasks.length}) ---`);
  if (tasks.length === 0) {
    lines.push("(none)");
  } else {
    for (const t of tasks) {
      const assignee = t.assigneeFirst
        ? `${t.assigneeFirst} ${t.assigneeLast}`
        : "Unassigned";
      const due = t.dueDate ? ` | Due: ${fmtDate(t.dueDate)}` : "";
      lines.push(
        `[${t.priority.toUpperCase()} | ${t.status}] ${t.title} — ${t.projectName} | ${assignee}${due}`,
      );
    }
  }
  lines.push("");

  // RFIs
  lines.push(`--- OPEN RFIs (${rfis.length}) ---`);
  if (rfis.length === 0) {
    lines.push("(none)");
  } else {
    for (const r of rfis) {
      const due = r.dueDate ? ` | Due: ${fmtDate(r.dueDate)}` : "";
      lines.push(
        `${r.rfiNumber} [${r.priority} | ${r.status}] ${r.subject} — ${r.projectName}${due}`,
      );
      lines.push(`  ${trunc(r.description, 150)}`);
    }
  }
  lines.push("");

  // Team Members
  lines.push(`--- TEAM MEMBERS (${teamMembers.length}) ---`);
  if (teamMembers.length === 0) {
    lines.push("(none)");
  } else {
    for (const m of teamMembers) {
      lines.push(`- ${m.firstName} ${m.lastName} (${m.role})`);
    }
  }
  lines.push("");

  // Quotes
  lines.push(`--- RECENT QUOTES (${quotes.length}) ---`);
  if (quotes.length === 0) {
    lines.push("(none)");
  } else {
    for (const q of quotes) {
      lines.push(
        `${q.quoteNumber} | ${q.title} | Client: ${q.clientName} | ${fmtMoney(q.total)} | ${q.status}`,
      );
    }
  }
  lines.push("");

  // Invoices
  lines.push(`--- RECENT INVOICES (${invoices.length}) ---`);
  if (invoices.length === 0) {
    lines.push("(none)");
  } else {
    for (const inv of invoices) {
      const due = inv.dueDate ? ` | Due: ${fmtDate(inv.dueDate)}` : "";
      lines.push(
        `${inv.invoiceNumber} | ${inv.title} | Client: ${inv.clientName} | ${fmtMoney(inv.total)} | ${inv.status}${due}`,
      );
    }
  }
  lines.push("");

  // Leads
  lines.push(`--- ACTIVE LEADS (${leads.length}) ---`);
  if (leads.length === 0) {
    lines.push("(none)");
  } else {
    for (const l of leads) {
      const contact = l.contactCompany
        ? `${l.contactName} (${l.contactCompany})`
        : (l.contactName ?? "—");
      const value = l.estimatedValue ? fmtMoney(l.estimatedValue) : "value unknown";
      lines.push(
        `${l.title} | Contact: ${contact} | Stage: ${l.stage} | Est. Value: ${value}`,
      );
    }
  }
  lines.push("");

  // Contacts
  lines.push(`--- CONTACTS (${contacts.length}) ---`);
  if (contacts.length === 0) {
    lines.push("(none)");
  } else {
    for (const c of contacts) {
      const org = c.company ? ` | ${c.company}` : "";
      const reach = c.email || c.phone ? ` | ${c.email ?? c.phone}` : "";
      lines.push(`- ${c.name}${org} | ${c.type}${reach}`);
    }
  }
  lines.push("");

  // Timesheets
  lines.push(`--- RECENT TIMESHEETS (${timesheets.length}) ---`);
  if (timesheets.length === 0) {
    lines.push("(none)");
  } else {
    for (const ts of timesheets) {
      const name = ts.firstName ? `${ts.firstName} ${ts.lastName}` : "Unknown";
      lines.push(
        `Week of ${fmtDate(ts.weekStart)} | ${name} | ${ts.totalHours} hrs | ${ts.status}`,
      );
    }
  }
  lines.push("");

  // Safety Forms
  lines.push(`--- RECENT SAFETY SUBMISSIONS (${safetyForms.length}) ---`);
  if (safetyForms.length === 0) {
    lines.push("(none)");
  } else {
    for (const f of safetyForms) {
      const summary = f.aiSummary ? ` — ${trunc(f.aiSummary, 100)}` : "";
      lines.push(
        `${f.templateName ?? "Form"} (${f.templateCategory ?? "safety"}) | ${fmtDate(f.createdAt)} | ${f.status}${summary}`,
      );
    }
  }
  lines.push("");

  // Inspections
  lines.push(`--- RECENT INSPECTIONS (${inspections.length}) ---`);
  if (inspections.length === 0) {
    lines.push("(none)");
  } else {
    for (const insp of inspections) {
      const project = insp.projectName ? ` — ${insp.projectName}` : "";
      const score = insp.score != null ? ` | Score: ${insp.score}/100` : "";
      const risk = insp.riskLevel ? ` | Risk: ${insp.riskLevel}` : "";
      lines.push(
        `${fmtDate(insp.date)} | ${insp.inspectionType}${project}${score}${risk} | ${insp.status}`,
      );
    }
  }

  return lines.join("\n");
}
