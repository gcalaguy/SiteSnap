import { Router } from "express";
import { z } from "zod";
import { openai, speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server";

/** Returns an AbortSignal that fires after `ms` milliseconds. */
function aiSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error(`OpenAI request timed out after ${ms}ms`)), ms).unref();
  return ctrl.signal;
}

import { db, companiesTable, estimatorCostModelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { searchWeb, formatSearchContext, webSearchEnabled } from "../lib/webSearch.js";
import { canSearchWeb, recordWebSearch } from "../lib/webSearchRateLimiter.js";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { buildTenantContext } from "../lib/buildTenantContext";

// Canadian provincial/territorial tax rates (GST/HST/PST combined)
const PROVINCE_TAX: Record<string, number> = {
  ON: 0.13, BC: 0.12, AB: 0.05, SK: 0.11, MB: 0.12,
  QC: 0.14975, NB: 0.15, NS: 0.15, PE: 0.15, NL: 0.15,
  NT: 0.05, NU: 0.05, YT: 0.05,
};

const router = Router();

const DailyReportAIInput = z.strictObject({
  projectName: z.string().min(1).max(200),
  rawInput: z.string().min(1).max(5000),
  reportDate: z.string().min(1).max(20),
  crewCount: z.coerce.number().min(0).max(9999).optional(),
});

const CostAnalysisAIInput = z.strictObject({
  projectName: z.string().min(1).max(200),
  labourCost: z.coerce.number().min(0),
  materialsCost: z.coerce.number().min(0),
  equipmentCost: z.coerce.number().min(0),
  otherCost: z.coerce.number().min(0),
  budget: z.union([z.coerce.number().min(0), z.null()]).optional(),
  notes: z.string().max(1000).optional(),
});

const RFIAIInput = z.strictObject({
  projectName: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(3000),
});

// ── Daily Report AI Agent ────────────────────────────────────────────────────
router.post("/ai/daily-report/generate", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = DailyReportAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
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
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }, { signal: aiSignal(45_000) });

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
}));

// ── Cost Analysis AI Agent ───────────────────────────────────────────────────
router.post("/ai/cost-analysis/generate", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = CostAnalysisAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
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
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }, { signal: aiSignal(45_000) });

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
}));

// ── RFI AI Agent ─────────────────────────────────────────────────────────────
router.post("/ai/rfi/generate", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = RFIAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
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
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }, { signal: aiSignal(45_000) });

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
}));

// ── AI Assistant (chat) ───────────────────────────────────────────────────────
const AssistantInput = z.strictObject({
  messages: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(50),
  context: z.string().max(5000).optional().nullable(),
});

router.post("/ai/assistant", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = AssistantInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }

  const { messages } = parsed.data;

  let webSearchContext = "";
  let quotaNote = "";
  const companyId = req.companyId;

  // Fetch live tenant context from the database (ignores any stale client-supplied context)
  const tenantContext = companyId
    ? await buildTenantContext(companyId, req.userId ?? null, req.userRole ?? null)
    : "";

  if (companyId && webSearchEnabled() && canSearchWeb(companyId)) {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (lastUser && lastUser.content.trim().length >= 10) {
      const results = await searchWeb(lastUser.content);
      if (results.length > 0) {
        recordWebSearch(companyId);
        webSearchContext = formatSearchContext(results);
      }
    }
  } else if (companyId && webSearchEnabled() && !canSearchWeb(companyId)) {
    quotaNote = "\n\nNOTE: The user's company has reached its daily web search quota. Only use internal project data and your training knowledge.";
  }

  const systemPrompt = `You are Site Snap AI, a friendly and knowledgeable construction assistant for Canadian field crews and project managers.

You help with:
- Project status and progress questions
- Daily report writing tips and safety guidelines
- Canadian building codes (NBC, provincial codes)
- Material estimating, crew scheduling, and site management
- Weather delays, RFI guidance, and subcontractor coordination
- Any general construction question a foreman or site supervisor might ask

Keep responses concise and practical. Use plain language suited for field workers. If specific project data is provided in the context below, reference it in your answers.

${tenantContext ? `\n--- Company & Project Context ---\n${tenantContext}\n---` : ""}${webSearchContext}${quotaNote}

Today's date: ${new Date().toLocaleDateString("en-CA")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    }, { signal: aiSignal(30_000) });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (err: unknown) {
    req.log?.error({ err }, "AI assistant failed");
    res.status(500).json({ error: "AI assistant failed" });
  }
}));

// ── Quote AI Agent ────────────────────────────────────────────────────────────
const QuoteAIInput = z.strictObject({
  voiceInput: z.string().min(1).max(3000),
  projectName: z.string().max(200).optional().nullable(),
  clientName: z.string().max(200).optional().nullable(),
});

router.post("/ai/quote/generate", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = QuoteAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }

  const { voiceInput, projectName, clientName } = parsed.data;

  const [companyRow, costModels] = await Promise.all([
    db.select({ province: companiesTable.province })
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!))
      .limit(1)
      .then((rows) => rows[0]),
    db.select()
      .from(estimatorCostModelsTable)
      .where(eq(estimatorCostModelsTable.companyId, req.companyId!))
      .orderBy(estimatorCostModelsTable.projectType, estimatorCostModelsTable.finishLevel)
      .limit(20),
  ]);

  const TAX_RATE = PROVINCE_TAX[companyRow?.province?.toUpperCase() ?? "ON"] ?? 0.13;

  const pricingBlock = costModels.length > 0
    ? `COMPANY PRICING REFERENCE — anchor unit prices to these rates and multiply quantities accordingly:
