import { Router } from "express";
import { db, usersTable, userMembershipsTable, companiesTable, invitationsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
import { requireAuth, requireClerkSession, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { resolvePermission } from "../lib/permissionGate";
import { SyncUserBody } from "@workspace/api-zod";
import { getCompanyFeatureKeys } from "../lib/featureGate";
import { logSystemEvent } from "../lib/systemLog";

async function autoAcceptPendingInvitation(userId: number, email: string) {
  if (!email) return null;
  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        // Exact case-insensitive match — NOT ilike, which would treat "%"
        // and "_" (both legal in email local parts) as pattern wildcards.
        sql`lower(${invitationsTable.email}) = ${email.toLowerCase()}`,
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
// Uses requireClerkSession (not requireAuth) because the DB user may not exist yet —
// that is exactly what this endpoint creates.
router.post("/users/sync", requireClerkSession, asyncHandler(async (req, res) => {
  const parsed = SyncUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const { clerkUserId, firstName, lastName } = parsed.data;

  // Ensure the authenticated Clerk session matches the clerkUserId being synced
  const auth = getAuth(req);
  if (auth?.userId !== clerkUserId) {
    res.status(403).json({ error: "Cannot sync a different user's account" });
    return;
  }

  // P0: the email must come from Clerk's verified profile, never the request
  // body. autoAcceptPendingInvitation below grants company membership (up to
  // "owner") based on this email matching a pending invitation — trusting a
  // client-supplied email here would let anyone claim any invited address and
  // join a company under someone else's identity, bypassing the same check
  // /invitations/:token/accept already enforces.
  let email: string;
  let emailVerified = false;
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    // Prefer the primary email address; fall back to the first one.
    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ??
      clerkUser.emailAddresses[0];
    const clerkEmail = primaryEmail?.emailAddress?.toLowerCase().trim();
    if (!clerkEmail) {
      res.status(401).json({ error: "Unable to verify email address from Clerk session." });
      return;
    }
    email = clerkEmail;
    emailVerified = primaryEmail?.verification?.status === "verified";
  } catch {
    res.status(401).json({ error: "Unable to sync user. Please try signing out and back in." });
    return;
  }

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
    let updated;
    try {
      [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.clerkUserId, clerkUserId))
        .returning();
    } catch (err) {
      // If the Clerk user changed their email to one that belongs to another
      // DB user, the unconditional email update hits users_email_unique.
      // Return a clear 409 instead of an opaque 500 the client retries forever.
      const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined;
      if (cause?.code === "23505") {
        res.status(409).json({
          error:
            "This email address is already in use by another account. Contact support if you need these accounts merged.",
          code: "EMAIL_IN_USE",
        });
        return;
      }
      throw err;
    }
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
    // No user with this Clerk ID. Check whether a user record already exists
    // with the same email — this happens when someone deletes and re-creates
    // their Clerk account, or signs in with a different method (e.g. Google
    // SSO vs email/password) that produces a new Clerk user ID. In that case
    // re-link the existing record to the new Clerk ID instead of inserting a
    // duplicate row (which violates users_email_unique and loops on 500).
    const [byEmail] = await db
      .select()
      .from(usersTable)
      // Exact case-insensitive match — NOT ilike, which would treat "%" and
      // "_" (both legal in email local parts) as pattern wildcards and could
      // match (and re-link) a different user's account.
      .where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`)
      .limit(1);

    if (byEmail) {
      // P0: only re-link when Clerk confirms the email is verified. The email
      // itself comes from Clerk's server-side profile (never the request
      // body), but an unverified address could still be claimed by an
      // attacker signing up with someone else's email — verification is what
      // proves ownership before we hand over the existing account.
      if (!emailVerified) {
        res.status(403).json({
          error:
            "An account with this email already exists. Please verify your email address, then try again.",
        });
        return;
      }
      const updates: Record<string, string> = { clerkUserId, email };
      if (firstName && firstName.trim()) updates.firstName = firstName.trim();
      if (lastName && lastName.trim()) updates.lastName = lastName.trim();
      const [relinked] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, byEmail.id))
        .returning();
      logSystemEvent({
        logType: "ACCOUNT_RELINK",
        platform: "Backend",
        userId: relinked.id,
        tenantId: null,
        message: `Re-linked existing user ${relinked.email} to new Clerk account`,
      }).catch(() => {});
      req.log.info(
        { userId: relinked.id, oldClerkUserId: byEmail.clerkUserId, newClerkUserId: clerkUserId },
        "users/sync: re-linked existing user to new Clerk account",
      );
      // Same post-sync behavior as the update path: auto-accept a pending
      // invitation if the user has no memberships yet.
      const hasMemberships = await db
        .select({ userId: userMembershipsTable.userId })
        .from(userMembershipsTable)
        .where(eq(userMembershipsTable.userId, relinked.id))
        .limit(1);
      if (hasMemberships.length === 0) {
        await autoAcceptPendingInvitation(relinked.id, relinked.email);
        const [refreshed] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, relinked.id))
          .limit(1);
        res.json(refreshed ?? relinked);
        return;
      }
      res.json(relinked);
      return;
    }

    let created;
    try {
      [created] = await db
        .insert(usersTable)
        .values({ clerkUserId, email, firstName: firstName?.trim() || email.split("@")[0], lastName: lastName?.trim() || "" })
        .returning();
    } catch (err) {
      // Race guard: the client can fire several /users/sync requests
      // concurrently (multiple tabs, retries). If a parallel request created
      // the row between our lookup and this insert, recover by returning the
      // existing record instead of a 500.
      const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined;
      if (cause?.code === "23505") {
        const [row] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, clerkUserId))
          .limit(1);
        if (row) {
          res.json(row);
          return;
        }
      }
      throw err;
    }
    logSystemEvent({
      logType: "FIRST_LOGIN",
      platform: "Backend",
      userId: created.id,
      tenantId: null,
      message: `First-time login: ${created.email}`,
    }).catch(() => {});
    // Auto-accept any pending invitation matching this email
    await autoAcceptPendingInvitation(created.id, created.email);
    const [refreshed] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, created.id))
      .limit(1);
    res.json(refreshed ?? created);
  }
}))

// GET /users/me — get current user with memberships, active company, and resolved permissions
router.get("/users/me", requireAuth, asyncHandler(async (req, res) => {
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
    "viewEstimator","viewTradeHub","viewAskAI","useAiSkills",
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
}))

// POST /users/me/active-company — switch the user's active company
router.post("/users/me/active-company", requireAuth, asyncHandler(async (req, res) => {
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
}))

// POST /users/accept-terms — record that the current user accepted the T&C
router.post("/users/accept-terms", requireAuth, asyncHandler(async (req, res) => {
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
}))

// GET /users/me/features — list feature keys the company's active plan includes
router.get("/users/me/features", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const features = await getCompanyFeatureKeys(req.companyId!);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({ features });
}))

// POST /users/push-token — store Expo push token for the current user
router.post("/users/push-token", requireAuth, asyncHandler(async (req, res) => {
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
}))

export default router;
