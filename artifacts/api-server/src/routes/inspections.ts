import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  inspectionsTable,
  inspectionItemsTable,
  inspectionAlertsTable,
  usersTable,
  userMembershipsTable,
  projectsTable,
  companiesTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { requireFeature } from "../lib/featureGate";
import { notify } from "../lib/notify";
import { sendEmail } from "../lib/mailer";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  INSPECTION_SUMMARY_PROMPT,
  RISK_SCORING_PROMPT,
  FAILED_ITEM_ANALYSIS_PROMPT,
} from "../lib/inspectionPrompts";
import { logger } from "../lib/logger";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

const InspectionItemSchema = z.object({
  itemName: z.string().min(1),
  status: z.enum(["pass", "fail", "na"]).default("pass"),
  severity: z.enum(["low", "medium", "high"]).default("low"),
  comment: z.string().optional(),
  photoUrl: z.string().optional(),
});

const CreateInspectionBody = z.object({
  projectId: z.number().optional().nullable(),
  inspectionType: z
    .enum(["general", "safety", "quality", "progress", "electrical", "structural", "fire", "environmental"])
    .default("general"),
  date: z.string().min(1),
  items: z.array(InspectionItemSchema).min(1, "At least one checklist item required"),
  submit: z.boolean().default(false), // true = submit immediately, false = save draft
});

// ── Alert Engine ──────────────────────────────────────────────────────────────

async function runAlertEngine(
  inspectionId: number,
  companyId: number,
  projectId: number | null | undefined,
  riskScore: number,
  items: { status: string; severity: string }[],
): Promise<void> {
  const alerts: { type: string; message: string; severity: string }[] = [];

  if (riskScore >= 9) {
    alerts.push({ type: "risk", severity: "critical", message: "Critical risk inspection detected — immediate action required" });
  } else if (riskScore >= 7) {
    alerts.push({ type: "risk", severity: "high", message: "High-risk inspection detected — review required before work continues" });
  }

  const criticalFailures = items.filter((i) => i.status === "fail" && i.severity === "high");
  if (criticalFailures.length > 0) {
    alerts.push({ type: "failure", severity: "high", message: `Critical inspection failure — ${criticalFailures.length} high-severity item(s) failed` });
  }

  const allFailed = items.filter((i) => i.status === "fail");
  if (allFailed.length >= 3) {
    alerts.push({ type: "pattern", severity: allFailed.length >= 5 ? "high" : "medium", message: `Multiple failures detected — ${allFailed.length} checklist items failed` });
  }

  if (alerts.length === 0) return;

  await db.insert(inspectionAlertsTable).values(
    alerts.map((a) => ({
      companyId,
      projectId: projectId ?? null,
      inspectionId,
      type: a.type,
      message: a.message,
      severity: a.severity,
    })),
  );
}

// ── AI Analysis ───────────────────────────────────────────────────────────────

async function runAIAnalysis(
  inspectionId: number,
  inspectionType: string,
  date: string,
  items: { itemName: string; status: string; severity: string; comment?: string | null }[],
): Promise<void> {
  const itemsText = items
    .map((i) => `- ${i.itemName}: ${i.status.toUpperCase()} [severity: ${i.severity}]${i.comment ? ` — ${i.comment}` : ""}`)
    .join("\n");

  const failedItems = items.filter((i) => i.status === "fail");
  const passCount = items.filter((i) => i.status === "pass").length;
  const failCount = failedItems.length;
  const naCount = items.filter((i) => i.status === "na").length;
  const score = items.length > 0 ? Math.round((passCount / (items.length - naCount || 1)) * 100) : 100;

  const context = `Inspection Type: ${inspectionType}\nDate: ${date}\nScore: ${score}/100\nPass: ${passCount} | Fail: ${failCount} | N/A: ${naCount}\n\nChecklist Items:\n${itemsText}`;

  // Run all 3 AI calls in parallel
  const [summaryRes, riskRes, failedRes] = await Promise.all([
    openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: INSPECTION_SUMMARY_PROMPT },
        { role: "user", content: context },
      ],
      max_tokens: 600,
    }),
    openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: RISK_SCORING_PROMPT },
        { role: "user", content: context },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
    failedItems.length > 0
      ? openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: FAILED_ITEM_ANALYSIS_PROMPT },
            { role: "user", content: `Failed items:\n${failedItems.map((i) => `- ${i.itemName} [${i.severity}]${i.comment ? `: ${i.comment}` : ""}`).join("\n")}` },
          ],
          max_tokens: 500,
        })
      : Promise.resolve(null),
  ]);

  const aiSummary = summaryRes.choices[0]?.message.content ?? null;
  const failedItemAnalysis = failedRes?.choices[0]?.message.content ?? null;

  let riskLevel: string | null = null;
  let riskScore: string | null = null;

  try {
    const riskJson = JSON.parse(riskRes.choices[0]?.message.content ?? "{}");
    riskLevel = riskJson.overall_risk_level ?? null;
    riskScore = riskJson.risk_score != null ? String(riskJson.risk_score) : null;
  } catch {
    logger.warn("Failed to parse risk scoring JSON");
  }

  await db
    .update(inspectionsTable)
    .set({ aiSummary, riskLevel, riskScore, failedItemAnalysis, score, updatedAt: new Date() })
    .where(eq(inspectionsTable.id, inspectionId));

  return;
}