${costModels.map((m) =>
  `• ${m.name} (${m.projectType}/${m.finishLevel}): labour $${m.laborCostPerSqft}/m², materials $${m.materialCostPerSqft}/m², overhead ${m.overheadPct}%, contingency ${m.contingencyPct}%`
).join("\n")}
For hourly labour line items, derive a per-hour rate from the labour $/m² using typical productivity (0.5–2 m²/hr depending on task complexity).
Multiply each extracted quantity by the appropriate reference rate to populate unitPrice, then set total = quantity × unitPrice (rounded to 2 decimals).`
    : `Use realistic Canadian construction pricing for materials and labour.`;

  const prompt = `You are a professional construction estimator AI for Canadian construction companies.

A contractor has described a job verbally. Extract and generate a detailed quote from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short quote title, e.g. "Foundation Concrete Work — Phase 1")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, must be a number)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope clarifications, assumptions, or exclusions)

${pricingBlock}
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

Contractor voice description:
"${voiceInput}"

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }, { signal: aiSignal(45_000) });

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
    req.log?.info({ firstItemUnit: items?.[0]?.unit, itemCount: items?.length }, "AI quote response sample");
    res.json(result);
  } catch (err: unknown) {
    req.log?.error({ err }, "AI quote generation failed");
    res.status(500).json({ error: "AI generation failed" });
  }
}));

// ── Invoice AI Agent ──────────────────────────────────────────────────────────
const InvoiceAIInput = z.strictObject({
  voiceInput: z.string().min(1).max(3000),
  projectName: z.string().max(200).optional().nullable(),
  clientName: z.string().max(200).optional().nullable(),
});

