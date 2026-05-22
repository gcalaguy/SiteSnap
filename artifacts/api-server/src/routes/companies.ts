import { Router } from "express";
import {
  db, usersTable, userMembershipsTable, companiesTable, invitationsTable,
  rfisTable, tasksTable, quotesTable, invoicesTable, timesheetsTable,
  formSubmissionsTable, changeOrdersTable, dailyReportsTable,
  dailyReportPhotosTable, submissionCommentsTable, paymentsTable,
  tradehubMessagesTable, tradehubNotificationsTable, tradehubReportsTable,
  tradehubReactionsTable, tradehubCommentsTable, tradehubJobApplicationsTable,
  tradehubPostsTable, notificationsTable, projectNotesTable,
  fileAttachmentsTable, inspectionsTable, scheduleEventsTable,
  workerSchedulesTable, timeEntriesTable, leadActivitiesTable,
  projectDocumentsTable, estimatesTable, projectMembersTable,
  projectsTable, leadsTable, conversations,
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

  // Assign requester as owner: write to memberships only (Phase 4)
  await db
    .insert(userMembershipsTable)
    .values({ userId: req.userId!, companyId: company.id, role: "owner", isActive: true })
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ activeCompanyId: company.id })
    .where(eq(usersTable.id, req.userId!));

  res.status(201).json(company);
});

