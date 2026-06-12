import { Router } from "express";
import { db, usersTable, userMembershipsTable, companiesTable, invitationsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requireSeatAvailable } from "../lib/seatEnforcement";
import { CreateInvitationBody } from "@workspace/api-zod";
import crypto from "crypto";
import { sendEmail, ResendSandboxError } from "../lib/mailer";
import { logger } from "../lib/logger";

// ── Shared invite email helper ────────────────────────────────────────────────
function buildAppBase(req: import("express").Request): string | null {
  return (
    process.env["APP_BASE_URL"]?.replace(/\/$/, "") ??
    (process.env["REPLIT_DOMAINS"]
      ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0].trim()}`
      : null) ??
    (req.headers["origin"] as string | undefined) ??
    null
  );
}

function sendInviteEmail(opts: {
  to: string;
  token: string;
  role: string;
  companyName: string;
  appBase: string;
}): void {
  const inviteUrl = `${opts.appBase}/onboarding?token=${opts.token}`;
  sendEmail({
    to: [opts.to],
    subject: `You've been invited to join ${opts.companyName} on Site Snap`,
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="font-size:32px;">🏗️</span>
    <h1 style="margin:12px 0 4px;font-size:22px;color:#172034;">You're invited to Site Snap</h1>
    <p style="color:#64748b;margin:0;">Join <strong>${opts.companyName}</strong> as a <strong>${opts.role}</strong></p>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;">
    <p style="color:#334155;margin:0 0 16px;">Click the button below to accept your invitation and set up your account:</p>
    <a href="${inviteUrl}" style="display:inline-block;background:#FF6600;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Accept Invitation</a>
    <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">Or paste this token manually in the app:</p>
    <code style="display:block;background:#f1f5f9;padding:10px 14px;border-radius:6px;font-size:13px;color:#172034;word-break:break-all;margin-top:6px;">${opts.token}</code>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">This invitation expires in 7 days.</p>
</div>`,
  }).catch((err: unknown) => {
    if (err instanceof ResendSandboxError) {
      logger.warn({ allowedEmail: err.allowedEmail }, "Invite email skipped — Resend sandbox mode");
    } else {
      logger.error({ err }, "Failed to send invite email");
    }
  });
}

const router = Router();

// POST /invitations — invite a team member
router.post(
  "/invitations",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  requireSeatAvailable,
  asyncHandler(async (req, res) => {
    const parsed = CreateInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Check if this email already belongs to an active member of the company
    const [existingMember] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingMember) {
      res.status(409).json({ error: "This person is already a member of your team." });
      return;
    }

    // Delete any expired invitations for this email so the slot is clean
    await db
      .delete(invitationsTable)
      .where(
        and(
          eq(invitationsTable.email, email),
          eq(invitationsTable.companyId, req.companyId!),
          lt(invitationsTable.expiresAt, new Date()),
        ),
      );

    // Check if there's already a live pending invitation for this email
    const [existingInvite] = await db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.email, email),
          eq(invitationsTable.companyId, req.companyId!),
          eq(invitationsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingInvite) {
      res.status(409).json({ error: "A pending invitation has already been sent to this email. Revoke it first before re-inviting." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(invitationsTable)
      .values({
        companyId: req.companyId!,
        email,
        role: parsed.data.role,
        preferredLanguage: parsed.data.preferredLanguage ?? "en",
        token,
        status: "pending",
        expiresAt,
      })
      .returning();

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!))
      .limit(1);

    // Send invite email — best-effort, never blocks the response
    if (parsed.data.email) {
      const appBase = buildAppBase(req);
      if (!appBase) {
        logger.error("Cannot send invitation email: APP_BASE_URL is not configured");
        res.status(500).json({ error: "Server misconfiguration: invitation base URL not set" });
        return;
      }
      sendInviteEmail({
        to: parsed.data.email,
        token,
        role: parsed.data.role,
        companyName: company?.name ?? "your company",
        appBase,
      });
    }

    res.status(201).json({ ...invitation, company: company ?? null });
  }),
);

// PATCH /invitations/:id — edit a pending invitation's email and/or role
router.patch(
  "/invitations/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { email, role } = req.body as { email?: string; role?: string };
    if (!email && !role) { res.status(400).json({ error: "Provide email or role to update" }); return; }

    const [existing] = await db
      .select()
      .from(invitationsTable)
      .where(and(eq(invitationsTable.id, id), eq(invitationsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Invitation not found" }); return; }
    if (existing.status !== "pending") { res.status(409).json({ error: "Only pending invitations can be edited" }); return; }

    const updates: Record<string, unknown> = {};
    if (email) updates.email = email.toLowerCase().trim();
    if (role && ["owner", "foreman", "worker"].includes(role)) updates.role = role;
    const { preferredLanguage } = req.body as { preferredLanguage?: string };
    if (preferredLanguage && ["en", "it", "pt", "es"].includes(preferredLanguage)) {
      updates.preferredLanguage = preferredLanguage;
    }

    const [updated] = await db
      .update(invitationsTable)
      .set(updates)
      .where(eq(invitationsTable.id, id))
      .returning();

    res.json({ ...updated, company: null });
  }),
);

// DELETE /invitations/:id — revoke a pending invitation
router.delete(
  "/invitations/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db
      .select()
      .from(invitationsTable)
      .where(and(eq(invitationsTable.id, id), eq(invitationsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Invitation not found" }); return; }

    await db
      .update(invitationsTable)
      .set({ status: "expired" })
      .where(eq(invitationsTable.id, id));

    res.status(204).end();
  }),
);

// POST /invitations/:id/resend — refresh the token and resend the invite email
router.post(
  "/invitations/:id/resend",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [existing] = await db
      .select()
      .from(invitationsTable)
      .where(and(eq(invitationsTable.id, id), eq(invitationsTable.companyId, req.companyId!)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Invitation not found" }); return; }
    if (existing.status === "accepted") {
      res.status(409).json({ error: "This invitation has already been accepted." });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!))
      .limit(1);

    const appBase = buildAppBase(req);
    if (!appBase) {
      logger.error("Cannot resend invitation email: APP_BASE_URL is not configured");
      res.status(500).json({ error: "Server misconfiguration: invitation base URL not set" });
      return;
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(invitationsTable)
      .set({ token: newToken, expiresAt: newExpiresAt, status: "pending" })
      .where(eq(invitationsTable.id, id))
      .returning();

    sendInviteEmail({
      to: existing.email,
      token: newToken,
      role: existing.role,
      companyName: company?.name ?? "your company",
      appBase,
    });

    res.json({ ...updated, company: company ?? null });
  }),
);

// GET /invitations/company — list pending invitations for my company
router.get(
  "/invitations/company",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const invitations = await db
      .select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.companyId, req.companyId!),
          eq(invitationsTable.status, "pending"),
        ),
      );

    res.json(invitations.map((i) => ({ ...i, company: null })));
  }),
);

// GET /invitations/:token — verify invite
// PUBLIC — no requireAuth. Invite links are opened before the recipient has a
// Clerk session, so this endpoint must be reachable without a Bearer token.
router.get("/invitations/:token", asyncHandler(async (req, res) => {
  const { token } = req.params;

  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token as string))
    .limit(1);

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  // Auto-expire
  if (invitation.expiresAt < new Date()) {
    await db
      .update(invitationsTable)
      .set({ status: "expired" })
      .where(eq(invitationsTable.id, invitation.id));
    res.status(404).json({ error: "Invitation has expired" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, invitation.companyId))
    .limit(1);

  res.json({ ...invitation, company: company ?? null });
}))

// POST /invitations/:token/accept — accept invite and join company
// PUBLIC (session-aware but not requireAuth-gated). A brand-new Clerk user who
// clicks an invite link has a session but no DB record yet. This route handles
// its own Clerk verification via getAuth() and auto-syncs the user if needed.
// Do NOT add requireAuth here — it would break the invite acceptance flow.
// Uses auto-sync: if the local DB user doesn't exist yet (brand-new Clerk sign-up),
// we fetch their profile from Clerk and upsert them before accepting.
router.post("/invitations/:token/accept", asyncHandler(async (req, res) => {
  const { token } = req.params;

  // 1. Verify Clerk session
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // 2. Ensure local DB user exists — auto-sync from Clerk if not.
  //    Always fetch the Clerk profile so we can verify the session email below.
  let clerkEmail: string;
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    clerkEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase().trim() ?? "";
    if (!clerkEmail) {
      res.status(401).json({ error: "Unable to verify email address from Clerk session." });
      return;
    }
  } catch {
    res.status(401).json({ error: "Unable to sync user. Please try signing out and back in." });
    return;
  }

  let [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!dbUser) {
    try {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId,
          email: clerkEmail,
          firstName: "",
          lastName: "",
        })
        .returning();
      dbUser = created;
    } catch {
      res.status(401).json({ error: "Unable to sync user. Please try signing out and back in." });
      return;
    }
  }

  // 3. Look up invitation by token (any status)
  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token as string))
    .limit(1);

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  // 3a. Verify the Clerk session email matches the invited email (P0 security fix).
  //     Prevents forwarded invitation links from granting access to unintended users.
  if (clerkEmail !== invitation.email.toLowerCase().trim()) {
    res.status(403).json({
      error: "This invitation was sent to a different email address. Sign in with the invited email to accept.",
    });
    return;
  }

  // 3b. Idempotent: if already accepted and user is already in this company, return success
  if (invitation.status === "accepted") {
    const [existingMembership] = await db
      .select()
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, dbUser.id),
          eq(userMembershipsTable.companyId, invitation.companyId),
        ),
      )
      .limit(1);
    if (existingMembership) {
      const [company] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.id, invitation.companyId))
        .limit(1);
      res.json({ ...dbUser, company: company ?? null });
      return;
    }
    res.status(400).json({ error: "Invitation has already been used" });
    return;
  }

  // If the invitation is expired (either flagged by GET or by checking the timestamp),
  // auto-refresh the token and resend a fresh invite email so the recipient doesn't
  // have to ask an admin to manually delete and re-invite them.
  const isExpired =
    invitation.status === "expired" ||
    (invitation.status === "pending" && invitation.expiresAt < new Date());

  if (isExpired) {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, invitation.companyId))
      .limit(1);

    const appBase = buildAppBase(req);
    if (appBase) {
      const newToken = crypto.randomBytes(32).toString("hex");
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db
        .update(invitationsTable)
        .set({ token: newToken, expiresAt: newExpiresAt, status: "pending" })
        .where(eq(invitationsTable.id, invitation.id));
      sendInviteEmail({
        to: invitation.email,
        token: newToken,
        role: invitation.role,
        companyName: company?.name ?? "your company",
        appBase,
      });
    } else {
      logger.error("Cannot auto-resend expired invite: APP_BASE_URL is not configured");
    }

    res.status(410).json({
      error:
        "Your invite link has expired. We've sent a fresh invite to your email address — please check your inbox.",
      resent: !!appBase,
    });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(400).json({ error: "Invitation is no longer valid" });
    return;
  }

  // 4–5. Assign membership, update user, mark invitation accepted — all in one transaction
  //       so partial state (e.g. membership created but invitation still "pending") is impossible.
  let updatedUser: typeof dbUser;
  try {
    updatedUser = await db.transaction(async (tx) => {
      await tx
        .insert(userMembershipsTable)
        .values({ userId: dbUser.id, companyId: invitation.companyId, role: invitation.role, isActive: true })
        .onConflictDoUpdate({
          target: [userMembershipsTable.userId, userMembershipsTable.companyId],
          set: { role: invitation.role, isActive: true },
        });
      await tx
        .update(usersTable)
        .set({
          activeCompanyId: invitation.companyId,
          preferredLanguage: invitation.preferredLanguage ?? "en",
        })
        .where(eq(usersTable.id, dbUser.id));
      await tx
        .update(invitationsTable)
        .set({ status: "accepted" })
        .where(eq(invitationsTable.id, invitation.id));
      const [u] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, dbUser.id))
        .limit(1);
      return u;
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to accept invitation");
    res.status(500).json({ error: "Failed to accept invitation. Please try again." });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, invitation.companyId))
    .limit(1);

  // Notify all owners of the company — best-effort, non-blocking
  db.select({ email: usersTable.email, name: usersTable.name })
    .from(userMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, userMembershipsTable.userId))
    .where(
      and(
        eq(userMembershipsTable.companyId, invitation.companyId),
        eq(userMembershipsTable.role, "owner"),
        eq(userMembershipsTable.isActive, true)
      )
    )
    .then((owners) => {
      const ownerEmails = owners.map((o) => o.email).filter(Boolean) as string[];
      if (!ownerEmails.length) return;
      const memberName = updatedUser?.name || invitation.email;
      const companyName = company?.name ?? "your company";
      sendEmail({
        to: ownerEmails,
        subject: `${memberName} just joined ${companyName} on Site Snap`,
        html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="font-size:32px;">🏗️</span>
    <h1 style="margin:12px 0 4px;font-size:22px;color:#172034;">New team member joined</h1>
    <p style="color:#64748b;margin:0;">Someone accepted their invitation to <strong>${companyName}</strong></p>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#64748b;padding:6px 0;width:80px;">Name</td><td style="color:#172034;font-weight:600;">${memberName}</td></tr>
      <tr><td style="color:#64748b;padding:6px 0;">Email</td><td style="color:#172034;">${invitation.email}</td></tr>
      <tr><td style="color:#64748b;padding:6px 0;">Role</td><td style="color:#172034;text-transform:capitalize;">${invitation.role}</td></tr>
    </table>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">You're receiving this because you're an owner of ${companyName} on Site Snap.</p>
</div>`,
      }).catch((err) => {
        logger.warn({ err }, "Failed to send owner join-notification email");
      });
    })
    .catch((err) => {
      logger.warn({ err }, "Failed to query owners for join-notification email");
    });

  res.json({ ...updatedUser, company: company ?? null });
}))

export default router;