router.post("/ai/invoice/generate", requireAuth, requireCompany, requireTenantCtx, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = InvoiceAIInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }

  const { voiceInput, projectName, clientName } = parsed.data;

  const [companyRow, costModels] = await Promise.all([
    db.select({ province: companiesTable.province })
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!))
      .limit(1)
      .then((rows) => rows[0]),
    db.select()
      .from(estimatorCostModelsTable)
      .where(eq(estimatorCostModelsTable.companyId, req.companyId!))
      .orderBy(estimatorCostModelsTable.projectType, estimatorCostModelsTable.finishLevel)
      .limit(20),
  ]);

  const TAX_RATE = PROVINCE_TAX[companyRow?.province?.toUpperCase() ?? "ON"] ?? 0.13;

  const pricingBlock = costModels.length > 0
    ? `COMPANY PRICING REFERENCE — anchor unit prices to these rates and multiply quantities accordingly:
${costModels.map((m) =>
  `• ${m.name} (${m.projectType}/${m.finishLevel}): labour $${m.laborCostPerSqft}/m², materials $${m.materialCostPerSqft}/m², overhead ${m.overheadPct}%, contingency ${m.contingencyPct}%`
).join("\n")}
For hourly labour line items, derive a per-hour rate from the labour $/m² using typical productivity (0.5–2 m²/hr depending on task complexity).
Multiply each extracted quantity by the appropriate reference rate to populate unitPrice, then set total = quantity × unitPrice (rounded to 2 decimals).`
    : `Use realistic Canadian construction pricing for materials and labour.`;

  const prompt = `You are a professional construction billing AI for Canadian construction companies.

A contractor has described work that has been completed and needs to be invoiced. Extract and generate a detailed invoice from this description.
Return ONLY a JSON object with these exact fields:
- title: string (short invoice title, e.g. "Foundation Concrete Work — Phase 1")
- clientName: string (client/company name if mentioned, otherwise "Client")
- lineItems: array of objects, each with:
  - description: string (material or labour item name)
  - quantity: number
  - unit: string (e.g. "hr", "m²", "m³", "ea", "lm", "bag", "sheet", "load")
  - unitPrice: number (CAD, must be a number)
  - total: number (quantity × unitPrice, rounded to 2 decimals)
- subtotal: number (sum of all line item totals)
- taxAmount: number (subtotal × ${TAX_RATE} rounded to 2 decimals)
- total: number (subtotal + taxAmount)
- notes: string (any scope notes, payment terms, or work summary)

${pricingBlock}
Include both materials AND labour as separate line items when applicable.
${projectName ? `Project: ${projectName}` : ""}
${clientName ? `Client: ${clientName}` : ""}

Contractor voice description:
"${voiceInput}"

Respond with ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }, { signal: aiSignal(45_000) });

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
}));

// ── Voice Transcription ───────────────────────────────────────────────────────
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { readFile } from "fs/promises";

const TranscribeJsonInput = z.strictObject({
  audio: z.string().min(1).max(10_000_000),
  format: z.string().max(10).optional().default("webm"),
});

router.post("/ai/transcribe", requireAuth, requireAiQuota, diskUpload.single("file"), asyncHandler(async (req, res) => {
  let audioBuffer: Buffer;

  try {
    // 1) multipart/form-data upload (mobile voice recorder)
    if (req.file) {
      // Read from temp disk file — buffer allocated only here, not during upload
      audioBuffer = await readFile(req.file.path);
    }
    // 2) JSON body with base64 audio (web dashboard)
    else {
      const parsed = TranscribeJsonInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
        return;
      }
      audioBuffer = Buffer.from(parsed.data.audio, "base64");
    }

    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);
    const text = await speechToText(buffer, format);
    res.json({ text });
  } catch (err: unknown) {
    req.log?.error({ err }, "Transcription failed");
    res.status(500).json({ error: "Transcription failed" });
  } finally {
    await cleanupUpload(req.file?.path);
  }
}))

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
- **Home**: Summary cards, weather widget, Finance quick access.
- **Estimator** (owners/foremen only): Tap the mic to describe your project by voice, or type it — AI transcribes and parses parameters into the form below, which you review/adjust, then calculate estimate, save, or save as quote — all from your phone.
- **Ask AI**: General construction AI chat with voice input support.
- **Projects**: Browse and manage projects, view project details, tabs for Quotes, Invoices, and other project data.
- **Log**: Create daily reports with voice input from the field.
- **Tasks**: View and manage assigned tasks.
- **Profile**: Account and settings.

**Common how-to answers:**
- How to create a quote: Go to Quotes → New Quote, fill in client name and line items.
- How to use Smart Estimator: Go to Smart Estimator → describe project → review AI-parsed params → calculate → Save or Send to Quotes.
- How to send an estimate to quotes: In Smart Estimator results, click "Send to Quotes", enter client name, click Create Quote.
- How to approve a quote: Open the quote → Submit → Owner approves.
- How to create an invoice from a quote: Open an approved quote → Convert to Invoice.
- How to add a daily report: Go to Projects → select project → Daily Reports tab → New Report.
- How to create an RFI: Go to Projects → select project → RFIs tab → New RFI.
- How to invite a team member: Go to Team → Invite Member, enter their email and role.
- How to use voice input in the Estimator on mobile: Tap Estimator → tap the mic → describe project → tap to stop → review the auto-filled details below → Generate Estimate → Save as Quote.
- How to record actual project costs: In Smart Estimator after saving an estimate, click "Record Actual Cost" to track how accurate the estimate was.

If you cannot answer a question about Site Snap features, or if the user reports a bug or billing issue, always direct them to: **support@sitesnap.io**

Keep responses concise, friendly, and practical. Use bullet points for steps. Never make up features that don't exist.`;

const HelpChatBody = z.strictObject({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
});

