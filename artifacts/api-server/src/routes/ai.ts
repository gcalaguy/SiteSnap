import { Router } from "express";
import { z } from "zod";
import { openai, speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const DailyReportAIInput = z.object({
  projectName: z.string(),
  rawInput: z.string(),
  reportDate: z.string(),
  crewCount: z.coerce.number().optional(),
});

const CostAnalysisAIInput = z.object({
  projectName: z.string(),
  labourCost: z.coerce.number(),
  materialsCost: z.coerce.number(),
  equipmentCost: z.coerce.number(),
  otherCost: z.coerce.number(),
  budget: z.union([z.coerce.number(), z.null()]).optional(),
  notes: z.string().optional(),
});

const RFIAIInput = z.object({
  projectName: z.string(),
  subject: z.string(),
  description: z.string(),
});

// ── Daily Report AI Agent ────────────────────────────────────────────────────
router.post("/ai/daily-report/generate", requireAuth, requireCompany, async (req, res) => {
  const parsed = DailyReportAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { projectName, rawInput, reportDate, crewCount } = parsed.data;

  const prompt = `You are a professional construction site supervisor AI assistant for Canadian construction companies.

Extract and structure the following raw site notes into a formal daily report. Return ONLY a JSON object with these exact fields:
- workPerformed: string (what work was done today, professional tone)
- materialsUsed: string (materials mentioned, or empty string if none)
- equipment: string (equipment mentioned, or empty string if none)
- issues: string (problems, delays, safety concerns mentioned, or empty string if none)
- summary: string (1-2 sentence executive summary suitable for a foreman's report)

Raw site notes for ${projectName} on ${reportDate} (crew of ${crewCount ?? "unknown"}):
${rawInput}

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed_result: Record<string, unknown>;
    try {
      parsed_result = JSON.parse(content);
    } catch {
      parsed_result = {
        workPerformed: rawInput,
        materialsUsed: "",
        equipment: "",
        issues: "",
        summary: `Daily site report for ${projectName} — ${reportDate}.`,
      };
    }
    res.json(parsed_result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI daily report generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ── Cost Analysis AI Agent ───────────────────────────────────────────────────
router.post("/ai/cost-analysis/generate", requireAuth, requireCompany, async (req, res) => {
  const parsed = CostAnalysisAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { projectName, labourCost, materialsCost, equipmentCost, otherCost, budget, notes } = parsed.data;
  const total = labourCost + materialsCost + equipmentCost + otherCost;

  const prompt = `You are a construction project cost analyst AI for Canadian construction companies.

Analyze the following cost breakdown and return ONLY a JSON object with these exact fields:
- analysis: string (2-3 sentence professional cost analysis in CAD)
- recommendations: array of strings (2-4 actionable recommendations)
- riskLevel: "low" | "medium" | "high" (budget risk assessment)
- keyInsights: array of strings (3-4 key financial insights)

Project: ${projectName}
Budget: ${budget ? `$${budget.toLocaleString("en-CA")} CAD` : "Not set"}
Labour Cost: $${labourCost.toLocaleString("en-CA")} CAD
Materials Cost: $${materialsCost.toLocaleString("en-CA")} CAD
Equipment Cost: $${equipmentCost.toLocaleString("en-CA")} CAD
Other Costs: $${otherCost.toLocaleString("en-CA")} CAD
Total: $${total.toLocaleString("en-CA")} CAD
${notes ? `Notes: ${notes}` : ""}

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed_result: Record<string, unknown>;
    try {
      parsed_result = JSON.parse(content);
    } catch {
      parsed_result = {
        analysis: `Cost analysis for ${projectName}. Total: $${total.toLocaleString("en-CA")} CAD.`,
        recommendations: ["Review spending against budget weekly."],
        riskLevel: "low",
        keyInsights: [`Total spend: $${total.toLocaleString("en-CA")} CAD`],
      };
    }
    res.json(parsed_result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI cost analysis generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ── RFI AI Agent ─────────────────────────────────────────────────────────────
router.post("/ai/rfi/generate", requireAuth, requireCompany, async (req, res) => {
  const parsed = RFIAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { projectName, subject, description } = parsed.data;

  const prompt = `You are a construction project manager AI assistant for Canadian construction companies.

Formalize the following RFI (Request for Information) and return ONLY a JSON object with these exact fields:
- formalSubject: string (formal professional RFI subject line)
- formalDescription: string (formal multi-paragraph RFI description suitable for submission to an architect or engineer)
- suggestedResponse: string (suggested response template for the recipient)
- clarifyingQuestions: array of strings (3-4 questions to help resolve the RFI)

Project: ${projectName}
Subject: ${subject}
Description: ${description}

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed_result: Record<string, unknown>;
    try {
      parsed_result = JSON.parse(content);
    } catch {
      parsed_result = {
        formalSubject: `RFI: ${subject}`,
        formalDescription: `PROJECT: ${projectName}\n\nSUBJECT: ${subject}\n\nDESCRIPTION:\n${description}`,
        suggestedResponse: `Thank you for submitting this RFI regarding "${subject}". We will respond within 5 business days.`,
        clarifyingQuestions: ["What is the impact on project schedule?"],
      };
    }
    res.json(parsed_result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI RFI generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ── AI Assistant (chat) ───────────────────────────────────────────────────────
const AssistantInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1),
  context: z.string().optional().nullable(),
});

router.post("/ai/assistant", requireAuth, requireCompany, async (req, res) => {
  const parsed = AssistantInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { messages, context } = parsed.data;

  const systemPrompt = `You are Site Snap AI, a friendly and knowledgeable construction assistant for Canadian field crews and project managers.

You help with:
- Project status and progress questions
- Daily report writing tips and safety guidelines
- Canadian building codes (NBC, provincial codes)
- Material estimating, crew scheduling, and site management
- Weather delays, RFI guidance, and subcontractor coordination
- Any general construction question a foreman or site supervisor might ask

Keep responses concise and practical. Use plain language suited for field workers. If specific project data is provided in the context below, reference it in your answers.

${context ? `\n--- Company & Project Context ---\n${context}\n---` : ""}

Today's date: ${new Date().toLocaleDateString("en-CA")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (err: unknown) {
    req.log?.error({ err }, "AI assistant failed");
    res.status(500).json({ error: "AI assistant failed" });
  }
});

// ── Quote AI Agent ────────────────────────────────────────────────────────────
const QuoteAIInput = z.object({
  voiceInput: z.string().min(1),
  projectName: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
});

router.post("/ai/quote/generate", requireAuth, requireCompany, async (req, res) => {
  const parsed = QuoteAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { voiceInput, projectName, clientName } = parsed.data;
  const TAX_RATE = 0.13;

  const prompt = `You are a professional construction estimator AI for Canadian construction companies.

A contractor has described a job verbally. Extract and generate a detailed quote from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short quote title, e.g. "Foundation Concrete Work — Phase 1")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, realistic Canadian construction pricing)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} HST, rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope clarifications, assumptions, or exclusions)

Use realistic Canadian construction pricing for materials and labour.
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

Contractor voice description:
"${voiceInput}"

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(content);
    } catch {
      result = {
        title: "Site Quote",
        lineItems: [],
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        notes: voiceInput,
      };
    }
    const items = result.lineItems as { unit?: unknown }[] | undefined;
    req.log.info({ firstItemUnit: items?.[0]?.unit, itemCount: items?.length }, "AI quote response sample");
    res.json(result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI quote generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ── Invoice AI Agent ──────────────────────────────────────────────────────────
const InvoiceAIInput = z.object({
  voiceInput: z.string().min(1),
  projectName: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
});

router.post("/ai/invoice/generate", requireAuth, requireCompany, async (req, res) => {
  const parsed = InvoiceAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { voiceInput, projectName, clientName } = parsed.data;
  const TAX_RATE = 0.13;

  const prompt = `You are a professional construction billing AI for Canadian construction companies.

A contractor has described work that has been completed and needs to be invoiced. Extract and generate a detailed invoice from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short invoice title, e.g. "Foundation Concrete Work — Phase 1")
- clientName: string (client/company name if mentioned, otherwise "Client")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, realistic Canadian construction pricing)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} HST, rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope notes, payment terms, or work summary)

Use realistic Canadian construction pricing for materials and labour.
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

Contractor voice description:
"${voiceInput}"

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(content);
    } catch {
      result = {
        title: "Site Invoice",
        clientName: clientName ?? "Client",
        lineItems: [],
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        notes: voiceInput,
      };
    }
    res.json(result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI invoice generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ── Voice Transcription ───────────────────────────────────────────────────────
const TranscribeInput = z.object({
  audio: z.string().min(1),
  format: z.string().optional().default("webm"),
});

router.post("/ai/transcribe", requireAuth, async (req, res) => {
  const parsed = TranscribeInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body: audio (base64 string) is required" });
    return;
  }

  try {
    const raw = Buffer.from(parsed.data.audio, "base64");
    const { buffer, format } = await ensureCompatibleFormat(raw);
    const text = await speechToText(buffer, format);
    res.json({ text });
  } catch (err: unknown) {
    req.log?.error({ err }, "Transcription failed");
    res.status(500).json({ error: "Transcription failed" });
  }
});

