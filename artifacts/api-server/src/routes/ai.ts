import { Router } from "express";
import { z } from "zod";
import { openai, speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany } from "../lib/auth";

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

  const systemPrompt = `You are BuildCore AI, a friendly and knowledgeable construction assistant for Canadian field crews and project managers.

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

export default router;
