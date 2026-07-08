import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  formTemplatesTable,
  formSubmissionsTable,
  submissionPhotosTable,
  submissionCommentsTable,
  usersTable,
  userMembershipsTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { requireAiQuota } from "../middlewares/requireAiQuota";
import { checkAiQuota, recordAiCall } from "../lib/aiRateLimiter";
import { parsePagination } from "../lib/pagination";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail, ResendSandboxError } from "../lib/mailer";
import { logger } from "../lib/logger";
import { processComplianceEvent } from "../services/compliance/processor";
import { processFormSubmission } from "../services/cor/evidenceAggregator";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod";

const router = Router();
const objectStorageService = new ObjectStorageService();

// Safe projection for embedding a user in a response — the submission detail
// UI shows the submitter's work email (same-company contact info, already
// exposed by the list endpoint above), but excludes clerkUserId, systemRole,
// and pushToken, none of which any caller here needs.
const PUBLIC_USER_COLUMNS = {
  id: usersTable.id,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  email: usersTable.email,
} as const;

// ── Zod schemas ────────────────────────────────────────────────────────────────
const CreateSubmissionBody = z.object({
  templateId: z.number().int().positive(),
  data: z.record(z.unknown()),
  status: z.enum(["draft", "submitted"]).optional().default("draft"),
  projectId: z.number().int().positive().optional(),
});

const UpdateSubmissionBody = z.object({
  data: z.record(z.unknown()).optional(),
  status: z.enum(["draft", "submitted"]).optional(),
});

const ReviewSubmissionBody = z.object({
  status: z.enum(["reviewed", "approved"]),
  notes: z.string().max(1000).optional(),
});

const AddCommentBody = z.object({
  comment: z.string().min(1).max(2000),
});

const AddPhotoBody = z.object({
  url: z.string().url(),
  filename: z.string().min(1).max(255),
  objectPath: z.string().optional(),
});

// ── Templates ─────────────────────────────────────────────────────────────────

// GET /safety/templates
router.get("/safety/templates", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewSafetyTab"), asyncHandler(async (req, res) => {
  const templates = await db
    .select()
    .from(formTemplatesTable)
    .where(eq(formTemplatesTable.isActive, true))
    .orderBy(formTemplatesTable.name);
  res.json(templates);
}))

// ── Submissions ───────────────────────────────────────────────────────────────

// GET /safety/submissions
// Column order in WHERE matches idx_form_submissions_company_status (companyId, status):
//   1. companyId  — always applied (leading column, most selective)
//   2. userId     — optional worker/filter (not in composite index, but applied after)
//   3. status     — optional filter (second column of composite index)
// When both companyId and status are present the planner uses the full composite index.
router.get("/safety/submissions", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewSafetyTab"), asyncHandler(async (req, res) => {
  try {
    const { status, workerId } = req.query as Record<string, string>;

    if (workerId && isNaN(parseInt(workerId, 10))) {
      res.status(400).json({ error: "Invalid workerId" }); return;
    }

    const { limit, offset } = parsePagination(req.query, 50, 200);

    const conditions: any[] = [eq(formSubmissionsTable.companyId, req.companyId!)];

    if (workerId) {
      conditions.push(eq(formSubmissionsTable.userId, parseInt(workerId, 10)));
    }

    if (status) {
      conditions.push(eq(formSubmissionsTable.status, status));
    }

    const rows = await db
      .select({
        submission: formSubmissionsTable,
        templateName: formTemplatesTable.name,
        templateCategory: formTemplatesTable.category,
        workerFirstName: usersTable.firstName,
        workerLastName: usersTable.lastName,
        workerEmail: usersTable.email,
      })
      .from(formSubmissionsTable)
      .leftJoin(formTemplatesTable, eq(formSubmissionsTable.templateId, formTemplatesTable.id))
      .leftJoin(usersTable, eq(formSubmissionsTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(formSubmissionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const submissionIds = rows.map((r) => r.submission.id);
    const allPhotos = submissionIds.length
      ? await db
          .select()
          .from(submissionPhotosTable)
          .where(inArray(submissionPhotosTable.submissionId, submissionIds))
      : [];

    const photosBySubmissionId: Record<number, typeof allPhotos> = {};
    for (const photo of allPhotos) {
      if (!photosBySubmissionId[photo.submissionId]) {
        photosBySubmissionId[photo.submissionId] = [];
      }
      photosBySubmissionId[photo.submissionId].push(photo);
    }

    res.json(
      rows.map((r) => ({
        ...r.submission,
        templateName: r.templateName,
        templateCategory: r.templateCategory,
        workerName: `${r.workerFirstName ?? ""} ${r.workerLastName ?? ""}`.trim(),
        workerEmail: r.workerEmail,
        photos: photosBySubmissionId[r.submission.id] ?? [],
      }))
    );
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions list error");
    res.status(500).json({ error: "Failed to load submissions" });
  }
}))

// GET /safety/submissions/:id
router.get("/safety/submissions/:id", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewSafetyTab"), asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const [row] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Submission not found" }); return; }

    const [[template], [worker], photos, rawComments] = await Promise.all([
      db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, row.templateId)),
      db.select(PUBLIC_USER_COLUMNS).from(usersTable).where(eq(usersTable.id, row.userId)),
      db.select().from(submissionPhotosTable).where(eq(submissionPhotosTable.submissionId, id)),
      db.select().from(submissionCommentsTable)
        .where(eq(submissionCommentsTable.submissionId, id))
        .orderBy(submissionCommentsTable.createdAt),
    ]);

    const commentUserIds = [...new Set(rawComments.map((c) => c.userId))];
    const [commentUsers, reviewer] = await Promise.all([
      commentUserIds.length
        ? db.select(PUBLIC_USER_COLUMNS).from(usersTable).where(inArray(usersTable.id, commentUserIds))
        : Promise.resolve([]),
      row.reviewedByUserId
        ? db.select(PUBLIC_USER_COLUMNS).from(usersTable).where(eq(usersTable.id, row.reviewedByUserId)).then(([rev]) => rev ?? null)
        : Promise.resolve(null),
    ]);
    const userMap = Object.fromEntries(commentUsers.map((u) => [u.id, u]));
    const comments = rawComments.map((c) => ({ ...c, user: userMap[c.userId] ?? null }));

    res.json({ ...row, template, worker, photos, comments, reviewer });
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id error");
    res.status(500).json({ error: "Failed to load submission" });
  }
}))