router.post("/help/chat", requireAuth, requireAiQuota, asyncHandler(async (req, res) => {
  const parsed = HelpChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
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
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      messages,
    }, { signal: aiSignal(15_000) });

    const reply =
      response.choices[0]?.message?.content ??
      "I'm not sure about that. Please contact support@sitesnap.io for assistance.";

    res.json({ reply });
  } catch (err) {
    req.log?.error({ err }, "Help chat failed");
    res.status(500).json({ error: "Failed to get response" });
  }
}));

// ── POST /ai/foreman-briefing — daily AI briefing, scoped to the caller's role ─
//   - owner / super_admin: macro org-wide summary — project risks, outstanding
//     invoices, high-priority safety flags, compliance metrics across all sites.
//   - foreman: scoped strictly to the projects they are actively assigned to
//     (project_members) — site schedules, crew safety sign-offs, field logs.
//   - worker: scoped to only their own assigned tasks, clock-in schedule, and
//     personal document/certification compliance.
// Scoping happens here, server-side, from req.userId/req.userRole — never a
// client-supplied scope. If a role has literally nothing to report, we return
// a deterministic empty-state message without spending an LLM call.
const ForemanBriefingInput = z.strictObject({});

router.post(
  "/ai/foreman-briefing",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const parsed = ForemanBriefingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
      return;
    }

    const {
      db,
      inspectionsTable,
      inspectionAlertsTable,
      projectsTable,
      tasksTable,
      dailyReportsTable,
      projectMembersTable,
      workerSchedulesTable,
      workerDocumentsTable,
      formSubmissionsTable,
      invoicesTable,
    } = await import("@workspace/db");
    const { eq, and, lt, lte, gte, ne, inArray, desc, sql, isNotNull } = await import("drizzle-orm");

    const companyId = req.companyId!;
    const userId = req.userId!;
    const userRole = req.userRole!;
    const isFullVisibility = userRole === "owner" || req.systemRole === "super_admin";
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateHeader = `DATE: ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

    let dailyData: string;
    let systemPrompt: string;

    if (isFullVisibility) {
      // ---- Owner / Executive: macro org-wide summary across all job sites ----
      const [criticalAlerts, highRiskInspections, overdueTasks, activeProjects, recentReports, outstandingInvoices, expiringDocs] =
        await Promise.all([
          db
            .select({ id: inspectionAlertsTable.id, message: inspectionAlertsTable.message, severity: inspectionAlertsTable.severity, type: inspectionAlertsTable.type })
            .from(inspectionAlertsTable)
            .where(and(eq(inspectionAlertsTable.companyId, companyId), eq(inspectionAlertsTable.isRead, false), inArray(inspectionAlertsTable.severity, ["critical", "high"])))
            .orderBy(desc(inspectionAlertsTable.createdAt))
            .limit(10),
          db
            .select({ id: inspectionsTable.id, inspectionType: inspectionsTable.inspectionType, riskLevel: inspectionsTable.riskLevel, riskScore: inspectionsTable.riskScore, date: inspectionsTable.date, projectName: projectsTable.name })
            .from(inspectionsTable)
            .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
            .where(and(eq(inspectionsTable.companyId, companyId), inArray(inspectionsTable.riskLevel, ["Critical", "High"]), sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '30 days'`))
            .orderBy(desc(inspectionsTable.riskScore))
            .limit(5),
          db
            .select({ id: tasksTable.id, title: tasksTable.title, priority: tasksTable.priority, dueDate: tasksTable.dueDate, projectName: projectsTable.name })
            .from(tasksTable)
            .leftJoin(projectsTable, eq(projectsTable.id, tasksTable.projectId))
            .where(and(eq(projectsTable.companyId, companyId), lt(tasksTable.dueDate, today), ne(tasksTable.status, "done")))
            .limit(8),
          db
            .select({ name: projectsTable.name, status: projectsTable.status })
            .from(projectsTable)
            .where(and(eq(projectsTable.companyId, companyId), eq(projectsTable.status, "active")))
            .limit(6),
          db
            .select({ projectName: projectsTable.name, reportDate: dailyReportsTable.reportDate, issues: dailyReportsTable.issues })
            .from(dailyReportsTable)
            .leftJoin(projectsTable, eq(projectsTable.id, dailyReportsTable.projectId))
            .where(and(eq(projectsTable.companyId, companyId), sql`${dailyReportsTable.reportDate}::date >= NOW() - INTERVAL '2 days'`))
            .orderBy(desc(dailyReportsTable.reportDate))
            .limit(5),
          // Total outstanding company-wide invoices
          db
            .select({ total: invoicesTable.total })
            .from(invoicesTable)
            .where(and(eq(invoicesTable.companyId, companyId), sql`${invoicesTable.status} IN ('sent', 'overdue')`)),
          // Compliance: worker certifications expiring within 30 days or already expired, company-wide
          db
            .select({ id: workerDocumentsTable.id })
            .from(workerDocumentsTable)
            .where(and(eq(workerDocumentsTable.companyId, companyId), eq(workerDocumentsTable.status, "active"), isNotNull(workerDocumentsTable.expirationDate), lt(workerDocumentsTable.expirationDate, new Date(in30Days))))
            ,
        ]);

      const outstandingAmt = outstandingInvoices.reduce((s, r) => s + parseFloat(r.total ?? "0"), 0);
      const fmtAmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(outstandingAmt);

      dailyData = `
${dateHeader}

UNREAD CRITICAL/HIGH SAFETY ALERTS (${criticalAlerts.length}):
${criticalAlerts.length === 0 ? "None" : criticalAlerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.message}`).join("\n")}

