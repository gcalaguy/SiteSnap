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

type Company = typeof companiesTable.$inferSelect;
type User = typeof usersTable.$inferSelect;
type Membership = typeof userMembershipsTable.$inferSelect;
type Plan = typeof plansTable.$inferSelect;
type Feature = typeof featuresTable.$inferSelect;

// ── Company CRUD ───────────────────────────────────────────────────────────────

export async function insertCompany(data: typeof companiesTable.$inferInsert): Promise<Company> {
  const [company] = await db.insert(companiesTable).values(data).returning();
  return company;
}

export async function insertOwnerMembership(userId: number, companyId: number): Promise<void> {
  await db
    .insert(userMembershipsTable)
    .values({ userId, companyId, role: "owner", isActive: true })
    .onConflictDoNothing();
}

export async function setUserActiveCompany(userId: number, companyId: number): Promise<void> {
  await db.update(usersTable).set({ activeCompanyId: companyId }).where(eq(usersTable.id, userId));
}

export async function getCompanyById(companyId: number): Promise<Company | undefined> {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  return company;
}

export async function getCompanySettings(companyId: number) {
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
  return row;
}

export async function updateCompanyProfile(companyId: number, update: Record<string, unknown>): Promise<Company | undefined> {
  const [updated] = await db
    .update(companiesTable)
    .set(update as any)
    .where(eq(companiesTable.id, companyId))
    .returning();
  return updated;
}

export async function updateCompanyLogo(companyId: number, logoPath: string | null): Promise<Company | undefined> {
  const [updated] = await db
    .update(companiesTable)
    .set({ logoPath })
    .where(eq(companiesTable.id, companyId))
    .returning();
  return updated;
}

export async function updateCompanyQuoteTemplate(companyId: number, templatePath: string | null): Promise<Company | undefined> {
  const [updated] = await db
    .update(companiesTable)
    .set({ quoteTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();
  return updated;
}

export async function updateCompanyInvoiceTemplate(companyId: number, templatePath: string | null): Promise<Company | undefined> {
  const [updated] = await db
    .update(companiesTable)
    .set({ invoiceTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();
  return updated;
}

export async function updateCompanyDocumentSettings(companyId: number, update: Record<string, unknown>): Promise<Company | undefined> {
  const [updated] = await db
    .update(companiesTable)
    .set(update)
    .where(eq(companiesTable.id, companyId))
    .returning();
  return updated;
}

export async function getCompanyIdByClaimToken(token: string): Promise<number | null> {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.claimToken, token))
    .limit(1);
  return company?.id ?? null;
}

export async function hasAnyMembership(companyId: number): Promise<boolean> {
  const rows = await db.select().from(userMembershipsTable).where(eq(userMembershipsTable.companyId, companyId));
  return rows.length > 0;
}

export async function getPlanBySlug(slug: string): Promise<Plan | undefined> {
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.slug, slug)).limit(1);
  return plan;
}

// Provisions a claimed company in one transaction: sets the company name,
// creates the subscription, assigns the caller as owner, and burns the
// one-time claim token — all-or-nothing so a mid-stream failure never
// leaves the company half-provisioned.
export async function claimCompanyTransaction(opts: {
  companyId: number;
  userId: number;
  companyName: string | null;
  planId: number | null;
}): Promise<{ updatedUser: User; updatedCompany: Company }> {
  const { companyId, userId, companyName, planId } = opts;
  return db.transaction(async (tx) => {
    if (companyName) {
      await tx.update(companiesTable).set({ name: companyName }).where(eq(companiesTable.id, companyId));
    }

    if (planId) {
      await tx
        .insert(subscriptionsTable)
        .values({ companyId, planId, status: "active", billingCycle: "monthly" })
        .onConflictDoNothing();
    }

    await tx
      .insert(userMembershipsTable)
      .values({ userId, companyId, role: "owner", isActive: true })
      .onConflictDoNothing();

    const [user] = await tx
      .update(usersTable)
      .set({ activeCompanyId: companyId })
      .where(eq(usersTable.id, userId))
      .returning();

    const [company] = await tx
      .update(companiesTable)
      .set({ claimToken: null, claimOwnerEmail: null })
      .where(eq(companiesTable.id, companyId))
      .returning();

    return { updatedUser: user, updatedCompany: company };
  });
}

// ── Members ────────────────────────────────────────────────────────────────────

export async function listCompanyMembers(companyId: number) {
  return db
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
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user;
}

export async function getMembership(companyId: number, userId: number): Promise<Membership | undefined> {
  const [membership] = await db
    .select()
    .from(userMembershipsTable)
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)))
    .limit(1);
  return membership;
}

export async function updateMemberRole(companyId: number, userId: number, role: string): Promise<void> {
  await db
    .update(userMembershipsTable)
    .set({ role: role as any })
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)));
}

