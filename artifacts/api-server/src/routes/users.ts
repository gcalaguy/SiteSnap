import { Router } from "express";
import { db, usersTable, userMembershipsTable, companiesTable, invitationsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth, requireCompany } from "../lib/auth";
import { resolvePermission } from "../lib/permissionGate";
import { SyncUserBody } from "@workspace/api-zod";
import { getCompanyFeatureKeys } from "../lib/featureGate";

async function autoAcceptPendingInvitation(userId: number, email: string) {
  if (!email) return null;
  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.email, email),
        eq(invitationsTable.status, "pending"),
        gt(invitationsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) return null;
  // Phase 4: write only to memberships; legacy columns removed
  await db
    .insert(userMembershipsTable)
    .values({ userId, companyId: invite.companyId, role: invite.role, isActive: true })
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ activeCompanyId: invite.companyId, preferredLanguage: invite.preferredLanguage ?? "en" })
    .where(eq(usersTable.id, userId));
  await db
    .update(invitationsTable)
    .set({ status: "accepted" })
    .where(eq(invitationsTable.id, invite.id));
  return invite;
}

const router = Router();

// POST /users/sync — create or update DB user from Clerk session
router.post("/users/sync", async (req, res) => {
  const parsed = SyncUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const { clerkUserId, email, firstName, lastName } = parsed.data;

  // Upsert user
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (existing.length > 0) {
    // Only update names if the incoming values are non-empty — never overwrite real names with blanks
    const updates: Record<string, string> = { email };
    if (firstName && firstName.trim()) updates.firstName = firstName.trim();
    if (lastName && lastName.trim()) updates.lastName = lastName.trim();
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .returning();
    // Auto-accept any pending invitation for this email if user has no memberships yet
    const hasMemberships = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(eq(userMembershipsTable.userId, updated.id))
      .limit(1);
    if (updated && hasMemberships.length === 0) {
      await autoAcceptPendingInvitation(updated.id, updated.email);
      const [refreshed] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, updated.id))
        .limit(1);
      res.json(refreshed ?? updated);
      return;
    }
    res.json(updated);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, firstName: firstName?.trim() || email.split("@")[0], lastName: lastName?.trim() || "" })
      .returning();
    // Auto-accept any pending invitation matching this email
    await autoAcceptPendingInvitation(created.id, created.email);
    const [refreshed] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, created.id))
      .limit(1);
    res.json(refreshed ?? created);
  }
});

// GET /users/me — get current user with memberships, active company, and resolved permissions
router.get("/users/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const memberships = await db
    .select({
      userId: userMembershipsTable.userId,
      companyId: userMembershipsTable.companyId,
      role: userMembershipsTable.role,
      isActive: userMembershipsTable.isActive,
      permissions: userMembershipsTable.permissions,
      createdAt: userMembershipsTable.createdAt,
      companyName: companiesTable.name,
    })
    .from(userMembershipsTable)
    .leftJoin(companiesTable, eq(companiesTable.id, userMembershipsTable.companyId))
    .where(eq(userMembershipsTable.userId, user.id));

  let activeCompanyId = user.activeCompanyId;
  // Auto-populate activeCompanyId from first membership if it's missing
  if (!activeCompanyId && memberships.length > 0) {
    activeCompanyId = memberships[0].companyId;
    await db
      .update(usersTable)
      .set({ activeCompanyId })
      .where(eq(usersTable.id, user.id));
  }

  let company = null;
  if (activeCompanyId) {
    const [c] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, activeCompanyId))
      .limit(1);
    company = c ?? null;
  }

  // Compute effective role from the active (or first available) membership
  const activeMembership = activeCompanyId
    ? memberships.find((m) => m.companyId === activeCompanyId)
    : memberships[0] ?? null;
  const role = activeMembership?.role ?? "worker";

  // Resolve permissions for the response so the client never has to apply defaults
  const permKeys = [
    "viewQuotes","viewTimesheets","viewFinancials","viewDocuments","viewSchedules",
    "viewClientMessages","viewRiskTab","viewSafetyTab","viewInspectTab",
    "manageQuotes","submitExpenses","viewAllProjects",
    "viewDailyLog","viewReports","viewRFIs","viewPhotos","viewVault",
    "viewEstimator","viewSiteScan","viewTradeHub","viewAskAI",
  ] as const;
  const resolvedPerms = role === "owner"
    ? undefined
    : Object.fromEntries(
        permKeys.map((k) => [
          k,
          resolvePermission(k, role, activeMembership?.permissions ?? null),
        ]),
      );

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({
    ...user,
    company,
    memberships,
    activeCompanyId,
    role,
    permissions: resolvedPerms,
  });
});

// POST /users/me/active-company — switch the user's active company
router.post("/users/me/active-company", requireAuth, async (req, res) => {
  const { companyId } = req.body as { companyId?: number };
  if (typeof companyId !== "number") {
    res.status(400).json({ error: "companyId (number) is required" });
    return;
  }

  // Verify the user actually belongs to this company
  const [membership] = await db
    .select()
    .from(userMembershipsTable)
    .where(
      and(
        eq(userMembershipsTable.userId, req.userId!),
        eq(userMembershipsTable.companyId, companyId),
      ),
    )
    .limit(1);

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this company" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ activeCompanyId: companyId })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  res.json({ ...updated, company, activeCompanyId: companyId });
});

// POST /users/accept-terms — record that the current user accepted the T&C
router.post("/users/accept-terms", requireAuth, async (req, res) => {
  const [updated] = await db
    .update(usersTable)
    .set({ termsAcceptedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  const activeCompanyId = updated?.activeCompanyId;
  let company = null;
  if (activeCompanyId) {
    const [c] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, activeCompanyId))
      .limit(1);
    company = c ?? null;
  }

  res.json({ ...updated, company, activeCompanyId });
});

// GET /users/me/features — list feature keys the company's active plan includes
router.get("/users/me/features", requireAuth, requireCompany, async (req, res) => {
  const features = await getCompanyFeatureKeys(req.companyId!);
  res.json({ features });
});

// POST /users/push-token — store Expo push token for the current user
router.post("/users/push-token", requireAuth, async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  await db
    .update(usersTable)
    .set({ pushToken: token })
    .where(eq(usersTable.id, req.userId!));

  res.json({ ok: true });
});

export default router;
