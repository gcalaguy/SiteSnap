import { Router } from "express";
import {
  db, usersTable, companiesTable, invitationsTable,
  rfisTable, tasksTable, quotesTable, invoicesTable, timesheetsTable,
  formSubmissionsTable, changeOrdersTable, dailyReportsTable,
  dailyReportPhotosTable, submissionCommentsTable, paymentsTable,
  tradehubMessagesTable, tradehubNotificationsTable, tradehubReportsTable,
  tradehubReactionsTable, tradehubCommentsTable, tradehubJobApplicationsTable,
  tradehubPostsTable, notificationsTable, projectNotesTable,
  fileAttachmentsTable, inspectionsTable, scheduleEventsTable,
  workerSchedulesTable, timeEntriesTable, leadActivitiesTable,
  projectDocumentsTable, estimatesTable, projectMembersTable,
  conversations,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth";
import { CreateCompanyBody, UpdateMemberRoleBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

// POST /companies — create company and set requester as owner
router.post("/companies", requireAuth, async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  // Pull optional referredByCode from request body (not part of CreateCompanyBody schema)
  const referredByCode = typeof req.body.referredByCode === "string"
    ? req.body.referredByCode.trim() || null
    : null;

  // Generate a unique 8-char referral code for this company
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();

  const [company] = await db
    .insert(companiesTable)
    .values({ ...parsed.data, referralCode, referredByCode })
    .returning();

  // Assign requester as owner of this company
  await db
    .update(usersTable)
    .set({ companyId: company.id, role: "owner" })
    .where(eq(usersTable.id, req.userId!));

  res.status(201).json(company);
});

// GET /companies/:companyId
router.get("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(company);
});

// GET /companies/:companyId/settings
router.get("/companies/:companyId/settings", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [row] = await db
    .select({ estimatorConfig: companiesTable.estimatorConfig })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  res.json({
    estimatorConfig: (row?.estimatorConfig ?? {}) as Record<string, unknown>,
  });
});

