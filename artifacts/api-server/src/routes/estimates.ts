import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, estimatesTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requirePermission } from "../lib/permissionGate.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { readFile } from "fs/promises";

const router = Router();

/** HTML-escape helper — prevents injection of user data into email templates */
const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

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
      // @ts-ignore
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim() ?? "";
      if (text.length >= 10) return text;
    } catch { /* fall through to OCR */ }

    // OCR fallback for image-only / scanned PDFs
    try {
      const { convertPDFPagesToImages } = await import("../lib/pdfOcr.js");
      const images = await convertPDFPagesToImages(buffer, 3, 200);
      if (images.length === 0) return null;
      const visionContent: any = [
        { type: "text", text: "Extract all visible text, dimensions, labels, and project specifications from these construction document images. Transcribe everything verbatim." },
      ];
      for (const img of images) {
        visionContent.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
        });
      }
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 4096,
        messages: [{ role: "user", content: visionContent }],
      });
      return visionResponse.choices[0]?.message?.content?.trim() || null;
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

router.get("/estimates", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewQuotes"), asyncHandler(async (req, res) => {
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
}))

// ── POST /api/estimates/generate (text scope) ─────────────────────────────────

const GenerateTextBody = z.object({
  scope: z.string().min(20, "Please provide at least 20 characters of scope description").max(10000, "Scope must be at most 10 000 characters"),
});

router.post("/estimates/generate", requireAuth, requireCompany, requireTenantCtx, requirePermission("manageQuotes"), requireAiQuota, asyncHandler(async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const parsed = GenerateTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
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
}))

// ── POST /api/estimates/generate-from-file (multipart) ───────────────────────