export async function updateMemberName(userId: number, firstName: string, lastName: string): Promise<User | undefined> {
  const [updated] = await db
    .update(usersTable)
    .set({ firstName: firstName.trim(), lastName: lastName.trim() })
    .where(eq(usersTable.id, userId))
    .returning();
  return updated;
}

export async function getMemberPermissions(companyId: number, userId: number) {
  const [membership] = await db
    .select({ permissions: userMembershipsTable.permissions, role: userMembershipsTable.role })
    .from(userMembershipsTable)
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)))
    .limit(1);
  return membership;
}

export async function updateMemberPermissions(
  companyId: number,
  userId: number,
  permissions: Record<string, unknown>,
): Promise<Membership | undefined> {
  const [updated] = await db
    .update(userMembershipsTable)
    .set({ permissions: permissions as any })
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)))
    .returning();
  return updated;
}

// Entire removal cascade runs in one transaction so a failure partway through
// (e.g. a later delete violating a constraint) never leaves the member partially removed.
export async function removeMemberCascade(companyId: number, uid: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Fetch all project IDs owned by this company to scope child tables without companyId
    const companyProjectIds = (await tx
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId)))
      .map((r) => r.id);

    // Nullable FKs → NULL (scoped to company to prevent cross-tenant mutation)
    if (companyProjectIds.length > 0) {
      await tx.update(rfisTable).set({ assignedToUserId: null }).where(
        and(eq(rfisTable.assignedToUserId, uid), inArray(rfisTable.projectId, companyProjectIds)),
      );
      await tx.update(tasksTable).set({ assignedToUserId: null }).where(
        and(eq(tasksTable.assignedToUserId, uid), inArray(tasksTable.projectId, companyProjectIds)),
      );
    }
    await tx.update(quotesTable).set({ assignedToUserId: null }).where(
      and(eq(quotesTable.assignedToUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await tx.update(quotesTable).set({ approvedByUserId: null }).where(
      and(eq(quotesTable.approvedByUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await tx.update(invoicesTable).set({ assignedToUserId: null }).where(
      and(eq(invoicesTable.assignedToUserId, uid), eq(invoicesTable.companyId, companyId)),
    );
    await tx.update(timesheetsTable).set({ reviewedByUserId: null }).where(
      and(eq(timesheetsTable.reviewedByUserId, uid), eq(timesheetsTable.companyId, companyId)),
    );
    await tx.update(formSubmissionsTable).set({ reviewedByUserId: null }).where(
      and(eq(formSubmissionsTable.reviewedByUserId, uid), eq(formSubmissionsTable.companyId, companyId)),
    );
    await tx.update(changeOrdersTable).set({ approvedByUserId: null }).where(
      and(eq(changeOrdersTable.approvedByUserId, uid), eq(changeOrdersTable.companyId, companyId)),
    );
    // NULL quote_id on invoices referencing quotes owned by this user (scoped to company)
    const userQuoteIds = (await tx
      .select({ id: quotesTable.id })
      .from(quotesTable)
      .where(and(eq(quotesTable.createdByUserId, uid), eq(quotesTable.companyId, companyId)))
    ).map((q) => q.id);
    if (userQuoteIds.length > 0) {
      await tx
        .update(invoicesTable)
        .set({ quoteId: null })
        .where(and(inArray(invoicesTable.quoteId, userQuoteIds), eq(invoicesTable.companyId, companyId)));
    }

    // Deep children first — scoped to this company via projectId or companyId
    const userDailyReportIds = companyProjectIds.length > 0
      ? (await tx
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
      await tx.delete(dailyReportPhotosTable).where(inArray(dailyReportPhotosTable.reportId, userDailyReportIds));
    }
    const userSubmissionIds = (await tx
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
      await tx.delete(submissionCommentsTable).where(inArray(submissionCommentsTable.submissionId, userSubmissionIds));
      await tx.delete(submissionCommentsTable).where(
        and(
          eq(submissionCommentsTable.userId, uid),
          inArray(submissionCommentsTable.submissionId, userSubmissionIds),
        ),
      );
    }
    const userInvoiceIds = (await tx
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
      await tx.delete(paymentsTable).where(
        and(
          inArray(paymentsTable.invoiceId, userInvoiceIds),
          eq(paymentsTable.companyId, companyId),
        ),
      );
    }

    await tx.delete(tradehubMessagesTable).where(eq(tradehubMessagesTable.senderId, uid));
    await tx.delete(tradehubNotificationsTable).where(eq(tradehubNotificationsTable.userId, uid));
    await tx.delete(tradehubReportsTable).where(eq(tradehubReportsTable.reporterId, uid));
    await tx.delete(tradehubReactionsTable).where(eq(tradehubReactionsTable.userId, uid));
    await tx.delete(tradehubCommentsTable).where(eq(tradehubCommentsTable.userId, uid));
    await tx.delete(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.applicantId, uid));
    await tx.delete(tradehubPostsTable).where(
      and(eq(tradehubPostsTable.userId, uid), eq(tradehubPostsTable.companyId, companyId)),
    );
    await tx.delete(notificationsTable).where(eq(notificationsTable.userId, uid));
    await tx.delete(projectNotesTable).where(
      and(eq(projectNotesTable.authorId, uid), eq(projectNotesTable.companyId, companyId)),
    );
    await tx.delete(fileAttachmentsTable).where(
      and(eq(fileAttachmentsTable.uploadedByUserId, uid), eq(fileAttachmentsTable.companyId, companyId)),
    );
    await tx.delete(inspectionsTable).where(
      and(eq(inspectionsTable.inspectorId, uid), eq(inspectionsTable.companyId, companyId)),
    );
    await tx.delete(scheduleEventsTable).where(
      and(eq(scheduleEventsTable.createdByUserId, uid), eq(scheduleEventsTable.companyId, companyId)),
    );
    await tx.delete(workerSchedulesTable).where(
      and(eq(workerSchedulesTable.userId, uid), eq(workerSchedulesTable.companyId, companyId)),
    );
    await tx.delete(timeEntriesTable).where(
      and(eq(timeEntriesTable.userId, uid), eq(timeEntriesTable.companyId, companyId)),
    );
    const userLeadIds = (await tx
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(eq(leadsTable.companyId, companyId)))
      .map((r) => r.id);
    if (userLeadIds.length > 0) {
      await tx.delete(leadActivitiesTable).where(
        and(
          eq(leadActivitiesTable.userId, uid),
          inArray(leadActivitiesTable.leadId, userLeadIds),
        ),
      );
    }
    await tx.delete(formSubmissionsTable).where(
      and(eq(formSubmissionsTable.userId, uid), eq(formSubmissionsTable.companyId, companyId)),
    );
    if (companyProjectIds.length > 0) {
      await tx.delete(projectDocumentsTable).where(
        and(
          eq(projectDocumentsTable.uploadedByUserId, uid),
          inArray(projectDocumentsTable.projectId, companyProjectIds),
        ),
      );
      await tx.delete(dailyReportsTable).where(
        and(
          eq(dailyReportsTable.submittedByUserId, uid),
          inArray(dailyReportsTable.projectId, companyProjectIds),
        ),
      );
      await tx.delete(rfisTable).where(
        and(
          eq(rfisTable.submittedByUserId, uid),
          inArray(rfisTable.projectId, companyProjectIds),
        ),
      );
    }
    await tx.delete(estimatesTable).where(
      and(eq(estimatesTable.createdByUserId, uid), eq(estimatesTable.companyId, companyId)),
    );
    await tx.delete(changeOrdersTable).where(
      and(eq(changeOrdersTable.requestedByUserId, uid), eq(changeOrdersTable.companyId, companyId)),
    );
    await tx.delete(invoicesTable).where(
      and(eq(invoicesTable.createdByUserId, uid), eq(invoicesTable.companyId, companyId)),
    );
    await tx.delete(quotesTable).where(
      and(eq(quotesTable.createdByUserId, uid), eq(quotesTable.companyId, companyId)),
    );
    await tx.delete(conversations).where(
      and(eq(conversations.userId, uid), eq(conversations.companyId, companyId)),
    );
    await tx.delete(projectMembersTable).where(
      and(
        eq(projectMembersTable.userId, uid),
        eq(projectMembersTable.companyId, companyId),
      ),
    );

    // Invitation cleanup + user deletion — same transaction as the rest of the cascade
    // so the user is never left as a phantom member if any earlier step fails.
    const targetUser = await tx.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid));
    if (targetUser[0]?.email) {
      await tx.delete(invitationsTable).where(eq(invitationsTable.email, targetUser[0].email));
    }
    // Delete user — cascades userMembershipsTable, tradehubProfiles, etc.
    await tx.delete(usersTable).where(eq(usersTable.id, uid));
  });
}

// ── Features ────────────────────────────────────────────────────────────────────

export async function listEnabledFeatures(): Promise<Feature[]> {
  return db.select().from(featuresTable).where(eq(featuresTable.isEnabled, true));
}

export async function getFeatureByKey(key: string): Promise<Feature | undefined> {
  const [feature] = await db.select().from(featuresTable).where(eq(featuresTable.key, key)).limit(1);
  return feature;
}

export async function updateCompanyActiveFeatures(companyId: number, activeFeatures: string[]): Promise<void> {
  await db.update(companiesTable).set({ activeFeatures }).where(eq(companiesTable.id, companyId));
}
