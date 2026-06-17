import { Router } from "express";
import {
  db, usersTable, userMembershipsTable, companiesTable, invitationsTable,
  subscriptionsTable, plansTable, featuresTable,
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
import { asyncHandler } from "../lib/asyncHandler";
import {
  CreateCompanyBody,
  UpdateMemberRoleBody,
  UpdateCompanyDocumentSettingsBody,
  UpdateCompanyLogoBody,
  UpdateCompanyQuoteTemplateBody,
  UpdateCompanyInvoiceTemplateBody,
} from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";
import { logAuditEventFromRequest } from "../utils/logger";

const UpdateCompanyProfileBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  website: z.string().url().or(z.literal("")).optional(),
  hstNumber: z.string().max(50).optional(),
  estimatorConfig: z.record(z.unknown()).optional(),
});

const router = Router();

// POST /companies — create company and set requester as owner
// Uses requireAuth but deliberately omits requireCompany: a brand-new user has
// no company yet and must be able to call this endpoint during onboarding.
router.post("/companies", requireAuth, asyncHandler(async (req, res) => {
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
}));

// GET /companies/:companyId
router.get("/companies/:companyId", requireAuth, requireCompany, asyncHandler(async (req, res) => {
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
}));

// GET /companies/:companyId/settings
router.get("/companies/:companyId/settings", requireAuth, requireCompany, asyncHandler(async (req, res) => {
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
}));

// PATCH /companies/:companyId — update company profile details
router.patch("/companies/:companyId", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.phone !== undefined) update.phone = body.phone.trim();
  if (body.address !== undefined) update.address = body.address.trim();
  if (body.city !== undefined) update.city = body.city.trim();
  if (body.province !== undefined) update.province = body.province.trim();
  if (body.website !== undefined) update.website = body.website.trim();
  if (body.hstNumber !== undefined) update.hstNumber = body.hstNumber.trim();
  if (body.estimatorConfig !== undefined) update.estimatorConfig = body.estimatorConfig;

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
}));

// PATCH /companies/:companyId/logo — update company logo path
router.patch("/companies/:companyId/logo", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyLogoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string clears the logo (removes it); any non-empty path sets it
  const logoPath = parsed.data.logoPath || null;

  const [updated] = await db
    .update(companiesTable)
    .set({ logoPath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
}));

// PATCH /companies/:companyId/quote-template — set or clear quote template path
router.patch("/companies/:companyId/quote-template", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyQuoteTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string is treated the same as null — clears the template
  const templatePath = parsed.data.templatePath || null;

  const [updated] = await db
    .update(companiesTable)
    .set({ quoteTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
}));

// PATCH /companies/:companyId/invoice-template — set or clear invoice template path
router.patch("/companies/:companyId/invoice-template", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyInvoiceTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string is treated the same as null — clears the template
  const templatePath = parsed.data.templatePath || null;

  const [updated] = await db
    .update(companiesTable)
    .set({ invoiceTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
}));

// PATCH /companies/:companyId/document-settings — update numbering + boilerplate
router.patch("/companies/:companyId/document-settings", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyDocumentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const update: Record<string, unknown> = {};

  if (typeof body.quoteNumberPrefix === "string") {
    update.quoteNumberPrefix = body.quoteNumberPrefix.trim() || "QUO";
  }
  if (typeof body.invoiceNumberPrefix === "string") {
    update.invoiceNumberPrefix = body.invoiceNumberPrefix.trim() || "INV";
  }
  if (typeof body.quoteStartNumber === "number") {
    update.quoteStartNumber = Math.max(1, Math.floor(body.quoteStartNumber));
  }
  if (typeof body.invoiceStartNumber === "number") {
    update.invoiceStartNumber = Math.max(1, Math.floor(body.invoiceStartNumber));
  }
  if (body.defaultQuoteTerms !== undefined) {
    update.defaultQuoteTerms = typeof body.defaultQuoteTerms === "string"
      ? body.defaultQuoteTerms.trim() || null
      : null;
  }
  if (body.defaultInvoiceNotes !== undefined) {
    update.defaultInvoiceNotes = typeof body.defaultInvoiceNotes === "string"
      ? body.defaultInvoiceNotes.trim() || null
      : null;
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
}));

// GET /companies/:companyId/members
router.get(
  "/companies/:companyId/members",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
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
  }),
);