// GET /companies/:companyId
router.get("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
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
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [row] = await db
    .select({
      estimatorConfig: companiesTable.estimatorConfig,
      quoteNumberPrefix: companiesTable.quoteNumberPrefix,
      invoiceNumberPrefix: companiesTable.invoiceNumberPrefix,
      quoteStartNumber: companiesTable.quoteStartNumber,
      invoiceStartNumber: companiesTable.invoiceStartNumber,
      defaultQuoteTerms: companiesTable.defaultQuoteTerms,
      defaultInvoiceNotes: companiesTable.defaultInvoiceNotes,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  res.json({
    estimatorConfig: (row?.estimatorConfig ?? {}) as Record<string, unknown>,
    quoteNumberPrefix: row?.quoteNumberPrefix ?? "QUO",
    invoiceNumberPrefix: row?.invoiceNumberPrefix ?? "INV",
    quoteStartNumber: row?.quoteStartNumber ?? 1,
    invoiceStartNumber: row?.invoiceStartNumber ?? 1,
    defaultQuoteTerms: row?.defaultQuoteTerms ?? "",
    defaultInvoiceNotes: row?.defaultInvoiceNotes ?? "",
  });
});

// PATCH /companies/:companyId — update company profile details
router.patch("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const allowed = [
    "name", "phone", "address", "city", "province", "website", "hstNumber",
    "estimatorConfig",
  ] as const;
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
  const companyId = parseInt(req.params.companyId as string);
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
  const companyId = parseInt(req.params.companyId as string);
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
  const companyId = parseInt(req.params.companyId as string);
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

// PATCH /companies/:companyId/document-settings — update numbering + boilerplate
router.patch("/companies/:companyId/document-settings", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const update: Record<string, unknown> = {};

  if (typeof req.body?.quoteNumberPrefix === "string") {
    update.quoteNumberPrefix = req.body.quoteNumberPrefix.trim() || "QUO";
  }
  if (typeof req.body?.invoiceNumberPrefix === "string") {
    update.invoiceNumberPrefix = req.body.invoiceNumberPrefix.trim() || "INV";
  }
  if (typeof req.body?.quoteStartNumber === "number") {
    update.quoteStartNumber = Math.max(1, Math.floor(req.body.quoteStartNumber));
  }
  if (typeof req.body?.invoiceStartNumber === "number") {
    update.invoiceStartNumber = Math.max(1, Math.floor(req.body.invoiceStartNumber));
  }
  if (typeof req.body?.defaultQuoteTerms === "string") {
    update.defaultQuoteTerms = req.body.defaultQuoteTerms.trim() || null;
  }
  if (typeof req.body?.defaultInvoiceNotes === "string") {
    update.defaultInvoiceNotes = req.body.defaultInvoiceNotes.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set(update)
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
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const members = await db
      .select({
        id: usersTable.id,
        clerkUserId: usersTable.clerkUserId,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        createdAt: usersTable.createdAt,
        pushToken: usersTable.pushToken,
        termsAcceptedAt: usersTable.termsAcceptedAt,
        systemRole: usersTable.systemRole,
        activeCompanyId: usersTable.activeCompanyId,
        role: userMembershipsTable.role,
      })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, companyId),
        ),
      );

    const result = members.map((m) => ({ ...m, company: null }));
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
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
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    const uid = targetUserId;

    // Fetch all project IDs owned by this company to scope child tables without companyId
    const companyProjectIds = (await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId)))
      .map((r) => r.id);

    // Nullable FKs → NULL (scoped to company to prevent cross-tenant mutation)
    if (companyProjectIds.length > 0) {
      await db.update(rfisTable).set({ assignedToUserId: null }).where(
        and(eq(rfisTable.assignedToUserId, uid), inArray(rfisTable.projectId, companyProjectIds)),
      );
      await db.update(tasksTable).set({ assignedToUserId: null }).where(
        and(eq(tasksTable.assignedToUserId, uid), inArray(tasksTable.projectId, companyProjectIds)),
      );
    }
    await db.update(quotesTable).set({ assignedToUserId: null }).where(
      and(eq(quotesTable.assignedToUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await db.update(quotesTable).set({ approvedByUserId: null }).where(
      and(eq(quotesTable.approvedByUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await db.update(invoicesTable).set({ assignedToUserId: null }).where(
      and(eq(invoicesTable.assignedToUserId, uid), eq(invoicesTable.companyId, companyId)),
    );
    await db.update(timesheetsTable).set({ reviewedByUserId: null }).where(
      and(eq(timesheetsTable.reviewedByUserId, uid), eq(timesheetsTable.companyId, companyId)),
    );
    await db.update(formSubmissionsTable).set({ reviewedByUserId: null }).where(
      and(eq(formSubmissionsTable.reviewedByUserId, uid), eq(formSubmissionsTable.companyId, companyId)),
    );
    await db.update(changeOrdersTable).set({ approvedByUserId: null }).where(
      and(eq(changeOrdersTable.approvedByUserId, uid), eq(changeOrdersTable.companyId, companyId)),
    );
    // NULL quote_id on invoices referencing quotes owned by this user (scoped to company)
    const userQuoteIds = (await db
      .select({ id: quotesTable.id })
      .from(quotesTable)
      .where(and(eq(quotesTable.createdByUserId, uid), eq(quotesTable.companyId, companyId)))
    ).map((q) => q.id);
    if (userQuoteIds.length > 0) {
      await db
        .update(invoicesTable)
        .set({ quoteId: null })
        .where(and(inArray(invoicesTable.quoteId, userQuoteIds), eq(invoicesTable.companyId, companyId)));
    }

    // Deep children first — scoped to this company via projectId or companyId
    const userDailyReportIds = companyProjectIds.length > 0
      ? (await db
          .select({ id: dailyReportsTable.id })
          .from(dailyReportsTable)
          .where(
            and(
              eq(dailyReportsTable.submittedByUserId, uid),
              inArray(dailyReportsTable.projectId, companyProjectIds),
            ),
          ))
          .map((r) => r.id)
      : [];
    if (userDailyReportIds.length > 0) {
      await db.delete(dailyReportPhotosTable).where(inArray(dailyReportPhotosTable.reportId, userDailyReportIds));
    }
    const userSubmissionIds = (await db
      .select({ id: formSubmissionsTable.id })
      .from(formSubmissionsTable)
      .where(
        and(
          eq(formSubmissionsTable.userId, uid),
          eq(formSubmissionsTable.companyId, companyId),
        ),
      ))
      .map((s) => s.id);
    if (userSubmissionIds.length > 0) {
      await db.delete(submissionCommentsTable).where(inArray(submissionCommentsTable.submissionId, userSubmissionIds));
      await db.delete(submissionCommentsTable).where(
        and(
          eq(submissionCommentsTable.userId, uid),
          inArray(submissionCommentsTable.submissionId, userSubmissionIds),
        ),
      );
    }
    const userInvoiceIds = (await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.createdByUserId, uid),
          eq(invoicesTable.companyId, companyId),
        ),
      ))
      .map((i) => i.id);
    if (userInvoiceIds.length > 0) {
      await db.delete(paymentsTable).where(
        and(
          inArray(paymentsTable.invoiceId, userInvoiceIds),
          eq(paymentsTable.companyId, companyId),
        ),
      );
    }

    await db.delete(tradehubMessagesTable).where(eq(tradehubMessagesTable.senderId, uid));
    await db.delete(tradehubNotificationsTable).where(eq(tradehubNotificationsTable.userId, uid));
    await db.delete(tradehubReportsTable).where(eq(tradehubReportsTable.reporterId, uid));
    await db.delete(tradehubReactionsTable).where(eq(tradehubReactionsTable.userId, uid));
    await db.delete(tradehubCommentsTable).where(eq(tradehubCommentsTable.userId, uid));
    await db.delete(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.applicantId, uid));
    await db.delete(tradehubPostsTable).where(
      and(eq(tradehubPostsTable.userId, uid), eq(tradehubPostsTable.companyId, companyId)),
    );
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, uid));
    await db.delete(projectNotesTable).where(
      and(eq(projectNotesTable.authorId, uid), eq(projectNotesTable.companyId, companyId)),
    );
    await db.delete(fileAttachmentsTable).where(
      and(eq(fileAttachmentsTable.uploadedByUserId, uid), eq(fileAttachmentsTable.companyId, companyId)),
    );
    await db.delete(inspectionsTable).where(
      and(eq(inspectionsTable.inspectorId, uid), eq(inspectionsTable.companyId, companyId)),
    );
    await db.delete(scheduleEventsTable).where(
      and(eq(scheduleEventsTable.createdByUserId, uid), eq(scheduleEventsTable.companyId, companyId)),
    );
    await db.delete(workerSchedulesTable).where(
      and(eq(workerSchedulesTable.userId, uid), eq(workerSchedulesTable.companyId, companyId)),
    );
    await db.delete(timeEntriesTable).where(
      and(eq(timeEntriesTable.userId, uid), eq(timeEntriesTable.companyId, companyId)),
    );
    const userLeadIds = (await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(eq(leadsTable.companyId, companyId)))
      .map((r) => r.id);
    if (userLeadIds.length > 0) {
      await db.delete(leadActivitiesTable).where(
        and(
          eq(leadActivitiesTable.userId, uid),
          inArray(leadActivitiesTable.leadId, userLeadIds),
        ),
      );
    }
    await db.delete(formSubmissionsTable).where(
      and(eq(formSubmissionsTable.userId, uid), eq(formSubmissionsTable.companyId, companyId)),
    );
    if (companyProjectIds.length > 0) {
      await db.delete(projectDocumentsTable).where(
        and(
          eq(projectDocumentsTable.uploadedByUserId, uid),
          inArray(projectDocumentsTable.projectId, companyProjectIds),
        ),
      );
      await db.delete(dailyReportsTable).where(
        and(
          eq(dailyReportsTable.submittedByUserId, uid),
          inArray(dailyReportsTable.projectId, companyProjectIds),
        ),
      );
      await db.delete(rfisTable).where(
        and(
          eq(rfisTable.submittedByUserId, uid),
          inArray(rfisTable.projectId, companyProjectIds),
        ),
      );
    }
    await db.delete(estimatesTable).where(
      and(eq(estimatesTable.createdByUserId, uid), eq(estimatesTable.companyId, companyId)),
    );
    await db.delete(changeOrdersTable).where(
      and(eq(changeOrdersTable.requestedByUserId, uid), eq(changeOrdersTable.companyId, companyId)),
    );
    await db.delete(invoicesTable).where(
      and(eq(invoicesTable.createdByUserId, uid), eq(invoicesTable.companyId, companyId)),
    );
    await db.delete(quotesTable).where(
      and(eq(quotesTable.createdByUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await db.delete(conversations).where(
      and(eq(conversations.userId, uid), eq(conversations.companyId, companyId)),
    );
    await db.delete(projectMembersTable).where(
      and(
        eq(projectMembersTable.userId, uid),
        eq(projectMembersTable.companyId, companyId),
      ),
    );

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
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    // Dual-write role to memberships + legacy columns (Phase 0)
    await db
      .update(userMembershipsTable)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      );
    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1);

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
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Verify target user is a member of this company (tenant scoping)
    const membership = await db
      .select()
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (membership.length === 0) {
      res.status(404).json({ error: "Member not found in this company" });
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
      .where(eq(usersTable.id, targetUserId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json({ ...updated, company: null });
  },
);

// GET /companies/:companyId/members/:userId/permissions — get member's custom permissions
router.get(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Owners cannot edit their own permissions
    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot modify your own permissions" });
      return;
    }

    const [membership] = await db
      .select({ permissions: userMembershipsTable.permissions, role: userMembershipsTable.role })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!membership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json(membership.permissions ?? null);
  },
);