// ── GET /inspections — list inspections for company ──────────────────────────

router.get(
  "/inspections",
  requireAuth,
  requireCompany,
  requirePermission("viewInspectTab"),
  requireFeature("INSPECTIONS"),
  asyncHandler(async (req, res) => {
    const myMembership = await db
      .select({ role: userMembershipsTable.role })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, req.userId!),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);
    const myRole = myMembership[0]?.role;
    const isWorker = myRole === "worker";

    const rows = await db
      .select({
        inspection: inspectionsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        inspector: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName },
      })
      .from(inspectionsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, inspectionsTable.inspectorId))
      .where(
        and(
          eq(inspectionsTable.companyId, req.companyId!),
          isWorker ? eq(inspectionsTable.inspectorId, req.userId!) : undefined,
        ),
      )
      .orderBy(desc(inspectionsTable.createdAt));

    res.json(rows);
  }),
);

// ── GET /inspections/:id — detail with items ─────────────────────────────────

router.get(
  "/inspections/:id",
  requireAuth,
  requireCompany,
  requireFeature("INSPECTIONS"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [row] = await db
      .select({
        inspection: inspectionsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        inspector: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName },
      })
      .from(inspectionsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, inspectionsTable.inspectorId))
      .where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.companyId, req.companyId!)));

    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const items = await db
      .select()
      .from(inspectionItemsTable)
      .where(eq(inspectionItemsTable.inspectionId, id));

    res.json({ ...row, items });
  }),
);

// ── POST /inspections — create inspection (draft or submit) ──────────────────

router.post(
  "/inspections",
  requireAuth,
  requireCompany,
  requireFeature("INSPECTIONS"),
  asyncHandler(async (req, res) => {
    const parsed = CreateInspectionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { projectId, inspectionType, date, items, submit } = parsed.data;

    const [inspection] = await db
      .insert(inspectionsTable)
      .values({
        companyId: req.companyId!,
        projectId: projectId ?? null,
        inspectorId: req.userId!,
        inspectionType,
        date,
        status: submit ? "submitted" : "draft",
      })
      .returning();

    await db.insert(inspectionItemsTable).values(
      items.map((item) => ({ ...item, inspectionId: inspection.id, comment: item.comment ?? null, photoUrl: item.photoUrl ?? null })),
    );

    if (submit) {
      // Fire AI + alerts asynchronously (don't block the response)
      const itemsForAI = items.map((i) => ({ itemName: i.itemName, status: i.status, severity: i.severity, comment: i.comment ?? null }));
      runAIAnalysis(inspection.id, inspectionType, date, itemsForAI)
        .then(async () => {
          const [updated] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspection.id));
          await runAlertEngine(
            inspection.id,
            req.companyId!,
            projectId,
            parseFloat(updated?.riskScore ?? "0"),
            items,
          );
          // Notify foremen + owners
          await notifyTeam(req.companyId!, req.userId!, inspection.id, projectId ?? null, updated?.riskLevel ?? null);
        })
        .catch((err) => logger.error({ err }, "Inspection AI analysis failed"));
    }

    res.status(201).json(inspection);
  }),
);

// ── POST /inspections/:id/submit — submit a draft ────────────────────────────

