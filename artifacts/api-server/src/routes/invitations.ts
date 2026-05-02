import { Router } from "express";
import { db, usersTable, companiesTable, invitationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requireSeatAvailable } from "../lib/seatEnforcement";
import { CreateInvitationBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

// POST /invitations — invite a team member
router.post(
  "/invitations",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  requireSeatAvailable,
  async (req, res) => {
    const parsed = CreateInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(invitationsTable)
      .values({
        companyId: req.companyId!,
        email: parsed.data.email,
        role: parsed.data.role,
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

    res.status(201).json({ ...invitation, company: company ?? null });
  },
);

// GET /invitations/company — list pending invitations for my company
router.get(
  "/invitations/company",
  requireAuth,
  requireCompany,
  async (req, res) => {
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
  },
);

// GET /invitations/:token — verify invite
router.get("/invitations/:token", async (req, res) => {
  const { token } = req.params;

  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token))
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
});

// POST /invitations/:token/accept — accept invite and join company
// Uses auto-sync: if the local DB user doesn't exist yet (brand-new Clerk sign-up),
// we fetch their profile from Clerk and upsert them before accepting.
router.post("/invitations/:token/accept", async (req, res) => {
  const { token } = req.params;

  // 1. Verify Clerk session
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // 2. Ensure local DB user exists — auto-sync from Clerk if not
  let [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!dbUser) {
    try {
      const clerkUser = await clerkClient().users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId,
          email,
          firstName: clerkUser.firstName ?? "",
          lastName: clerkUser.lastName ?? "",
        })
        .returning();
      dbUser = created;
    } catch {
      res.status(401).json({ error: "Unable to sync user. Please try signing out and back in." });
      return;
    }
  }

  // 3. Look up and validate the invitation
  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.token, token), eq(invitationsTable.status, "pending")))
    .limit(1);

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found or already used" });
    return;
  }

  if (invitation.expiresAt < new Date()) {
    res.status(400).json({ error: "Invitation has expired" });
    return;
  }

  // 4. Assign user to company with invited role
  await db
    .update(usersTable)
    .set({ companyId: invitation.companyId, role: invitation.role })
    .where(eq(usersTable.id, dbUser.id));

  // 5. Mark invitation as accepted
  await db
    .update(invitationsTable)
    .set({ status: "accepted" })
    .where(eq(invitationsTable.id, invitation.id));

  const [updatedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, dbUser.id))
    .limit(1);

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, invitation.companyId))
    .limit(1);

  res.json({ ...updatedUser, company: company ?? null });
});

export default router;
