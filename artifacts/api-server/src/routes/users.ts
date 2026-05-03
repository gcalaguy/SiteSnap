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
    // Only update names if the incoming values are non-empty — never overwrite real names with blanks
    const updates: Record<string, string> = { email };
    if (firstName && firstName.trim()) updates.firstName = firstName.trim();
    if (lastName && lastName.trim()) updates.lastName = lastName.trim();
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, firstName: firstName?.trim() || email.split("@")[0], lastName: lastName?.trim() || "" })
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