HIGH/CRITICAL RISK INSPECTIONS (last 30 days, ${highRiskInspections.length}):
${highRiskInspections.length === 0 ? "None" : highRiskInspections.map((i) => `- ${i.inspectionType} inspection on ${i.date} — ${i.projectName ?? "No project"} — Risk ${i.riskLevel} (score: ${i.riskScore ?? "N/A"}/10)`).join("\n")}

OVERDUE TASKS COMPANY-WIDE (${overdueTasks.length}):
${overdueTasks.length === 0 ? "None" : overdueTasks.map((t) => `- [${t.priority}] "${t.title}" — ${t.projectName ?? "No project"} — due ${t.dueDate}`).join("\n")}

ACTIVE PROJECTS (${activeProjects.length}):
${activeProjects.length === 0 ? "None" : activeProjects.map((p) => `- ${p.name}`).join("\n")}

RECENT DAILY REPORTS (last 48 hrs, ${recentReports.length}):
${recentReports.length === 0 ? "None" : recentReports.map((r) => `- ${r.projectName ?? "Unknown"} on ${r.reportDate}${r.issues ? `: Issues: ${r.issues}` : ""}`).join("\n")}

OUTSTANDING INVOICES (${outstandingInvoices.length}, totalling ${fmtAmt}):
${outstandingInvoices.length === 0 ? "None" : `${outstandingInvoices.length} invoice(s) outstanding totalling ${fmtAmt}`}

COMPLIANCE (worker certifications expiring within 30 days or expired, company-wide):
${expiringDocs.length === 0 ? "None" : `${expiringDocs.length} certification(s) need attention`}
`.trim();

      systemPrompt = `You are a construction operations assistant generating a daily executive briefing for a company owner.

Your goal is to give the owner a macro-level, org-wide picture across every active job site.

INSTRUCTIONS:
- Be concise and actionable
- Prioritize safety, financial exposure, and compliance risk across the whole company
- Use clear, professional language

OUTPUT FORMAT:
1. 🚨 Critical Alerts (if any)
2. ⚠️ High-Risk Areas
3. 💰 Financial Snapshot (outstanding invoices)
4. 📋 Compliance Metrics
5. 🛠️ Priority Actions for Today
6. 📉 Issues & Delays