// DELETE /companies/:companyId/members/:userId
router.delete(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
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

    // Wrap the final removal steps in a transaction: invitation cleanup + user deletion
    // must be atomic so the user is never left as a phantom member if either step fails.
    await db.transaction(async (tx) => {
      const targetUser = await tx.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid));
      if (targetUser[0]?.email) {
        await tx.delete(invitationsTable).where(eq(invitationsTable.email, targetUser[0].email));
      }
      // Delete user — cascades userMembershipsTable, tradehubProfiles, etc.
      await tx.delete(usersTable).where(eq(usersTable.id, uid));
    });

    logAuditEventFromRequest(req, "Member Removed", `User ${targetUserId} removed from company ${companyId}`).catch(() => {});
    res.status(204).send();
  }),
);

// PATCH /companies/:companyId/members/:userId — update role
router.patch(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
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
    logAuditEventFromRequest(req, "Member Role Changed", `User ${targetUserId} role changed to ${parsed.data.role}`).catch(() => {});
    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId))
      .limit(1);

    res.json({ ...updated, company: null });
  }),
);

// PATCH /companies/:companyId/members/:userId/name — update member name
router.patch(
  "/companies/:companyId/members/:userId/name",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
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
  }),
);

// GET /companies/:companyId/members/:userId/permissions — get member's custom permissions
router.get(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
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
  }),
);

// PUT /companies/:companyId/members/:userId/permissions — update member's custom permissions
router.put(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
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
  }),
);

// GET /companies/:companyId/features
// Returns the effective feature keys for a tenant (custom package or plan-based)
router.get(
  "/companies/:companyId/features",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { getCompanyFeatureKeys } = await import("../lib/featureGate");
    const features = await getCompanyFeatureKeys(companyId);
    res.json({ features });
  }),
);

// GET /companies/claim-invite/:token — resolve a signup invite token to a company ID
// PUBLIC — no requireAuth. The new owner arrives via /sign-up?token=X before having a
// DB user record. This lets the frontend fetch the companyId without exposing it in the
// invite link itself.
router.get("/companies/claim-invite/:token", asyncHandler(async (req, res) => {
  const token = (req.params.token as string).trim();
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.claimToken, token))
    .limit(1);

  if (!company) {
    res.status(404).json({ error: "Invalid or expired signup invite" });
    return;
  }

  res.json({ companyId: company.id });
}));

// POST /companies/:companyId/claim — claim a pre-created company as owner
// Requires the one-time claimToken set by the super-admin at tenant creation.
// All mutations are wrapped in a single transaction to prevent partial provisioning
// if a network failure occurs mid-stream.
router.post("/companies/:companyId/claim", requireAuth, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (isNaN(companyId)) {
    res.status(400).json({ error: "Invalid companyId" });
    return;
  }

  // Require the caller to supply the claim token
  const suppliedToken = typeof req.body.claimToken === "string" ? req.body.claimToken.trim() : null;
  if (!suppliedToken) {
    res.status(400).json({ error: "claimToken is required" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!company) {
    // Return 403 (not 404) to avoid leaking which IDs exist
    res.status(403).json({ error: "Invalid company ID or claim token" });
    return;
  }

  // Verify the token. Companies without a claimToken cannot be claimed here.
  if (!company.claimToken || company.claimToken !== suppliedToken) {
    res.status(403).json({ error: "Invalid company ID or claim token" });
    return;
  }

  // Verify the caller's own email matches the address the claim token was issued
  // to (P0 security fix — mirrors the invite-accept check in routes/invitations.ts).
  // Without this, anyone who obtains the claim link (forwarded email, leaked URL,
  // browser history) could claim the company as owner regardless of identity.
  if (company.claimOwnerEmail) {
    const [caller] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (!caller || caller.email.toLowerCase().trim() !== company.claimOwnerEmail.toLowerCase().trim()) {
      res.status(403).json({ error: "Invalid company ID or claim token" });
      return;
    }
  }

  // Verify no user is already owner via memberships
  const existingMembers = await db
    .select()
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));
  if (existingMembers.length > 0) {
    res.status(409).json({ error: "Company already claimed" });
    return;
  }

  // Extract onboarding fields from request body
  const companyName = typeof req.body.companyName === "string"
    ? req.body.companyName.trim()
    : null;
  const planTier = typeof req.body.planTier === "string"
    ? req.body.planTier.trim().toLowerCase()
    : "starter";

  // Resolve plan outside the transaction (read-only; no risk of partial state)
  const [matchedPlan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.slug, planTier))
    .limit(1);
  const fallbackPlan = matchedPlan
    ? matchedPlan
    : (await db.select().from(plansTable).where(eq(plansTable.slug, "starter")).limit(1))[0];

  // All mutations in one transaction — prevents orphaned records on network failure
  let updatedUser: typeof usersTable.$inferSelect;
  let updatedCompany: typeof companiesTable.$inferSelect;
  try {
    ({ updatedUser, updatedCompany } = await db.transaction(async (tx) => {
      // Update company name if provided
      if (companyName) {
        await tx
          .update(companiesTable)
          .set({ name: companyName })
          .where(eq(companiesTable.id, companyId));
      }

      // Provision subscription
      if (fallbackPlan) {
        await tx
          .insert(subscriptionsTable)
          .values({
            companyId,
            planId: fallbackPlan.id,
            status: "active",
            billingCycle: "monthly",
          })
          .onConflictDoNothing();
      }

      // Assign authenticated user as owner
      await tx
        .insert(userMembershipsTable)
        .values({ userId: req.userId!, companyId, role: "owner", isActive: true })
        .onConflictDoNothing();

      const [user] = await tx
        .update(usersTable)
        .set({ activeCompanyId: companyId })
        .where(eq(usersTable.id, req.userId!))
        .returning();

      // Burn the one-time claim token (and its bound email) so it cannot be reused
      const [cmp] = await tx
        .update(companiesTable)
        .set({ claimToken: null, claimOwnerEmail: null })
        .where(eq(companiesTable.id, companyId))
        .returning();

      return { updatedUser: user, updatedCompany: cmp };
    }));
  } catch (err) {
    req.log?.error({ err, companyId }, "Failed to claim company");
    res.status(500).json({ error: "Failed to claim company. Please try again." });
    return;
  }

  res.json({ company: updatedCompany, user: updatedUser });
}));