// PUT /companies/:companyId/members/:userId/permissions — update member's custom permissions
router.put(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Owners cannot edit their own permissions
    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot modify your own permissions" });
      return;
    }

    // Verify target user is a member of this company
    const [membership] = await db
      .select({ role: userMembershipsTable.role })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!membership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Accept any subset of MemberPermissions keys; merge into existing JSONB
    const { memberPermissionsSchema } = await import("@workspace/db");
    const parsed = memberPermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid permissions body", details: parsed.error });
      return;
    }

    const [updated] = await db
      .update(userMembershipsTable)
      .set({ permissions: parsed.data })
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .returning();

    res.json(updated?.permissions ?? {});
  },
);

// GET /companies/:companyId/features
// Returns the effective feature keys for a tenant (custom package or plan-based)
router.get(
  "/companies/:companyId/features",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
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
  const companyId = parseInt(req.params.companyId as string);
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

  // Verify no user is already owner via memberships (Phase 0: also check legacy column)
  const existingMembers = await db
    .select()
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));
  if (existingMembers.length > 0) {
    res.status(409).json({ error: "Company already claimed" });
    return;
  }

  // Assign authenticated user as owner: write to memberships only (Phase 4)
  await db
    .insert(userMembershipsTable)
    .values({ userId: req.userId!, companyId, role: "owner", isActive: true })
    .onConflictDoNothing();
  const [updatedUser] = await db
    .update(usersTable)
    .set({ activeCompanyId: companyId })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({ company, user: updatedUser });
});

export default router;