// ── POST /api/help/chat — Site Snap in-app help assistant ───────────────────
const HELP_SYSTEM_PROMPT = `You are the Site Snap Help Assistant — a friendly, concise support agent who helps users understand and use the Site Snap construction management platform.

Site Snap is a construction management platform for small Canadian construction companies. It has:

**Web Dashboard features:**
- **Dashboard**: Overview of active projects, open RFIs, reports this week, team members, finance summary, and recent activity.
- **Projects**: Create and manage construction projects. Each project has tabs for Overview, Daily Reports, RFIs (Requests for Information), Tasks, Cost Analysis, Documents, Team, and Schedule. Projects have statuses: planning, active, on_hold, completed.
- **Daily Reports**: Log daily site activity — work performed, materials used, equipment, crew count, issues. Can be drafted with AI assistance from raw notes.
- **RFIs**: Create formal Requests for Information to track questions/clarifications from site. Has open/answered/closed statuses.
- **Tasks**: Create and assign tasks within projects. Set priority (low/medium/high/critical), due dates, and assignees.
- **Contacts**: Manage clients, subcontractors, and vendors in a CRM.
- **Leads**: Track sales leads through a pipeline with statuses and follow-up dates.
- **Quotes**: Create client quotes with line items, HST (13%), and client info. Statuses: draft → pending_approval → approved → rejected → invoiced. Can be submitted for owner approval. Can be converted to invoices.
- **Smart Estimator**: AI-powered 3-step estimator. Step 1: describe project in plain text (e.g. "2,000 sqft residential basement renovation, standard finishes"). Step 2: review/edit parsed parameters (project type, square footage, finish level, add-ons). Step 3: see a detailed cost breakdown with labour, materials, overhead, contingency, margin. Can Save Estimate or Send to Quotes (creates a draft quote with all line items pre-filled). Available to owners and foremen only.
- **Estimates**: Generate estimates from voice recording, file upload (PDF/image), or typed description. Different from Smart Estimator — these are simpler one-shot AI estimates.
- **Invoices**: Generate and manage client invoices. Can be created from an approved quote. Tracks invoice status.
- **AI Chat**: General construction AI assistant. Ask any construction question — Canadian building codes (NBC), safety tips, daily report help, cost estimation, site management advice.
- **Proposals**: Create and manage project proposals.
- **Safety**: Log safety incidents, inspections, and compliance items.
- **Team**: Manage company members. Roles: owner, foreman, worker. Owners and foremen have more access than workers.
- **Settings**: Company settings, notification preferences.
- **Admin & Billing**: Subscription management (owners only).
- **Notifications**: Bell icon in sidebar for system notifications. Can mark as read.
- **Finance**: Quick access to budget vs. spend for all projects.

**Mobile App (BuildCore Mobile) features:**
- **Home**: Summary cards, weather widget, Finance quick access, Voice Estimator card.
- **Voice Estimator** (owners/foremen only): Tap mic, describe project by voice, AI transcribes and parses parameters, calculate estimate, save as quote — all from your phone.
- **Ask AI**: General construction AI chat with voice input support.
- **Projects**: Browse and manage projects, view project details, tabs for Quotes, Invoices, and other project data.
- **Log**: Create daily reports with voice input from the field.
- **Tasks**: View and manage assigned tasks.
- **Profile**: Account and settings.

**Common how-to answers:**
- How to create a quote: Go to Quotes → New Quote, fill in client name and line items.
- How to use Smart Estimator: Go to Smart Estimator → describe project → review AI-parsed params → calculate → Save or Send to Quotes.
- How to send an estimate to quotes: In Smart Estimator Step 3, click "Send to Quotes", enter client name, click Create Quote.
- How to approve a quote: Open the quote → Submit → Owner approves.
- How to create an invoice from a quote: Open an approved quote → Convert to Invoice.
- How to add a daily report: Go to Projects → select project → Daily Reports tab → New Report.
- How to create an RFI: Go to Projects → select project → RFIs tab → New RFI.
- How to invite a team member: Go to Team → Invite Member, enter their email and role.
- How to use Voice Estimator on mobile: Tap Voice Estimator on home screen → tap mic → describe project → tap to stop → review → Calculate → Save as Quote.
- How to record actual project costs: In Smart Estimator after saving an estimate, click "Record Actual Cost" to track how accurate the estimate was.

If you cannot answer a question about Site Snap features, or if the user reports a bug or billing issue, always direct them to: **support@sitesnap.io**

Keep responses concise, friendly, and practical. Use bullet points for steps. Never make up features that don't exist.`;