// ── Self-service feature management (company owner) ─────────────────────────

// GET /companies/:companyId/features/available
// Returns all globally-enabled features with a flag showing whether each is
// currently active for this company (plan-based or via activeFeatures override).
router.get(
  "/companies/:companyId/features/available",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { getCompanyFeatureKeys } = await import("../lib/featureGate");
    const [allFeatures, activeKeys] = await Promise.all([
      db.select().from(featuresTable).where(eq(featuresTable.isEnabled, true)),
      getCompanyFeatureKeys(companyId),
    ]);

    const result = allFeatures.map((f) => ({
      ...f,
      active: activeKeys.some((k) => k.toUpperCase() === f.key.toUpperCase()),
    }));

    res.json({ features: result });
  }),
);

// PATCH /companies/:companyId/features/toggle
// Lets an owner enable or disable a specific feature for their company.
// Builds (or updates) the company's custom activeFeatures override array.
router.patch(
  "/companies/:companyId/features/toggle",
  requireAuth,
  requireCompany,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { featureKey, enabled } = req.body as { featureKey: string; enabled: boolean };
    if (typeof featureKey !== "string" || !featureKey.trim()) {
      res.status(400).json({ error: "featureKey is required" });
      return;
    }
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }

    const normalizedKey = featureKey.toUpperCase();

    // Verify the feature actually exists and is enabled in the system
    const [feature] = await db
      .select()
      .from(featuresTable)
      .where(eq(featuresTable.key, normalizedKey))
      .limit(1);
    if (!feature || !feature.isEnabled) {
      res.status(404).json({ error: "Feature not found" });
      return;
    }

    const { getCompanyFeatureKeys, invalidateFeatureCache } = await import("../lib/featureGate");
    const { notifyFeatureCacheInvalidate } = await import("../lib/pgListener");

    // Snapshot the current effective feature set then apply the toggle
    const currentKeys = await getCompanyFeatureKeys(companyId);
    let nextKeys: string[];
    if (enabled) {
      nextKeys = currentKeys.includes(normalizedKey)
        ? currentKeys
        : [...currentKeys, normalizedKey];
    } else {
      nextKeys = currentKeys.filter((k) => k.toUpperCase() !== normalizedKey);
    }

    await db
      .update(companiesTable)
      .set({ activeFeatures: nextKeys })
      .where(eq(companiesTable.id, companyId));

    invalidateFeatureCache(companyId);
    // Broadcast to all API instances via Postgres NOTIFY so every pod invalidates
    // its local in-memory cache immediately rather than waiting for the 5 s TTL.
    await notifyFeatureCacheInvalidate(companyId);

    res.json({ ok: true, featureKey: normalizedKey, enabled, activeFeatures: nextKeys });
  }),
);

export default router;
