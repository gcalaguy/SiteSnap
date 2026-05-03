import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, estimatesTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";
import { z } from "zod";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── AI Prompt ─────────────────────────────────────────────────────────────────

function buildEstimatePrompt(scope: string): string {
  return `You are a senior Canadian construction estimator with 20+ years of experience. 
Generate a detailed, realistic cost estimate for the following project scope.
Use Canadian pricing (CAD). Include HST/GST considerations in your notes.

PROJECT SCOPE:
${scope}

Return ONLY a valid JSON object with EXACTLY this structure — no markdown, no explanation:
{
  "title": "short descriptive project title (max 60 chars)",
  "summary": "2-3 sentence executive summary of the project and estimate approach",
  "materials": [
    { "item": "material name", "quantity": 0, "unit": "unit of measure", "unitCost": 0, "total": 0 }
  ],
  "labor": [
    { "trade": "trade/role name", "hours": 0, "hourlyRate": 0, "total": 0 }
  ],
  "equipment": [
    { "item": "equipment name", "days": 0, "dayRate": 0, "total": 0 }
  ],
  "subtotal": 0,
  "contingencyPct": 10,
  "contingency": 0,
  "totalLow": 0,
  "totalHigh": 0,
  "assumptions": ["assumption 1", "assumption 2"],
  "notes": "any important caveats, exclusions, or clarifications"
}

Rules:
- All dollar amounts in CAD, as plain numbers (no $ symbol)
- materials must have at least 3 line items if scope mentions construction materials
- labor must have at least 2 trades
- totalLow = subtotal (tight budget), totalHigh = subtotal + contingency + 15% buffer
- contingency is typically 10-15% of subtotal
- hourlyRate for trades: carpenter/framer $55-75, electrician $85-110, plumber $90-120, general labour $35-50, project manager $95-130 (CAD, Ontario/BC rates)
- Be realistic and specific — this is used for real project budgeting`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function extractTextFromFile(buffer: Buffer, mimetype: string, filename: string): Promise<string | null> {
  const mime = mimetype.toLowerCase();

  if (mime.includes("pdf")) {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      return parsed.text?.trim() || null;
    } catch {
      return null;
    }
  }

  if (mime.includes("word") || mime.includes("docx") || filename.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    } catch {
      return null;
    }
  }

  if (mime.includes("text")) {
    return buffer.toString("utf-8").trim();
  }

  return null; // image — handled via vision
}

async function generateEstimateFromScope(scope: string): Promise<Record<string, unknown>> {
  const prompt = buildEstimatePrompt(scope);
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const clean = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

async function generateEstimateFromImage(buffer: Buffer, mimetype: string, userHint: string): Promise<Record<string, unknown>> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimetype};base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a senior Canadian construction estimator. Analyze this construction plan/drawing/document and generate a detailed cost estimate.
${userHint ? `Additional context from the user: ${userHint}` : ""}

${buildEstimatePrompt("Based on the attached plan/image")}`,
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const clean = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

// ── GET /api/estimates ────────────────────────────────────────────────────────

router.get("/estimates", requireAuth, requireCompany, async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const estimates = await db
    .select()
    .from(estimatesTable)
    .where(eq(estimatesTable.companyId, req.companyId!))
    .orderBy(desc(estimatesTable.createdAt));

  res.json(estimates);
});

// ── POST /api/estimates/generate (text scope) ─────────────────────────────────

const GenerateTextBody = z.object({
  scope: z.string().min(20, "Please provide at least 20 characters of scope description"),
});

router.post("/estimates/generate", requireAuth, requireCompany, async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const parsed = GenerateTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const { scope } = parsed.data;

  // Insert placeholder
  const [estimate] = await db.insert(estimatesTable).values({
    companyId: req.companyId!,
    createdByUserId: req.userId!,
    title: "Generating…",
    scopeText: scope,
    sourceType: "text",
    status: "generating",
    result: null,
  }).returning();

  // Generate in background, stream result
  try {
    const result = await generateEstimateFromScope(scope);
    const title = typeof result.title === "string" ? result.title : scope.slice(0, 60);

    const [updated] = await db.update(estimatesTable)
      .set({ title, result, status: "ready", updatedAt: new Date() })
      .where(eq(estimatesTable.id, estimate.id))
      .returning();

    res.json(updated);
  } catch (err: unknown) {
    req.log?.error({ err }, "Estimate generation failed");
    await db.update(estimatesTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(estimatesTable.id, estimate.id));
    res.status(500).json({ error: "AI estimate generation failed" });
  }
});

// ── POST /api/estimates/generate-from-file (multipart) ───────────────────────

router.post(
  "/estimates/generate-from-file",
  requireAuth,
  requireCompany,
  upload.single("file"),
  async (req, res) => {
    const role = req.userRole;
    if (role !== "owner" && role !== "foreman") {
      res.status(403).json({ error: "Foreman or owner role required" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const hint = typeof req.body?.hint === "string" ? req.body.hint : "";
    const mime = file.mimetype.toLowerCase();
    const isImage = mime.startsWith("image/");

    // Insert placeholder
    const [estimate] = await db.insert(estimatesTable).values({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      title: "Generating…",
      scopeText: hint || null,
      sourceType: "file",
      sourceFilename: file.originalname,
      status: "generating",
      result: null,
    }).returning();

    try {
      let result: Record<string, unknown>;

      if (isImage) {
        result = await generateEstimateFromImage(file.buffer, mime, hint);
      } else {
        const text = await extractTextFromFile(file.buffer, mime, file.originalname);
        const scope = [hint, text].filter(Boolean).join("\n\n");
        if (!scope.trim()) {
          throw new Error("Could not extract text from the uploaded file");
        }
        result = await generateEstimateFromScope(scope);
      }

      const title = typeof result.title === "string" ? result.title : file.originalname;
      const [updated] = await db.update(estimatesTable)
        .set({ title, result, status: "ready", updatedAt: new Date() })
        .where(eq(estimatesTable.id, estimate.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      req.log?.error({ err }, "File estimate generation failed");
      await db.update(estimatesTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(estimatesTable.id, estimate.id));
      res.status(500).json({ error: err instanceof Error ? err.message : "AI estimate generation failed" });
    }
  },
);

// ── DELETE /api/estimates/:id ─────────────────────────────────────────────────

router.delete("/estimates/:id", requireAuth, requireCompany, async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.companyId, req.companyId!)));

  res.status(204).send();
});

export default router;