Keep total output under 200 words. Only include sections that have relevant data. If a section has no data, skip it entirely.`;
    } else if (userRole === "foreman") {
      // ---- Foreman / Site Lead: strictly the projects they are actively assigned to ----
      const memberRows = await db
        .select({ projectId: projectMembersTable.projectId })
        .from(projectMembersTable)
        .where(and(eq(projectMembersTable.companyId, companyId), eq(projectMembersTable.userId, userId)));
      const projectIds = [...new Set(memberRows.map((r) => r.projectId))];

      if (projectIds.length === 0) {
        res.json({ briefing: "You have no active project assignments right now — check back once you're assigned to a job site.", generatedAt: new Date().toISOString() });
        return;
      }

      const [criticalAlerts, highRiskInspections, overdueTasks, myProjects, recentReports, pendingSignoffs, crewSchedule] =
        await Promise.all([
          db
            .select({ id: inspectionAlertsTable.id, message: inspectionAlertsTable.message, severity: inspectionAlertsTable.severity, type: inspectionAlertsTable.type })
            .from(inspectionAlertsTable)
            .where(and(eq(inspectionAlertsTable.companyId, companyId), inArray(inspectionAlertsTable.projectId, projectIds), eq(inspectionAlertsTable.isRead, false), inArray(inspectionAlertsTable.severity, ["critical", "high"])))
            .orderBy(desc(inspectionAlertsTable.createdAt))
            .limit(10),
          db
            .select({ id: inspectionsTable.id, inspectionType: inspectionsTable.inspectionType, riskLevel: inspectionsTable.riskLevel, riskScore: inspectionsTable.riskScore, date: inspectionsTable.date, projectName: projectsTable.name })
            .from(inspectionsTable)
            .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
            .where(and(inArray(inspectionsTable.projectId, projectIds), inArray(inspectionsTable.riskLevel, ["Critical", "High"]), sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '30 days'`))
            .orderBy(desc(inspectionsTable.riskScore))
            .limit(5),
          db
            .select({ id: tasksTable.id, title: tasksTable.title, priority: tasksTable.priority, dueDate: tasksTable.dueDate, projectName: projectsTable.name })
            .from(tasksTable)
            .leftJoin(projectsTable, eq(projectsTable.id, tasksTable.projectId))
            .where(and(inArray(tasksTable.projectId, projectIds), lt(tasksTable.dueDate, today), ne(tasksTable.status, "done")))
            .limit(8),
          db
            .select({ name: projectsTable.name, status: projectsTable.status })
            .from(projectsTable)
            .where(and(inArray(projectsTable.id, projectIds), eq(projectsTable.status, "active")))
            .limit(6),
          db
            .select({ projectName: projectsTable.name, reportDate: dailyReportsTable.reportDate, issues: dailyReportsTable.issues })
            .from(dailyReportsTable)
            .leftJoin(projectsTable, eq(projectsTable.id, dailyReportsTable.projectId))
            .where(and(inArray(dailyReportsTable.projectId, projectIds), sql`${dailyReportsTable.reportDate}::date >= NOW() - INTERVAL '2 days'`))
            .orderBy(desc(dailyReportsTable.reportDate))
            .limit(5),
          // Urgent field logs / safety directives needing sign-off on your sites
          db
            .select({ id: formSubmissionsTable.id, projectName: projectsTable.name })
            .from(formSubmissionsTable)
            .leftJoin(projectsTable, eq(projectsTable.id, formSubmissionsTable.projectId))
            .where(and(inArray(formSubmissionsTable.projectId, projectIds), sql`${formSubmissionsTable.status} = 'submitted'`))
            .limit(10),
          // Crew scheduled on your sites today
          db
            .select({ projectName: projectsTable.name, startDate: workerSchedulesTable.startDate, endDate: workerSchedulesTable.endDate })
            .from(workerSchedulesTable)
            .leftJoin(projectsTable, eq(projectsTable.id, workerSchedulesTable.projectId))
            .where(and(inArray(workerSchedulesTable.projectId, projectIds), lte(workerSchedulesTable.startDate, today), gte(workerSchedulesTable.endDate, today)))
            .limit(15),
        ]);

      dailyData = `
${dateHeader}

UNREAD CRITICAL/HIGH ALERTS ON YOUR SITES (${criticalAlerts.length}):
${criticalAlerts.length === 0 ? "None" : criticalAlerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.message}`).join("\n")}

HIGH/CRITICAL RISK INSPECTIONS ON YOUR SITES (last 30 days, ${highRiskInspections.length}):
${highRiskInspections.length === 0 ? "None" : highRiskInspections.map((i) => `- ${i.inspectionType} inspection on ${i.date} — ${i.projectName ?? "No project"} — Risk ${i.riskLevel} (score: ${i.riskScore ?? "N/A"}/10)`).join("\n")}

OVERDUE TASKS ON YOUR SITES (${overdueTasks.length}):
${overdueTasks.length === 0 ? "None" : overdueTasks.map((t) => `- [${t.priority}] "${t.title}" — ${t.projectName ?? "No project"} — due ${t.dueDate}`).join("\n")}

YOUR ASSIGNED ACTIVE PROJECTS (${myProjects.length}):
${myProjects.length === 0 ? "None" : myProjects.map((p) => `- ${p.name}`).join("\n")}

