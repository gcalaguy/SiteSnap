import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  formTemplatesTable,
  formSubmissionsTable,
  submissionPhotosTable,
  usersTable,
  contactsTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { z } from "zod";

const router = Router();

const CreateFormBody = z.object({
  name: z.string().min(1),
  category: z.enum(["safety", "injury", "hazard", "toolbox"]),
  schema: z.object({
    fields: z.array(z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      required: z.boolean().default(false),
      options: z.array(z.string()).optional(),
    })),
  }),
});

const CreateSubmissionBody = z.object({
  templateId: z.number().int().positive(),
  data: z.record(z.unknown()),
  status: z.enum(["submitted", "draft"]).optional(),
  projectId: z.number().int().positive().optional(),
  contactId: z.number().int().positive().optional(),
});

const UpdateSubmissionStatusBody = z.object({
  status: z.enum(["reviewed", "approved"]),
  notes: z.string().optional(),
});

// ── Form Templates (at /forms) ────────────────────────────────────────────────

// GET /forms — list all active templates
router.get("/forms", requireAuth, requireCompany, async (req, res) => {
  const templates = await db
    .select()
    .from(formTemplatesTable)
    .where(eq(formTemplatesTable.isActive, true))
    .orderBy(formTemplatesTable.category, formTemplatesTable.name);
  res.json(templates);
});

// GET /forms/:id — get a single template
router.get("/forms/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [template] = await db
    .select()
    .from(formTemplatesTable)
    .where(eq(formTemplatesTable.id, id));

  if (!template) { res.status(404).json({ error: "Not found" }); return; }
  res.json(template);
});

router.post("/forms", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const parsed = CreateFormBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }

  const [template] = await db
    .insert(formTemplatesTable)
    .values({
      name: parsed.data.name,
      category: parsed.data.category,
      schema: parsed.data.schema,
      isActive: true,
    })
    .returning();

  res.status(201).json(template);
});

// PUT /forms/:id — update form template
router.put("/forms/:id", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateFormBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [updated] = await db
    .update(formTemplatesTable)
    .set(parsed.data as any)
    .where(eq(formTemplatesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// DELETE /forms/:id — deactivate form template
router.delete("/forms/:id", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(formTemplatesTable)
    .set({ isActive: false })
    .where(eq(formTemplatesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ── Form Submissions (at /form-submissions) ────────────────────────────────────

// GET /form-submissions — list (with contact + project linking)
// Column order in WHERE matches idx_form_submissions_company_status (companyId, status):
//   1. companyId  — always applied (leading column, most selective for the tenant)
//   2. userId     — optional worker restriction (not in composite index, applied after)
//   3. status     — optional filter (second column of composite index)
// When both companyId and status are present the planner uses the full composite index.
router.get("/form-submissions", requireAuth, requireCompany, async (req, res) => {
  try {
    const { status, templateId, projectId, contactId } = req.query as Record<string, string>;

    const conditions: any[] = [eq(formSubmissionsTable.companyId, req.companyId!)];
    if (req.userRole === "worker") conditions.push(eq(formSubmissionsTable.userId, req.userId!));
    if (status) conditions.push(eq(formSubmissionsTable.status, status));
    if (templateId) conditions.push(eq(formSubmissionsTable.templateId, parseInt(templateId)));
    if (projectId) conditions.push(eq(formSubmissionsTable.projectId, parseInt(projectId)));
    if (contactId) conditions.push(eq(formSubmissionsTable.contactId, parseInt(contactId)));

    const rows = await db
      .select({
        submission: formSubmissionsTable,
        templateName: formTemplatesTable.name,
        templateCategory: formTemplatesTable.category,
        workerFirstName: usersTable.firstName,
        workerLastName: usersTable.lastName,
        workerEmail: usersTable.email,
        contactName: contactsTable.name,
      })
      .from(formSubmissionsTable)
      .leftJoin(formTemplatesTable, eq(formSubmissionsTable.templateId, formTemplatesTable.id))
      .leftJoin(usersTable, eq(formSubmissionsTable.userId, usersTable.id))
      .leftJoin(contactsTable, eq(formSubmissionsTable.contactId, contactsTable.id))
      .where(and(...conditions))
      .orderBy(desc(formSubmissionsTable.createdAt));

    res.json(rows.map((r) => ({
      ...r.submission,
      templateName: r.templateName,
      templateCategory: r.templateCategory,
      workerName: `${r.workerFirstName ?? ""} ${r.workerLastName ?? ""}`.trim(),
      workerEmail: r.workerEmail,
      contactName: r.contactName ?? null,
    })));
  } catch (err: any) {
    req.log.error({ err }, "/form-submissions list error");
    res.status(500).json({ error: "Failed to list submissions" });
  }
});

// POST /form-submissions — create submission with contact + project linking
router.post("/form-submissions", requireAuth, requireCompany, async (req, res) => {
  try {
    const parsed = CreateSubmissionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { templateId, data, status = "submitted", projectId, contactId } = parsed.data;

    const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const [submission] = await db.insert(formSubmissionsTable).values({
      templateId,
      userId: req.userId!,
      companyId: req.companyId!,
      projectId: projectId ?? null,
      contactId: contactId ?? null,
      data,
      status,
    } as any).returning();

    res.status(201).json(submission);
  } catch (err: any) {
    req.log.error({ err }, "/form-submissions POST error");
    res.status(500).json({ error: "Failed to create submission" });
  }
});

// GET /form-submissions/:id
router.get("/form-submissions/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(formSubmissionsTable)
    .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (req.userRole === "worker" && row.userId !== req.userId!) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [template] = await db.select().from(formTemplatesTable).where(eq(formTemplatesTable.id, row.templateId));
  const [worker] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
  const photos = await db.select().from(submissionPhotosTable).where(eq(submissionPhotosTable.submissionId, id));

  let contact = null;
  if (row.contactId) {
    const [c] = await db.select().from(contactsTable).where(eq(contactsTable.id, row.contactId));
    contact = c ?? null;
  }

  res.json({ ...row, template, worker, photos, contact });
});

// PATCH /form-submissions/:id/status — review/approve
router.patch("/form-submissions/:id/status", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateSubmissionStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
  const { status, notes } = parsed.data;

  const [updated] = await db
    .update(formSubmissionsTable)
    .set({ status, reviewedByUserId: req.userId!, reviewedAt: new Date(), reviewNotes: notes ?? null, updatedAt: new Date() } as any)
    .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