router.post(
  "/estimates/generate-from-file",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("manageQuotes"),
  requireAiQuota,
  diskUpload.single("file"),
  asyncHandler(async (req, res) => {
    const role = req.userRole;
    if (role !== "owner" && role !== "foreman") {
      await cleanupUpload(req.file?.path);
      res.status(403).json({ error: "Foreman or owner role required" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const rawHint = typeof req.body?.hint === "string" ? req.body.hint : "";
    const hintParsed = z.string().max(2000, "Hint must be at most 2 000 characters").safeParse(rawHint);
    if (!hintParsed.success) {
      await cleanupUpload(file.path);
      res.status(400).json({ error: "Malformed request payload", details: hintParsed.error.issues });
      return;
    }
    const hint = hintParsed.data;
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

      // Read from temp disk file only when needed for processing
      const fileBuffer = await readFile(file.path);

      if (isImage) {
        result = await generateEstimateFromImage(fileBuffer, mime, hint);
      } else {
        const text = await extractTextFromFile(fileBuffer, mime, file.originalname);
        const scope = [hint, text].filter(Boolean).join("\n\n");
        if (!scope.trim()) {
          throw new Error("Could not extract text from the uploaded file. For scanned PDFs, the OCR service may have failed.");
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
    } finally {
      await cleanupUpload(file.path);
    }
  }),
);

// ── POST /api/estimates/:id/email ────────────────────────────────────────────

const EmailEstimateBody = z.object({
  to: z.string().email("Please enter a valid email address").max(254, "Email address too long"),
  message: z.string().max(2000, "Message must be at most 2 000 characters").optional(),
});

router.post("/estimates/:id/email", requireAuth, requireCompany, requireTenantCtx, requirePermission("manageQuotes"), asyncHandler(async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = EmailEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }

  const { to, message } = parsed.data;

  const [estimate] = await db.select().from(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.companyId, req.companyId!)));

  if (!estimate) { res.status(404).json({ error: "Estimate not found" }); return; }
  if (estimate.status !== "ready") { res.status(400).json({ error: "Estimate is not ready" }); return; }

  const r = (estimate.result ?? {}) as Record<string, any>;

  function cad(n: number | undefined | null) {
    if (n == null) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
  }

  function sumLines(lines: { total: number }[] | undefined) {
    return (lines ?? []).reduce((s: number, l: any) => s + (l.total ?? 0), 0);
  }

  const materialsTotal = sumLines(r.materials);
  const laborTotal = sumLines(r.labor);
  const equipmentTotal = sumLines(r.equipment);
  const subtotal = r.subtotal ?? (materialsTotal + laborTotal + equipmentTotal);
  const contingency = r.contingency ?? Math.round(subtotal * ((r.contingencyPct ?? 10) / 100));
  const totalLow = r.totalLow ?? subtotal;
  const totalHigh = r.totalHigh ?? (subtotal + contingency);

  function tableRows(rows: any[], cols: (k: any) => string[]) {
    return (rows ?? []).map((row) =>
      `<tr>${cols(row).map((c, i) => `<td style="padding:7px 10px;border-bottom:1px solid #eee;${i > 0 ? "text-align:right;" : ""}">${c}</td>`).join("")}</tr>`
    ).join("");
  }

  const materialsSection = (r.materials ?? []).length > 0 ? `
    <h3 style="color:#172034;margin:24px 0 8px">Materials</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#FF6600;color:#fff">
        <th style="padding:8px 10px;text-align:left">Item</th>
        <th style="padding:8px 10px;text-align:right">Qty</th>
        <th style="padding:8px 10px;text-align:right">Unit</th>
        <th style="padding:8px 10px;text-align:right">Unit Cost</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${tableRows(r.materials, (m) => [m.item, m.quantity, m.unit, cad(m.unitCost), cad(m.total)])}</tbody>
      <tfoot><tr style="background:#f5f5f5;font-weight:bold">
        <td colspan="4" style="padding:7px 10px;text-align:right">Subtotal</td>
        <td style="padding:7px 10px;text-align:right">${cad(materialsTotal)}</td>
      </tr></tfoot>
    </table>` : "";

  const laborSection = (r.labor ?? []).length > 0 ? `
    <h3 style="color:#172034;margin:24px 0 8px">Labour</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#1E50A0;color:#fff">
        <th style="padding:8px 10px;text-align:left">Trade / Role</th>
        <th style="padding:8px 10px;text-align:right">Hours</th>
        <th style="padding:8px 10px;text-align:right">Rate/hr</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${tableRows(r.labor, (l) => [l.trade, l.hours, cad(l.hourlyRate), cad(l.total)])}</tbody>
      <tfoot><tr style="background:#f5f5f5;font-weight:bold">
        <td colspan="3" style="padding:7px 10px;text-align:right">Subtotal</td>
        <td style="padding:7px 10px;text-align:right">${cad(laborTotal)}</td>
      </tr></tfoot>
    </table>` : "";

  const equipmentSection = (r.equipment ?? []).length > 0 ? `
    <h3 style="color:#172034;margin:24px 0 8px">Equipment</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#B46400;color:#fff">
        <th style="padding:8px 10px;text-align:left">Equipment</th>
        <th style="padding:8px 10px;text-align:right">Days</th>
        <th style="padding:8px 10px;text-align:right">Day Rate</th>
        <th style="padding:8px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${tableRows(r.equipment, (e) => [e.item, e.days, cad(e.dayRate), cad(e.total)])}</tbody>
      <tfoot><tr style="background:#f5f5f5;font-weight:bold">
        <td colspan="3" style="padding:7px 10px;text-align:right">Subtotal</td>
        <td style="padding:7px 10px;text-align:right">${cad(equipmentTotal)}</td>
      </tr></tfoot>
    </table>` : "";

  const assumptionsSection = (r.assumptions ?? []).length > 0 ? `
    <h3 style="color:#172034;margin:24px 0 8px">Assumptions</h3>
    <ul style="font-size:13px;color:#444;padding-left:20px;margin:0">
      ${(r.assumptions as string[]).map((a) => `<li style="margin-bottom:4px">${a}</li>`).join("")}
    </ul>` : "";

  const notesSection = r.notes ? `
    <h3 style="color:#172034;margin:24px 0 8px">Notes</h3>
    <p style="font-size:13px;color:#444;margin:0">${r.notes}</p>` : "";

  const personalNote = message ? `
    <div style="background:#fff8f0;border-left:4px solid #FF6600;padding:12px 16px;margin-bottom:24px;border-radius:4px">
      <p style="margin:0;font-size:13px;color:#555">${esc(message)}</p>
    </div>` : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Construction Estimate: ${esc(estimate.title)}</title></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <div style="background:#172034;padding:24px 32px">
      <div style="color:#FF6600;font-size:22px;font-weight:bold;letter-spacing:1px">SITE SNAP</div>
      <div style="color:#aaa;font-size:12px;margin-top:2px">AI Estimating Engine</div>
    </div>
    <div style="padding:32px">
      ${personalNote}
      <h1 style="color:#172034;margin:0 0 4px;font-size:22px">${esc(estimate.title)}</h1>
      ${r.summary ? `<p style="color:#555;font-size:14px;margin:8px 0 0">${r.summary}</p>` : ""}

      <div style="background:#172034;border-radius:8px;padding:20px 24px;margin:24px 0">
        <div style="color:#FF6600;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Estimated Total Range (CAD)</div>
        <div style="color:#fff;font-size:28px;font-weight:bold">${cad(totalLow)} – ${cad(totalHigh)}</div>
        <div style="color:#aaa;font-size:12px;margin-top:6px">Subtotal ${cad(subtotal)} · Contingency (${r.contingencyPct ?? 10}%) ${cad(contingency)} · excl. HST/GST</div>
      </div>

      ${materialsSection}
      ${laborSection}
      ${equipmentSection}
      ${assumptionsSection}
      ${notesSection}

      <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;text-align:center;color:#aaa;font-size:11px">
        Generated by Site Snap AI Estimating Engine · All amounts in CAD · Excludes HST/GST
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const { sendEmail } = await import("../lib/mailer.js");
    await sendEmail({
      to: [to],
      subject: `Construction Estimate: ${esc(estimate.title)}`,
      html,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.constructor.name === "ResendSandboxError") {
      const sandboxErr = err as any;
      res.status(422).json({ error: "sandbox", allowedEmail: sandboxErr.allowedEmail });
      return;
    }
    req.log?.error({ err }, "Estimate email send failed");
    res.status(500).json({ error: "Failed to send email" });
  }
}))