// POST /safety/submissions — create draft or submit
router.post("/safety/submissions", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  try {
    const parsed = CreateSubmissionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { templateId, data, status, projectId } = parsed.data;

    const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const [submission] = await db.insert(formSubmissionsTable).values({
      templateId,
      userId: req.userId!,
      companyId: req.companyId!,
      projectId: projectId ?? null,
      data,
      status,
    }).returning();

    if (status === "submitted") {
      generateAISummaryIfWithinQuota(submission.id, req.companyId!, template, data).catch((err) =>
        logger.error({ err }, "Safety AI summary error")
      );
      notifyForemen(req.companyId!, submission.id, template.name, req.userId!).catch((err) =>
        logger.error({ err }, "Safety foreman notification error")
      );
      // Fire-and-forget compliance check for submitted safety forms
      if (submission.projectId) {
        processComplianceEvent({
          companyId: req.companyId!,
          projectId: submission.projectId,
          sourceType: "FIELD_LOG",
          sourceRecordId: String(submission.id),
          text: `${template.name} (${template.category}): ${JSON.stringify(data).slice(0, 600)}`,
        }).catch((err) => logger.error({ err }, "compliance trigger error (safety)"));
        processFormSubmission(
          { id: submission.id, projectId: submission.projectId, userId: req.userId!, data, templateId },
          req.companyId!,
        ).catch((err) => logger.error({ err }, "COR evidence aggregation error (form submission)"));
      }
    }

    res.json(submission);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions POST error");
    res.status(500).json({ error: "Failed to create submission" });
  }
}))

// PUT /safety/submissions/:id — update draft
router.put("/safety/submissions/:id", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const bodyParsed = UpdateSubmissionBody.safeParse(req.body);
    if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.flatten() }); return; }
    const { data, status } = bodyParsed.data;

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }
    if (existing.status === "submitted" && req.userRole === "worker") {
      res.status(400).json({ error: "Cannot edit a submitted form" }); return;
    }

    const [updated] = await db
      .update(formSubmissionsTable)
      .set({
        ...(data ? { data } : {}),
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .returning();

    if (status === "submitted" && existing.status === "draft") {
      const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, existing.templateId));
      const formData = data ?? (existing.data as Record<string, any>);
      generateAISummaryIfWithinQuota(id, req.companyId!, template, formData).catch((err) =>
        logger.error({ err }, "Safety AI summary error")
      );
      notifyForemen(req.companyId!, id, template?.name ?? "Safety Form", existing.userId).catch((err) =>
        logger.error({ err }, "Safety foreman notification error")
      );
    }

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id PUT error");
    res.status(500).json({ error: "Failed to update submission" });
  }
}))