const HelpChatBody = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .optional(),
});

router.post("/help/chat", requireAuth, async (req, res) => {
  const parsed = HelpChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { message, history = [] } = parsed.data;

  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: HELP_SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 600,
      messages,
    });

    const reply =
      response.choices[0]?.message?.content ??
      "I'm not sure about that. Please contact support@sitesnap.io for assistance.";

    res.json({ reply });
  } catch (err) {
    req.log?.error({ err }, "Help chat failed");
    res.status(500).json({ error: "Failed to get response" });
  }
});

// ── POST /ai/foreman-briefing — daily AI briefing for foreman ─────────────────
router.post(
  "/ai/foreman-briefing",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const { db, inspectionsTable, inspectionAlertsTable, projectsTable, tasksTable, dailyReportsTable } =
      await import("@workspace/db");
    const { eq, and, lt, ne, inArray, desc, sql } = await import("drizzle-orm");

    const companyId = req.companyId!;
    const today = new Date().toISOString().slice(0, 10);

    // Gather data in parallel
    const [criticalAlerts, highRiskInspections, overdueTasks, activeProjects, recentReports] =
      await Promise.all([
        // Unread critical/high alerts
        db
          .select({
            id: inspectionAlertsTable.id,
            message: inspectionAlertsTable.message,
            severity: inspectionAlertsTable.severity,
            type: inspectionAlertsTable.type,
          })
          .from(inspectionAlertsTable)
          .where(
            and(
              eq(inspectionAlertsTable.companyId, companyId),
              eq(inspectionAlertsTable.isRead, false),
              inArray(inspectionAlertsTable.severity, ["critical", "high"]),
            ),
          )
          .orderBy(desc(inspectionAlertsTable.createdAt))
          .limit(10),

        // High/Critical risk inspections last 30 days
        db
          .select({
            id: inspectionsTable.id,
            inspectionType: inspectionsTable.inspectionType,
            riskLevel: inspectionsTable.riskLevel,
            riskScore: inspectionsTable.riskScore,
            date: inspectionsTable.date,
            projectName: projectsTable.name,
          })
          .from(inspectionsTable)
          .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
          .where(
            and(
              eq(inspectionsTable.companyId, companyId),
              inArray(inspectionsTable.riskLevel, ["Critical", "High"]),
              sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '30 days'`,
            ),
          )
          .orderBy(desc(inspectionsTable.riskScore))
          .limit(5),

        // Overdue tasks
        db
          .select({
            id: tasksTable.id,
            title: tasksTable.title,
            priority: tasksTable.priority,
            dueDate: tasksTable.dueDate,
            projectName: projectsTable.name,
          })
          .from(tasksTable)
          .leftJoin(projectsTable, eq(projectsTable.id, tasksTable.projectId))
          .where(
            and(
              eq(projectsTable.companyId, companyId),
              lt(tasksTable.dueDate, today),
              ne(tasksTable.status, "done"),
            ),
          )
          .limit(8),

        // Active projects
        db
          .select({ name: projectsTable.name, status: projectsTable.status })
          .from(projectsTable)
          .where(and(eq(projectsTable.companyId, companyId), eq(projectsTable.status, "active")))
          .limit(6),

        // Recent daily reports
        db
          .select({
            projectName: projectsTable.name,
            reportDate: dailyReportsTable.reportDate,
            issues: dailyReportsTable.issues,
          })
          .from(dailyReportsTable)
          .leftJoin(projectsTable, eq(projectsTable.id, dailyReportsTable.projectId))
          .where(
            and(
              eq(projectsTable.companyId, companyId),
              sql`${dailyReportsTable.reportDate}::date >= NOW() - INTERVAL '2 days'`,
            ),
          )
          .orderBy(desc(dailyReportsTable.reportDate))
          .limit(5),
      ]);

    const dailyData = `
DATE: ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

UNREAD CRITICAL/HIGH ALERTS (${criticalAlerts.length}):
${criticalAlerts.length === 0 ? "None" : criticalAlerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.message}`).join("\n")}

HIGH/CRITICAL RISK INSPECTIONS (last 30 days, ${highRiskInspections.length}):
${highRiskInspections.length === 0 ? "None" : highRiskInspections.map((i) => `- ${i.inspectionType} inspection on ${i.date} — ${i.projectName ?? "No project"} — Risk ${i.riskLevel} (score: ${i.riskScore ?? "N/A"}/10)`).join("\n")}

OVERDUE TASKS (${overdueTasks.length}):
${overdueTasks.length === 0 ? "None" : overdueTasks.map((t) => `- [${t.priority}] "${t.title}" — ${t.projectName ?? "No project"} — due ${t.dueDate}`).join("\n")}

ACTIVE PROJECTS (${activeProjects.length}):
${activeProjects.length === 0 ? "None" : activeProjects.map((p) => `- ${p.name}`).join("\n")}

RECENT DAILY REPORTS (last 48 hrs, ${recentReports.length}):
${recentReports.length === 0 ? "None" : recentReports.map((r) => `- ${r.projectName ?? "Unknown"} on ${r.reportDate}${r.issues ? `: Issues: ${r.issues}` : ""}`).join("\n")}
`.trim();

    const systemPrompt = `You are a construction operations assistant generating a daily foreman briefing.

Your goal is to help the foreman prioritize their day efficiently.

INSTRUCTIONS:
- Be concise and actionable
- Focus only on important items
- Do NOT include unnecessary detail
- Prioritize safety, risk, and delays
- Use clear, professional language

OUTPUT FORMAT:

1. 🚨 Critical Alerts (if any)
- List urgent issues requiring immediate attention

2. ⚠️ High-Risk Areas
- Highlight jobs or inspections with high risk

3. 🛠️ Priority Actions for Today
- List 3–5 clear actions the foreman should take

4. 📅 Today's Schedule Insights
- Highlight any risks, delays, or conflicts

5. 📉 Issues & Delays
- Overdue or unresolved issues

6. 👷 Workforce Notes
- Attendance issues or performance concerns (if data available)

7. ✅ Quick Wins
- Easy actions that improve the day

Keep total output under 200 words. Only include sections that have relevant data. If a section has no data, skip it entirely.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DATA:\n${dailyData}` },
      ],
    });

    const briefing = response.choices[0]?.message?.content ?? "No briefing available.";
    res.json({ briefing, generatedAt: new Date().toISOString() });
  }),
);

export default router;
