import { Router } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  formTemplatesTable,
  formSubmissionsTable,
  submissionPhotosTable,
  submissionCommentsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail, ResendSandboxError } from "../lib/mailer";
import { logger } from "../lib/logger";

const router = Router();

// ── Templates ─────────────────────────────────────────────────────────────────

// GET /safety/templates
router.get("/safety/templates", requireAuth, requireCompany, async (req, res) => {
  const templates = await db
    .select()
    .from(formTemplatesTable)
    .where(eq(formTemplatesTable.isActive, true))
    .orderBy(formTemplatesTable.name);
  res.json(templates);
});

// ── Submissions ───────────────────────────────────────────────────────────────

// GET /safety/submissions
router.get("/safety/submissions", requireAuth, requireCompany, async (req, res) => {
  try {
    const { status, workerId } = req.query as Record<string, string>;

    const conditions: any[] = [eq(formSubmissionsTable.companyId, req.companyId!)];

    if (req.userRole === "worker") {
      conditions.push(eq(formSubmissionsTable.userId, req.userId!));
    } else if (workerId) {
      conditions.push(eq(formSubmissionsTable.userId, parseInt(workerId)));
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
      .orderBy(desc(formSubmissionsTable.createdAt));

    res.json(
      rows.map((r) => ({
        ...r.submission,
        templateName: r.templateName,
        templateCategory: r.templateCategory,
        workerName: `${r.workerFirstName ?? ""} ${r.workerLastName ?? ""}`.trim(),
        workerEmail: r.workerEmail,
      }))
    );
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions list error");
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// GET /safety/submissions/:id
router.get("/safety/submissions/:id", requireAuth, requireCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [row] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Submission not found" }); return; }
    if (req.userRole === "worker" && row.userId !== req.userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, row.templateId));
    const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
    const photos = await db.select().from(submissionPhotosTable).where(eq(submissionPhotosTable.submissionId, id));

    const rawComments = await db
      .select()
      .from(submissionCommentsTable)
      .where(eq(submissionCommentsTable.submissionId, id))
      .orderBy(submissionCommentsTable.createdAt);

    const commentUserIds = [...new Set(rawComments.map((c) => c.userId))];
    const commentUsers = commentUserIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, commentUserIds))
      : [];
    const userMap = Object.fromEntries(commentUsers.map((u) => [u.id, u]));
    const comments = rawComments.map((c) => ({ ...c, user: userMap[c.userId] ?? null }));

    let reviewer = null;
    if (row.reviewedByUserId) {
      const [rev] = await db.select().from(usersTable).where(eq(usersTable.id, row.reviewedByUserId));
      reviewer = rev ?? null;
    }

    res.json({ ...row, template, worker, photos, comments, reviewer });
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id error");
    res.status(500).json({ error: "Failed to load submission" });
  }
});

// POST /safety/submissions — create draft or submit
router.post("/safety/submissions", requireAuth, requireCompany, async (req, res) => {
  try {
    const { templateId, data, status = "draft", projectId } = req.body as {
      templateId: number;
      data: Record<string, any>;
      status?: string;
      projectId?: number;
    };

    if (!templateId || !data) {
      res.status(400).json({ error: "templateId and data required" }); return;
    }

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
      generateAISummary(submission.id, template, data).catch((err) =>
        logger.error({ err }, "Safety AI summary error")
      );
      notifyForemen(req.companyId!, submission.id, template.name, req.userId!).catch((err) =>
        logger.error({ err }, "Safety foreman notification error")
      );
    }

    res.json(submission);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions POST error");
    res.status(500).json({ error: "Failed to create submission" });
  }
});

// PUT /safety/submissions/:id — update draft
router.put("/safety/submissions/:id", requireAuth, requireCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { data, status } = req.body as { data?: Record<string, any>; status?: string };

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }
    if (req.userRole === "worker" && existing.userId !== req.userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }
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
      .where(eq(formSubmissionsTable.id, id))
      .returning();

    if (status === "submitted" && existing.status === "draft") {
      const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, existing.templateId));
      const formData = data ?? (existing.data as Record<string, any>);
      generateAISummary(id, template, formData).catch((err) =>
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
});

// POST /safety/submissions/:id/review
router.post("/safety/submissions/:id/review", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, notes } = req.body as { status: "reviewed" | "approved"; notes?: string };

    if (!status || !["reviewed", "approved"].includes(status)) {
      res.status(400).json({ error: "status must be 'reviewed' or 'approved'" }); return;
    }

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
      .where(eq(formSubmissionsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "safety/submissions/:id/review error");
    res.status(500).json({ error: "Failed to review submission" });
  }
});

// POST /safety/submissions/:id/comments
router.post("/safety/submissions/:id/comments", requireAuth, requireCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { comment } = req.body as { comment: string };

    if (!comment?.trim()) { res.status(400).json({ error: "comment required" }); return; }

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }
    if (req.userRole === "worker" && existing.userId !== req.userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }

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
});

// POST /safety/submissions/:id/photos
router.post("/safety/submissions/:id/photos", requireAuth, requireCompany, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { url, filename, objectPath } = req.body as { url: string; filename: string; objectPath?: string };

    if (!url || !filename) { res.status(400).json({ error: "url and filename required" }); return; }

    const [existing] = await db
      .select()
      .from(formSubmissionsTable)
      .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Submission not found" }); return; }
    if (req.userRole === "worker" && existing.userId !== req.userId) {
      res.status(403).json({ error: "Access denied" }); return;
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
});

// ── AI Summary helper ─────────────────────────────────────────────────────────

async function generateAISummary(submissionId: number, template: any, data: Record<string, any>) {
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
    .where(eq(formSubmissionsTable.id, submissionId));

  logger.info({ submissionId }, "AI safety summary generated");
}

// ── Foreman notification helper ───────────────────────────────────────────────

async function notifyForemen(companyId: number, submissionId: number, templateName: string, workerId: number) {
  const foremen = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.companyId, companyId),
        sql`${usersTable.role} IN ('owner', 'foreman')`
      )
    );

  if (!foremen.length) return;

  const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, workerId));
  const workerName = worker ? `${worker.firstName} ${worker.lastName}` : "A worker";

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const link = `https://${domain}/safety/submissions/${submissionId}`;

  try {
    await sendEmail({
      to: foremen.map((f) => f.email),
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