RECENT DAILY REPORTS ON YOUR SITES (last 48 hrs, ${recentReports.length}):
${recentReports.length === 0 ? "None" : recentReports.map((r) => `- ${r.projectName ?? "Unknown"} on ${r.reportDate}${r.issues ? `: Issues: ${r.issues}` : ""}`).join("\n")}

FIELD LOGS/FORMS AWAITING YOUR SIGN-OFF (${pendingSignoffs.length}):
${pendingSignoffs.length === 0 ? "None" : pendingSignoffs.map((f) => `- Submission on ${f.projectName ?? "your site"} awaiting review`).join("\n")}

CREW SCHEDULED TODAY (${crewSchedule.length}):
${crewSchedule.length === 0 ? "None" : crewSchedule.map((s) => `- ${s.projectName ?? "a site"} (${s.startDate} to ${s.endDate})`).join("\n")}
`.trim();

      systemPrompt = `You are a construction operations assistant generating a daily briefing for a foreman/site lead.

Your goal is to help the foreman prioritize their day across ONLY the job sites they are assigned to.

INSTRUCTIONS:
- Be concise and actionable
- Focus only on important items on the foreman's own assigned sites
- Prioritize safety, risk, and delays
- Use clear, professional language

OUTPUT FORMAT:
1. 🚨 Critical Alerts (if any)
2. ⚠️ High-Risk Areas
3. 🛠️ Priority Actions for Today
4. 📅 Today's Site Schedule
5. 📝 Sign-offs Needed
6. 📉 Issues & Delays

Keep total output under 200 words. Only include sections that have relevant data. If a section has no data, skip it entirely.`;
    } else {
      // ---- Standard Worker / Crew Member: only their own tasks, schedule, and document compliance ----
      const [myTasks, myScheduleToday, myDocs] = await Promise.all([
        db
          .select({ id: tasksTable.id, title: tasksTable.title, priority: tasksTable.priority, dueDate: tasksTable.dueDate, projectName: projectsTable.name })
          .from(tasksTable)
          .leftJoin(projectsTable, eq(projectsTable.id, tasksTable.projectId))
          .where(and(eq(tasksTable.assignedToUserId, userId), ne(tasksTable.status, "done"), lte(tasksTable.dueDate, today)))
          .limit(10),
        db
          .select({ projectName: projectsTable.name, startDate: workerSchedulesTable.startDate, endDate: workerSchedulesTable.endDate })
          .from(workerSchedulesTable)
          .leftJoin(projectsTable, eq(projectsTable.id, workerSchedulesTable.projectId))
          .where(and(eq(workerSchedulesTable.userId, userId), lte(workerSchedulesTable.startDate, today), gte(workerSchedulesTable.endDate, today)))
          .limit(5),
        db
          .select({ id: workerDocumentsTable.id, documentType: workerDocumentsTable.documentType, expirationDate: workerDocumentsTable.expirationDate })
          .from(workerDocumentsTable)
          .where(and(eq(workerDocumentsTable.workerId, userId), eq(workerDocumentsTable.companyId, companyId), eq(workerDocumentsTable.status, "active"), isNotNull(workerDocumentsTable.expirationDate), lt(workerDocumentsTable.expirationDate, new Date(in30Days))))
          .limit(10),
      ]);

      if (myTasks.length === 0 && myScheduleToday.length === 0 && myDocs.length === 0) {
        res.json({ briefing: "You're all caught up! No critical alerts for your assigned tasks today.", generatedAt: new Date().toISOString() });
        return;
      }

      dailyData = `
${dateHeader}

YOUR TASKS DUE TODAY OR OVERDUE (${myTasks.length}):
${myTasks.length === 0 ? "None" : myTasks.map((t) => `- [${t.priority}] "${t.title}" — ${t.projectName ?? "No project"} — due ${t.dueDate}`).join("\n")}

YOUR SCHEDULE TODAY (${myScheduleToday.length}):
${myScheduleToday.length === 0 ? "None" : myScheduleToday.map((s) => `- ${s.projectName ?? "a site"} (${s.startDate} to ${s.endDate})`).join("\n")}

YOUR CERTIFICATIONS EXPIRING WITHIN 30 DAYS (${myDocs.length}):
${myDocs.length === 0 ? "None" : myDocs.map((d) => `- ${d.documentType} expires ${d.expirationDate}`).join("\n")}
`.trim();

      systemPrompt = `You are a construction field assistant generating a short daily briefing for a crew member — NOT a manager.

