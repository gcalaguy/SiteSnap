import { Router } from "express";
import { db, usersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/auth";
import { SyncUserBody } from "@workspace/api-zod";

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
    const [updated] = await db
      .update(usersTable)
      .set({ email, firstName, lastName })
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, firstName, lastName })
      .returning();
    res.json(created);
  }
});

// GET /users/me — get current user with company
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

  let company = null;
  if (user.companyId) {
    const [c] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId))
      .limit(1);
    company = c ?? null;
  }

  res.json({ ...user, company });
});

export default router;
