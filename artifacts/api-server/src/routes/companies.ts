import { Router } from "express";
import { db, usersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth";
import { CreateCompanyBody, UpdateMemberRoleBody } from "@workspace/api-zod";

const router = Router();

// POST /companies — create company and set requester as owner
router.post("/companies", requireAuth, async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const [company] = await db
    .insert(companiesTable)
    .values(parsed.data)
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

    await db
      .update(usersTable)
      .set({ companyId: null })
      .where(eq(usersTable.id, targetUserId));

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

export default router;
