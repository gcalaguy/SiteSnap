import { Router } from "express";
import { db, usersTable, companiesTable, invitationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { CreateInvitationBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

// POST /invitations — invite a team member
router.post(
  "/invitations",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
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
router.post("/invitations/:token/accept", requireAuth, async (req, res) => {
  const { token } = req.params;

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

  // Assign user to company with invited role
  await db
    .update(usersTable)
    .set({ companyId: invitation.companyId, role: invitation.role })
    .where(eq(usersTable.id, req.userId!));

  // Mark invitation as accepted
  await db
    .update(invitationsTable)
    .set({ status: "accepted" })
    .where(eq(invitationsTable.id, invitation.id));

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, invitation.companyId))
    .limit(1);

  res.json({ ...user, company: company ?? null });
});

export default router;