INSTRUCTIONS:
- Extremely concise: use short bullet points only, no paragraphs
- Cover at most 3 short sections: Today's Tasks, Your Schedule, Compliance Alerts
- Only include a section if it has data — skip empty sections entirely
- Keep total output under 60 words so it can be read on-site without scrolling
- Use a friendly, direct tone`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DATA:\n${dailyData}` },
      ],
    }, { signal: aiSignal(15_000) });

    const briefing = response.choices[0]?.message?.content ?? "No briefing available.";
    res.json({ briefing, generatedAt: new Date().toISOString() });
  }),
);

// ── Voice Command Classification ─────────────────────────────────────────────
const VoiceClassifyInput = z.strictObject({
  transcript: z.string().min(1).max(500),
  projectNames: z.array(z.string().max(200)).max(100).optional().default([]),
});

router.post(
  "/ai/voice-classify",
  requireAuth,
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const parsed = VoiceClassifyInput.safeParse(req.body);
    if (!parsed.success) {
      req.log?.warn({ issues: parsed.error.issues }, "voice-classify: invalid body");
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
      return;
    }

    const { transcript, projectNames } = parsed.data;
    req.log?.info({ transcriptPreview: transcript.slice(0, 40) }, "voice-classify: processing");

    const projectList =
      projectNames.length > 0
        ? `Known project names: ${projectNames.map((n) => `"${n}"`).join(", ")}`
        : "No project names provided.";

    const prompt = `You are a voice command classifier for a Canadian construction project management app.

Classify the following voice transcript into a structured intent.

${projectList}

Return ONLY a valid JSON object. Do NOT include markdown or explanation.

Intent types and their required fields:
- ADD_DAILY_LOG: { "intent": "ADD_DAILY_LOG", "project": string|null, "notes": string }
- LOG_HOURS: { "intent": "LOG_HOURS", "worker": string, "hours": number, "project": string|null }
- LOG_OWN_HOURS: { "intent": "LOG_OWN_HOURS", "hours": number, "project": string|null }
- MARK_TASK_DONE: { "intent": "MARK_TASK_DONE", "taskName": string, "project": string|null }
- LOG_DELAY: { "intent": "LOG_DELAY", "hours": number, "reason": string, "project": string|null }
- LOG_EXPENSE: { "intent": "LOG_EXPENSE", "amount": number, "description": string, "vendor": string|null, "project": string|null }
- CREATE_RFI: { "intent": "CREATE_RFI", "subject": string, "project": string|null }
- MATERIAL_ALERT: { "intent": "MATERIAL_ALERT", "item": string, "project": string|null }
- CREATE_QUOTE: { "intent": "CREATE_QUOTE", "description": string, "clientName": string|null, "project": string|null }
- NAVIGATE: { "intent": "NAVIGATE", "target": "Calculators"|"Schedule"|"Projects"|"Ask"|"Tasks"|"Invoices"|"Reports" }
- UNKNOWN: { "intent": "UNKNOWN" }

Rules:
- For ADD_DAILY_LOG with no notes content, use "Update logged via voice" as the notes value.
- If a project name is mentioned, extract it as closely as possible to the known project list. Set to null if uncertain.
- "I" or "me" as the worker means LOG_OWN_HOURS.
- If no intent can be confidently determined, return UNKNOWN.

Transcript: "${transcript}"`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }, { signal: aiSignal(15_000) });

      const content = response.choices[0]?.message?.content?.trim() ?? "";
      try {
        const raw = JSON.parse(content);
        const VoiceClassifyOutputSchema = z.object({
          intent: z.string(),
          project: z.string().nullable().optional(),
          notes: z.string().optional(),
          hours: z.number().optional(),
          worker: z.string().optional(),
          taskName: z.string().optional(),
          reason: z.string().optional(),
          amount: z.number().optional(),
          description: z.string().optional(),
          vendor: z.string().nullable().optional(),
          subject: z.string().optional(),
          item: z.string().optional(),
          target: z.string().optional(),
          clientName: z.string().nullable().optional(),
        });
        const validated = VoiceClassifyOutputSchema.safeParse(raw);
        res.json(validated.success ? validated.data : { intent: "UNKNOWN" });
      } catch {
        res.json({ intent: "UNKNOWN" });
      }
    } catch (err: unknown) {
      req.log?.error({ err }, "Voice classify failed");
      res.json({ intent: "UNKNOWN" });
    }
  }),
);

export default router;
