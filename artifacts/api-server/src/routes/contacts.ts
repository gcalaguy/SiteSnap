import { Router } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";

import { z } from "zod";

const router = Router();
router.use(requireFeature("Contacts"));

const CreateContactBody = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  type: z.enum(["client", "worker", "subcontractor", "supplier"]).default("client"),
  notes: z.string().optional(),
});

const UpdateContactBody = CreateContactBody.partial();

// GET /contacts
router.get("/contacts", requireAuth, requireCompany, async (req, res) => {
  const companyId = req.companyId!;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;

  let query = db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.companyId, companyId))
    .$dynamic();

  const conditions = [eq(contactsTable.companyId, companyId)];

  if (type && ["client", "worker", "subcontractor", "supplier"].includes(type)) {
    conditions.push(eq(contactsTable.type, type as any));
  }

  if (search) {
    const rows = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          ...conditions,
          or(
            ilike(contactsTable.name, `%${search}%`),
            ilike(contactsTable.email, `%${search}%`),
            ilike(contactsTable.company, `%${search}%`),
          )
        )
      );
    res.json(rows);
    return;
  }

  const rows = await db
    .select()
    .from(contactsTable)
    .where(and(...conditions))
    .orderBy(contactsTable.name);

  res.json(rows);
});

// GET /contacts/:contactId
router.get("/contacts/:contactId", requireAuth, requireCompany, async (req, res) => {
  const contactId = parseInt(req.params.contactId as string);
  if (isNaN(contactId)) {
    res.status(400).json({ error: "Invalid contactId" });
    return;
  }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.companyId, req.companyId!)));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(contact);
});

// POST /contacts
router.post("/contacts", requireAuth, requireCompany, async (req, res) => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, ...rest } = parsed.data;

  const [contact] = await db
    .insert(contactsTable)
    .values({
      companyId: req.companyId!,
      email: email || null,
      ...rest,
    })
    .returning();

  res.status(201).json(contact);
});

// PUT /contacts/:contactId
router.put("/contacts/:contactId", requireAuth, requireCompany, async (req, res) => {
  const contactId = parseInt(req.params.contactId as string);
  if (isNaN(contactId)) {
    res.status(400).json({ error: "Invalid contactId" });
    return;
  }

  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (email !== undefined) updates.email = email || null;

  const [updated] = await db
    .update(contactsTable)
    .set(updates)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.companyId, req.companyId!)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(updated);
});

// DELETE /contacts/:contactId
router.delete("/contacts/:contactId", requireAuth, requireCompany, async (req, res) => {
  const contactId = parseInt(req.params.contactId as string);
  if (isNaN(contactId)) {
    res.status(400).json({ error: "Invalid contactId" });
    return;
  }

  const [deleted] = await db
    .delete(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.status(204).send();
});

export default router;