// PATCH /companies/:companyId — update company profile details
router.patch("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const allowed = ["name", "phone", "address", "city", "province", "website", "hstNumber", "estimatorConfig"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key === "estimatorConfig" && req.body?.estimatorConfig != null) {
      update.estimatorConfig = req.body.estimatorConfig;
    } else if (typeof req.body?.[key] === "string") {
      update[key === "hstNumber" ? "hstNumber" : key] = req.body[key].trim();
    }
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set(update as any)
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/logo — update company logo path
router.patch("/companies/:companyId/logo", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const logoPath = typeof req.body?.logoPath === "string" ? req.body.logoPath : null;
  if (!logoPath) {
    res.status(400).json({ error: "logoPath is required" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set({ logoPath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/quote-template — set or clear quote template path
router.patch("/companies/:companyId/quote-template", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templatePath = typeof req.body?.templatePath === "string" ? req.body.templatePath || null : null;

  const [updated] = await db
    .update(companiesTable)
    .set({ quoteTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/invoice-template — set or clear invoice template path
router.patch("/companies/:companyId/invoice-template", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templatePath = typeof req.body?.templatePath === "string" ? req.body.templatePath || null : null;

  const [updated] = await db
    .update(companiesTable)
    .set({ invoiceTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// GET /companies/:companyId/members
router.get(
  "/companies/:companyId/members",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const members = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId));

    const result = members.map((m) => ({ ...m, company: null }));
    res.json(result);
  },
);

// DELETE /companies/:companyId/members/:userId
router.delete(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    const uid = targetUserId;

    // Nullable FKs → NULL
    await db.update(rfisTable).set({ assignedToUserId: null }).where(eq(rfisTable.assignedToUserId, uid));
    await db.update(tasksTable).set({ assignedToUserId: null }).where(eq(tasksTable.assignedToUserId, uid));
    await db.update(quotesTable).set({ assignedToUserId: null }).where(eq(quotesTable.assignedToUserId, uid));
    await db.update(quotesTable).set({ approvedByUserId: null }).where(eq(quotesTable.approvedByUserId, uid));
    await db.update(invoicesTable).set({ assignedToUserId: null }).where(eq(invoicesTable.assignedToUserId, uid));
    await db.update(timesheetsTable).set({ reviewedByUserId: null }).where(eq(timesheetsTable.reviewedByUserId, uid));
    await db.update(formSubmissionsTable).set({ reviewedByUserId: null }).where(eq(formSubmissionsTable.reviewedByUserId, uid));
    await db.update(changeOrdersTable).set({ approvedByUserId: null }).where(eq(changeOrdersTable.approvedByUserId, uid));
    // NULL quote_id on invoices referencing quotes owned by this user
    const userQuoteIds = (await db.select({ id: quotesTable.id }).from(quotesTable).where(eq(quotesTable.createdByUserId, uid))).map(q => q.id);
    if (userQuoteIds.length > 0) {
      await db.update(invoicesTable).set({ quoteId: null }).where(inArray(invoicesTable.quoteId, userQuoteIds));
    }

    // Deep children first
    const userDailyReportIds = (await db.select({ id: dailyReportsTable.id }).from(dailyReportsTable).where(eq(dailyReportsTable.submittedByUserId, uid))).map(r => r.id);
    if (userDailyReportIds.length > 0) {
      await db.delete(dailyReportPhotosTable).where(inArray(dailyReportPhotosTable.reportId, userDailyReportIds));
    }
    const userSubmissionIds = (await db.select({ id: formSubmissionsTable.id }).from(formSubmissionsTable).where(eq(formSubmissionsTable.userId, uid))).map(s => s.id);
    if (userSubmissionIds.length > 0) {
      await db.delete(submissionCommentsTable).where(inArray(submissionCommentsTable.submissionId, userSubmissionIds));
    }
    await db.delete(submissionCommentsTable).where(eq(submissionCommentsTable.userId, uid));
    const userInvoiceIds = (await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.createdByUserId, uid))).map(i => i.id);
    if (userInvoiceIds.length > 0) {
      await db.delete(paymentsTable).where(inArray(paymentsTable.invoiceId, userInvoiceIds));
    }

    await db.delete(tradehubMessagesTable).where(eq(tradehubMessagesTable.senderId, uid));
    await db.delete(tradehubNotificationsTable).where(eq(tradehubNotificationsTable.userId, uid));
    await db.delete(tradehubReportsTable).where(eq(tradehubReportsTable.reporterId, uid));
    await db.delete(tradehubReactionsTable).where(eq(tradehubReactionsTable.userId, uid));
    await db.delete(tradehubCommentsTable).where(eq(tradehubCommentsTable.userId, uid));
    await db.delete(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.applicantId, uid));
    await db.delete(tradehubPostsTable).where(eq(tradehubPostsTable.userId, uid));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, uid));
    await db.delete(projectNotesTable).where(eq(projectNotesTable.authorId, uid));
    await db.delete(fileAttachmentsTable).where(eq(fileAttachmentsTable.uploadedByUserId, uid));
    await db.delete(inspectionsTable).where(eq(inspectionsTable.inspectorId, uid));
    await db.delete(scheduleEventsTable).where(eq(scheduleEventsTable.createdByUserId, uid));
    await db.delete(workerSchedulesTable).where(eq(workerSchedulesTable.userId, uid));
    await db.delete(timeEntriesTable).where(eq(timeEntriesTable.userId, uid));
    await db.delete(leadActivitiesTable).where(eq(leadActivitiesTable.userId, uid));
    await db.delete(formSubmissionsTable).where(eq(formSubmissionsTable.userId, uid));
    await db.delete(projectDocumentsTable).where(eq(projectDocumentsTable.uploadedByUserId, uid));
    await db.delete(dailyReportsTable).where(eq(dailyReportsTable.submittedByUserId, uid));
    await db.delete(rfisTable).where(eq(rfisTable.submittedByUserId, uid));
    await db.delete(estimatesTable).where(eq(estimatesTable.createdByUserId, uid));
    await db.delete(changeOrdersTable).where(eq(changeOrdersTable.requestedByUserId, uid));
    await db.delete(invoicesTable).where(eq(invoicesTable.createdByUserId, uid));
    await db.delete(quotesTable).where(eq(quotesTable.createdByUserId, uid));
    await db.delete(conversations).where(eq(conversations.userId, uid));
    await db.delete(projectMembersTable).where(eq(projectMembersTable.userId, uid));

    // Clear any invitations for this user so they can be re-invited cleanly
    const targetUser = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid));
    if (targetUser[0]?.email) {
      await db.delete(invitationsTable).where(eq(invitationsTable.email, targetUser[0].email));
    }

    // Finally delete the user (cascades timesheets, tradehub_profiles, etc.)
    await db.delete(usersTable).where(eq(usersTable.id, uid));

    res.status(204).send();
  },
);

// PATCH /companies/:companyId/members/:userId — update role
router.patch(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: parsed.data.role })
      .where(eq(usersTable.id, targetUserId))
      .returning();

    res.json({ ...updated, company: null });
  },
);

// PATCH /companies/:companyId/members/:userId/name — update member name
router.patch(
  "/companies/:companyId/members/:userId/name",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { firstName, lastName } = req.body;
    if (typeof firstName !== "string" || typeof lastName !== "string") {
      res.status(400).json({ error: "firstName and lastName are required" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ firstName: firstName.trim(), lastName: lastName.trim() })
      .where(and(eq(usersTable.id, targetUserId), eq(usersTable.companyId, companyId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json({ ...updated, company: null });
  },
);

// GET /companies/:companyId/features
// Returns the effective feature keys for a tenant (custom package or plan-based)
router.get(
  "/companies/:companyId/features",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { getCompanyFeatureKeys } = await import("../lib/featureGate");
    const features = await getCompanyFeatureKeys(companyId);
    res.json({ features });
  },
);

// POST /companies/:companyId/claim — claim a pre-created company as owner
router.post("/companies/:companyId/claim", requireAuth, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (isNaN(companyId)) {
    res.status(400).json({ error: "Invalid companyId" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  // Verify no user is already owner of this company
  const existingOwners = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId));

  if (existingOwners.length > 0) {
    res.status(409).json({ error: "Company already claimed" });
    return;
  }

  // Assign authenticated user as owner
  const [updatedUser] = await db
    .update(usersTable)
    .set({ companyId, role: "owner" })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({ company, user: updatedUser });
});

export default router;