// POST /safety/submissions/:id/review
router.post("/safety/submissions/:id/review", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const reviewParsed = ReviewSubmissionBody.safeParse(req.body);
    if (!reviewParsed.success) { res.status(400).json({ error: reviewParsed.error.flatten() }); return; }
    const { status, notes } = reviewParsed.data;

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }

    const [updated] = await db
      .update(formSubmissionsTable)
      .set({
        status,
        reviewedByUserId: req.userId!,
        reviewedAt: new Date(),
        reviewNotes: notes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id/review error");
    res.status(500).json({ error: "Failed to review submission" });
  }
}))

// POST /safety/submissions/:id/comments
router.post("/safety/submissions/:id/comments", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const commentParsed = AddCommentBody.safeParse(req.body);
    if (!commentParsed.success) { res.status(400).json({ error: commentParsed.error.flatten() }); return; }
    const { comment } = commentParsed.data;

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }

    const [inserted] = await db.insert(submissionCommentsTable).values({
      submissionId: id,
      userId: req.userId!,
      comment: comment.trim(),
    }).returning();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    res.json({ ...inserted, user: user ?? null });
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id/comments error");
    res.status(500).json({ error: "Failed to add comment" });
  }
}))

// POST /safety/submissions/:id/photos
router.post("/safety/submissions/:id/photos", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const photoParsed = AddPhotoBody.safeParse(req.body);
    if (!photoParsed.success) { res.status(400).json({ error: photoParsed.error.flatten() }); return; }
    const { url, filename, objectPath } = photoParsed.data;

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }

    if (objectPath) {
      try {
        await objectStorageService.trySetCompanyReadAcl(
          objectPath,
          String(req.userId!),
          String(req.companyId!),
        );
      } catch (err) {
        req.log.warn({ err }, "Rejected photo with invalid or already-owned object path");
        res.status(400).json({ error: "Invalid photo reference" });
        return;
      }
    }

    const [photo] = await db.insert(submissionPhotosTable).values({
      submissionId: id,
      url,
      filename,
      objectPath: objectPath ?? null,
    }).returning();

    res.json(photo);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id/photos error");
    res.status(500).json({ error: "Failed to add photo" });
  }
}))

// ── POST /safety/submissions/:id/incident-summary — on-demand AI incident report ──

router.post("/safety/submissions/:id/incident-summary", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, requireAiQuota, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const [row] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Submission not found" }); return; }

    const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, row.templateId));
    const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
    const data = row.data as Record<string, any>;
    const fields = ((template?.schema as { fields?: Array<{ id: string; label: string }> })?.fields ?? []);

    const formData = [
      `Form Type: ${template?.name ?? "Safety Form"}`,
      `Category: ${template?.category ?? "Not specified"}`,
      `Submitted By: ${worker ? `${worker.firstName} ${worker.lastName}` : "Not specified"}`,
      `Submission Date: ${new Date(row.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      `Status: ${row.status}`,
      ``,
      `Form Fields:`,
      ...Object.entries(data).map(([key, val]) => {
        const field = fields.find((f) => f.id === key);
        const label = field?.label ?? key;
        const value = Array.isArray(val) ? val.join(", ") : String(val ?? "");
        return `${label}: ${value || "Not specified"}`;
      }),
    ].join("\n");

    const category = template?.category ?? "safety";
    const systemPrompt = buildAIPrompt(category);

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DATA:\n${formData}` },
      ],
    });

    const summary = completion.choices[0]?.message?.content ?? "Unable to generate summary.";

    await db
      .update(formSubmissionsTable)
      .set({ aiSummary: summary, updatedAt: new Date() })
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)));

    logger.info({ submissionId: id, category }, "AI safety summary generated");
    res.json({ summary, category });
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id/incident-summary error");
    res.status(500).json({ error: "Failed to generate incident summary" });
  }
}))

// ── AI prompt builder ─────────────────────────────────────────────────────────

