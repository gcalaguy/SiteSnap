import { Router } from "express";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
  projectsTable,
  dailyReportsTable,
  tasksTable,
  rfisTable,
  usersTable,
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
import { requireAuth, requireCompany } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { notify } from "../lib/notify";

const router = Router();

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Site Snap AI, a knowledgeable construction assistant for Canadian field crews and project managers.

You have direct access to this company's live data — projects, daily reports, tasks, RFIs, quotes, invoices, contacts, leads, timesheets, and safety forms. This data is provided in the context section below with every message.

When answering questions:
- Reference actual data from the context. Quote names, dates, and amounts precisely.
- If the user asks about something that is not in the context, say "I don't see that in your records" rather than guessing or making up data.
- For general construction knowledge (Canadian building codes, NBC, safety guidelines, estimating rules of thumb), answer from your training knowledge.
- Keep responses concise and practical. Use plain language suited for field workers and project managers.
- When listing items, use bullet points or numbered lists for clarity.

You help with:
- Searching and summarizing project data, reports, tasks, RFIs, quotes, and invoices
- Canadian building codes (NBC, provincial codes)
- Safety best practices and guidelines
- Daily report writing tips and field notes
- Cost estimation, crew scheduling, and site management advice
- Any general construction question a foreman or project manager might ask`;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Tenant context builder ────────────────────────────────────────────────────

async function buildTenantContext(companyId: number, _userId: number): Promise<string> {
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

    // Recent 15 daily reports (join projects for company filter + name)
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

    // Non-done tasks (join projects for company filter; join users for assignee name)
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
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId))
      .orderBy(asc(usersTable.role), asc(usersTable.firstName)),

    // Recent 10 quotes
    db
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
      .limit(10),

    // Recent 10 invoices
    db
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
      .limit(10),

    // Active leads (not won/lost), joined with contacts
    db
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
      .limit(20),

    // Contacts (20 most recent)
    db
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
      .limit(20),

    // Recent 5 timesheets with submitter name
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
      .where(eq(timesheetsTable.companyId, companyId))
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

// ── AI reply ──────────────────────────────────────────────────────────────────

async function getAIReply(
  messageHistory: { role: "user" | "assistant"; content: string }[],
  tenantContext: string,
): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA");
  const systemPrompt =
    SYSTEM_PROMPT +
    `\n\nToday's date: ${today}\n\n${tenantContext}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [{ role: "system", content: systemPrompt }, ...messageHistory],
  });

  return (
    response.choices[0]?.message?.content ??
    "Sorry, I couldn't generate a response. Please try again."
  );
}

function generateTitle(firstMessage: string): string {
  const words = firstMessage.trim().split(/\s+/);
  const title = words.slice(0, 7).join(" ");
  return title.length > 60 ? title.slice(0, 60) + "…" : title;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /conversations
router.get("/conversations", requireAuth, requireCompany, async (req, res) => {
  try {
    const convos = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.userId, req.userId!),
          eq(conversationsTable.companyId, req.companyId!),
        ),
      )
      .orderBy(desc(conversationsTable.updatedAt));
    res.json(convos);
  } catch (err) {
    req.log?.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// POST /conversations — create conversation + first message
router.post("/conversations", requireAuth, requireCompany, async (req, res) => {
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const tenantContext = await buildTenantContext(req.companyId!, req.userId!);

    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        userId: req.userId!,
        companyId: req.companyId!,
        title: generateTitle(message),
      })
      .returning();

    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, role: "user", content: message.trim() })
      .returning();

    const reply = await getAIReply(
      [{ role: "user", content: message.trim() }],
      tenantContext,
    );

    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, role: "assistant", content: reply })
      .returning();

    // Notify the user that the AI has replied
    notify({
      userId: req.userId!,
      type: "message",
      title: "Site Snap AI replied",
      body: reply.length > 120 ? reply.slice(0, 120) + "…" : reply,
      referenceId: conversation.id,
    }).catch(() => {});

    res.status(201).json({ conversation, messages: [userMessage, aiMessage], reply });
  } catch (err) {
    req.log?.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// GET /conversations/:conversationId
router.get("/conversations/:conversationId", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.conversationId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));

    res.json({ ...conversation, messages: msgs });
  } catch (err) {
    req.log?.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

// POST /conversations/:conversationId/messages
router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const id = parseInt(req.params.conversationId, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    try {
      const [conversation] = await db
        .select()
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
        .limit(1);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // Fetch tenant context and conversation history in parallel
      const [tenantContext, history] = await Promise.all([
        buildTenantContext(req.companyId!, req.userId!),
        db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, id))
          .orderBy(asc(messagesTable.createdAt)),
      ]);

      const [userMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "user", content: content.trim() })
        .returning();

      const messageHistory = [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: content.trim() },
      ];

      const reply = await getAIReply(messageHistory, tenantContext);

      const [aiMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "assistant", content: reply })
        .returning();

      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, id));

      // Notify the user that the AI has replied
      notify({
        userId: req.userId!,
        type: "message",
        title: "Site Snap AI replied",
        body: reply.length > 120 ? reply.slice(0, 120) + "…" : reply,
        referenceId: id,
      }).catch(() => {});

      res.json({ message: userMessage, reply, aiMessage });
    } catch (err) {
      req.log?.error({ err }, "Failed to add message");
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

// DELETE /conversations/:conversationId
router.delete("/conversations/:conversationId", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.conversationId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log?.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