router.post(
  "/inspections/:id/submit",
  requireAuth,
  requireCompany,
  requireFeature("INSPECTIONS"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [inspection] = await db
      .select()
      .from(inspectionsTable)
      .where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.companyId, req.companyId!)));

    if (!inspection) { res.status(404).json({ error: "Not found" }); return; }
    if (inspection.status === "submitted") { res.status(400).json({ error: "Already submitted" }); return; }

    await db.update(inspectionsTable).set({ status: "submitted", updatedAt: new Date() }).where(eq(inspectionsTable.id, id));

    const items = await db.select().from(inspectionItemsTable).where(eq(inspectionItemsTable.inspectionId, id));

    const itemsForAI = items.map((i) => ({ itemName: i.itemName, status: i.status, severity: i.severity, comment: i.comment }));
    runAIAnalysis(inspection.id, inspection.inspectionType, inspection.date, itemsForAI)
      .then(async () => {
        const [updated] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
        await runAlertEngine(id, req.companyId!, inspection.projectId, parseFloat(updated?.riskScore ?? "0"), items);
        await notifyTeam(req.companyId!, req.userId!, id, inspection.projectId, updated?.riskLevel ?? null);
      })
      .catch((err) => logger.error({ err }, "Inspection submit AI failed"));

    res.json({ success: true, message: "Inspection submitted. AI analysis running." });
  }),
);

// ── GET /inspection-alerts — list alerts ─────────────────────────────────────

router.get(
  "/inspection-alerts",
  requireAuth,
  requireCompany,
  requireFeature("INSPECTIONS"),
  asyncHandler(async (req, res) => {
    const alerts = await db
      .select({
        alert: inspectionAlertsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        inspection: { id: inspectionsTable.id, inspectionType: inspectionsTable.inspectionType, date: inspectionsTable.date },
      })
      .from(inspectionAlertsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, inspectionAlertsTable.projectId))
      .leftJoin(inspectionsTable, eq(inspectionsTable.id, inspectionAlertsTable.inspectionId))
      .where(eq(inspectionAlertsTable.companyId, req.companyId!))
      .orderBy(desc(inspectionAlertsTable.createdAt));

    res.json(alerts);
  }),
);

// ── PATCH /inspection-alerts/:id/read — mark one read ────────────────────────

router.patch(
  "/inspection-alerts/:id/read",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.update(inspectionAlertsTable).set({ isRead: true }).where(and(eq(inspectionAlertsTable.id, id), eq(inspectionAlertsTable.companyId, req.companyId!)));
    res.json({ success: true });
  }),
);

// ── PATCH /inspection-alerts/read-all — mark all read ────────────────────────

router.patch(
  "/inspection-alerts/read-all",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    await db.update(inspectionAlertsTable).set({ isRead: true }).where(eq(inspectionAlertsTable.companyId, req.companyId!));
    res.json({ success: true });
  }),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function notifyTeam(
  companyId: number,
  inspectorId: number,
  inspectionId: number,
  projectId: number | null,
  riskLevel: string | null,
): Promise<void> {
  try {
    const team = await db
      .select({ id: usersTable.id, email: usersTable.email, role: userMembershipsTable.role, firstName: usersTable.firstName })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, companyId),
          sql`${userMembershipsTable.role} IN ('owner','foreman')`,
        ),
      );

    const riskTag = riskLevel ? ` [${riskLevel} Risk]` : "";
    const title = `Inspection Submitted${riskTag}`;
    const body = `A new inspection has been submitted and AI analysis is complete.`;

    for (const member of team) {
      if (member.id === inspectorId) continue;
      await notify({
        userId: member.id,
        actorUserId: inspectorId,
        type: "inspection",
        title,
        body,
        referenceId: inspectionId,
        projectId: projectId ?? 0,
      }).catch(() => {});
    }

    // Email foremen + owners
    const emails = team.filter((m) => m.email).map((m) => m.email);
    if (emails.length > 0) {
      await sendEmail({
        to: emails,
        subject: `[Site Snap] New Inspection Submitted${riskTag}`,
        html: `<p>A new inspection has been submitted.</p><p><strong>Risk Level:</strong> ${riskLevel ?? "Pending"}</p><p>Log in to Site Snap to view the full AI summary and inspection details.</p>`,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "notifyTeam failed for inspection");
  }
}

export default router;