function buildAIPrompt(category: string): string {
  if (category === "injury") {
    return `You are generating a professional workplace injury summary for internal reporting.

IMPORTANT:
- Do NOT assign blame
- Do NOT provide legal conclusions
- Keep tone factual and neutral

OUTPUT FORMAT:

1. Injury Summary:
- What happened and how the injury occurred

2. Injured Worker Details:
- Name:
- Role:
- Task being performed:

3. Injury Details:
- Type of injury:
- Body part affected:
- Severity: Minor / Moderate / Severe

4. Incident Description:
- Step-by-step description of events

5. Immediate Response:
- First aid given:
- Medical attention required:

6. Work Impact:
- Time off likely:
- Modified duties required:

7. Recommended Next Steps:
- Reporting requirements
- Follow-up actions

8. Compliance Note:
- Reminder: This summary does not replace official WSIB reporting requirements`;
  }

  if (category === "hazard") {
    return `You are a construction safety expert analyzing a hazard report.

Review the hazard data and generate a structured risk assessment.

INSTRUCTIONS:
- Focus on risk prevention
- Be concise and practical
- Do NOT exaggerate risk
- Do NOT assume missing details

OUTPUT FORMAT:

1. Hazard Summary:
- What hazard was identified

2. Risk Evaluation:
- Risk Level: Low / Medium / High
- Likelihood:
- Potential impact:

3. Affected Area / Workers:
- Who or what is at risk

4. Recommended Controls:
- Immediate controls (short-term)
- Long-term corrective actions

5. Priority Level:
- Low / Medium / Urgent

6. Compliance Notes:
- Any safety standard concerns (if applicable)`;
  }

  return `You are a construction safety officer generating a professional incident summary.

Analyze the following incident report data and produce a structured summary.

INSTRUCTIONS:
- Be factual and neutral (do NOT assign blame)
- Keep language clear and professional
- Do NOT invent details
- If information is missing, say "Not specified"

OUTPUT FORMAT:

1. Incident Overview:
- Brief summary of what happened (2–3 sentences)

2. Key Details:
- Date & Time:
- Location:
- Persons Involved:
- Type of Incident:

3. Severity Assessment:
- Classify as: Low / Medium / High
- Explain why

4. Root Cause (if identifiable):
- Immediate cause
- Contributing factors

5. Recommended Actions:
- Immediate actions required
- Preventative measures

6. Follow-Up Required:
- Yes / No
- If yes, explain`;
}

// ── AI Summary helper ─────────────────────────────────────────────────────────

// Fire-and-forget call sites can't go through the requireAiQuota middleware (it
// would block the submission response on the AI call), so quota is checked here instead.
async function generateAISummaryIfWithinQuota(submissionId: number, companyId: number, template: any, data: Record<string, any>) {
  const key = `c:${companyId}`;
  const quota = await checkAiQuota(key);
  if (!quota.allowed) {
    logger.warn({ companyId, submissionId }, "Safety AI summary skipped: AI quota exceeded");
    return;
  }
  await recordAiCall(key);
  await generateAISummary(submissionId, companyId, template, data);
}

async function generateAISummary(submissionId: number, companyId: number, template: any, data: Record<string, any>) {
  const fields = (template?.schema?.fields ?? []) as Array<{ id: string; label: string }>;
  const fieldSummary = Object.entries(data)
    .map(([key, val]) => {
      const field = fields.find((f) => f.id === key);
      const label = field?.label ?? key;
      const value = Array.isArray(val) ? val.join(", ") : String(val ?? "");
      return `${label}: ${value}`;
    })
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a safety officer AI for a Canadian construction company. Analyze this ${template.name} form submission and produce a concise structured summary covering: 1) What happened or was assessed, 2) Severity or risk level, 3) Recommended actions. Be factual, professional, and concise (max 150 words).`,
      },
      {
        role: "user",
        content: `Form: ${template.name}\n\n${fieldSummary}`,
      },
    ],
    max_tokens: 300,
  });

  const summary = completion.choices[0]?.message?.content ?? null;
  await db
    .update(formSubmissionsTable)
    .set({ aiSummary: summary })
    .where(and(eq(formSubmissionsTable.id, submissionId), eq(formSubmissionsTable.companyId, companyId)));

  logger.info({ submissionId }, "AI safety summary generated");
}

// ── Foreman notification helper ───────────────────────────────────────────────

async function notifyForemen(companyId: number, submissionId: number, templateName: string, workerId: number) {
  const foremen = await db
    .select()
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, companyId),
        inArray(userMembershipsTable.role, ["owner", "foreman"]),
      ),
    );

  if (!foremen.length) return;

  const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, workerId));
  const workerName = worker ? `${worker.firstName} ${worker.lastName}` : "A worker";

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const link = `https://${domain}/safety/submissions/${submissionId}`;

  try {
    await sendEmail({
      to: foremen.map((f) => f.users.email),
      subject: `[Site Snap Safety] New Submission: ${templateName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 24px; border-radius: 8px;">
          <div style="background: #172034; padding: 16px 24px; border-radius: 6px 6px 0 0; margin: -24px -24px 24px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">⚠️ Safety Form Submitted</h1>
          </div>
          <p style="color: #333;"><strong>${workerName}</strong> has submitted a <strong>${templateName}</strong> that requires your review.</p>
          <a href="${link}" style="display: inline-block; background: #FF6600; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">Review Submission →</a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Site Snap — Construction Safety Management</p>
        </div>
      `,
    });
    logger.info({ submissionId, foremenCount: foremen.length }, "Safety foreman notification sent");
  } catch (err: any) {
    if (err instanceof ResendSandboxError) {
      logger.warn({ submissionId }, "Safety email skipped: Resend sandbox mode");
    } else {
      throw err;
    }
  }
}

export default router;