// ── PATCH /api/estimates/:id — update title + result ─────────────────────────

const PatchEstimateBody = z.object({
  title: z.string().min(1).max(200, "Title must be at most 200 characters").optional(),
  result: z.record(z.unknown()).optional(),
});

router.patch("/estimates/:id", requireAuth, requireCompany, requireTenantCtx, requirePermission("manageQuotes"), asyncHandler(async (req, res) => {
  const role = req.userRole;
  if (role !== "owner" && role !== "foreman") {
    res.status(403).json({ error: "Foreman or owner role required" });
    return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = PatchEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
    return;
  }

  const [estimate] = await db.select().from(estimatesTable)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.companyId, req.companyId!)));
  if (!estimate) { res.status(404).json({ error: "Estimate not found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.result != null) updates.result = parsed.data.result;

  const [updated] = await db.update(estimatesTable)
    .set(updates as any)
    .where(and(eq(estimatesTable.id, id), eq(estimatesTable.companyId, req.companyId!)))
    .returning();

  res.json(updated);
}))

// ── DELETE /api/estimates/:id ─────────────────────────────────────────────────

router.delete("/estimates/:id", requireAuth, requireCompany, requireTenantCtx, requirePermission("manageQuotes"), asyncHandler(async (req, res) => {
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
}))

export default router;
