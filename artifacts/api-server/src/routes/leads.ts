import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadActivitiesTable,
  contactsTable,
  projectsTable,
  usersTable,
  userMembershipsTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";

import { z } from "zod";

const router = Router();
router.use(requireFeature("Contacts"));

const CreateLeadBody = z.object({
  contactId: z.coerce.number().int().positive(),
  title: z.string().min(1),
  source: z
    .enum(["referral", "website", "ads", "social_media", "cold_call", "other"])
    .default("other"),
  estimatedValue: z.coerce.number().positive().optional(),
  stage: z
    .enum([
      "new_lead",
      "contacted",
      "estimate_scheduled",
      "proposal_sent",
      "won",
      "lost",
    ])
    .default("new_lead"),
  notes: z.string().optional(),
});

const UpdateLeadBody = z.object({
  title: z.string().min(1).optional(),
  source: z
    .enum(["referral", "website", "ads", "social_media", "cold_call", "other"])
    .optional(),
  estimatedValue: z.coerce.number().positive().nullable().optional(),
  stage: z
    .enum([
      "new_lead",
      "contacted",
      "estimate_scheduled",
      "proposal_sent",
      "won",
      "lost",
    ])
    .optional(),
  notes: z.string().nullable().optional(),
  contactId: z.coerce.number().int().positive().optional(),
});

const CreateActivityBody = z.object({
  type: z.enum(["call", "email", "meeting", "note"]),
  notes: z.string().min(1),
});

async function getLeadWithContact(leadId: number, companyId: number) {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, companyId)),
    );
  if (!lead) return null;

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, lead.contactId));

  return { ...lead, contact: contact ?? null };
}

// GET /leads
router.get("/leads", requireAuth, requireCompany, async (req, res) => {
  const companyId = req.companyId!;

  const leads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.companyId, companyId))
    .orderBy(desc(leadsTable.createdAt));

  // Attach contacts in batch
  const contactIds = [...new Set(leads.map((l) => l.contactId))];
  const contacts =
    contactIds.length > 0
      ? await db
          .select()
          .from(contactsTable)
          .where(eq(contactsTable.companyId, companyId))
      : [];

  const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c]));

  res.json(leads.map((l) => ({ ...l, contact: contactMap[l.contactId] ?? null })));
});

// GET /leads/:leadId
router.get("/leads/:leadId", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  const lead = await getLeadWithContact(leadId, req.companyId!);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  res.json(lead);
});

// POST /leads
router.post("/leads", requireAuth, requireCompany, async (req, res) => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { estimatedValue, ...rest } = parsed.data;

  const [lead] = await db
    .insert(leadsTable)
    .values({
      companyId: req.companyId!,
      estimatedValue: estimatedValue != null ? String(estimatedValue) : null,
      ...rest,
    })
    .returning();

  const full = await getLeadWithContact(lead.id, req.companyId!);
  res.status(201).json(full);
});

// PATCH /leads/:leadId
router.patch("/leads/:leadId", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { estimatedValue, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (estimatedValue !== undefined) {
    updates.estimatedValue = estimatedValue != null ? String(estimatedValue) : null;
  }

  const [updated] = await db
    .update(leadsTable)
    .set(updates)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Lead not found" }); return; }

  const full = await getLeadWithContact(updated.id, req.companyId!);
  res.json(full);
});

// DELETE /leads/:leadId
router.delete("/leads/:leadId", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  // Delete activities first
  await db.delete(leadActivitiesTable).where(eq(leadActivitiesTable.leadId, leadId));

  const [deleted] = await db
    .delete(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Lead not found" }); return; }

  res.status(204).send();
});

// POST /leads/:leadId/convert — convert a Won lead into a Project
router.post("/leads/:leadId/convert", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, req.companyId!)));

  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  if (lead.stage !== "won") { res.status(400).json({ error: "Only 'won' leads can be converted to projects" }); return; }
  if (lead.convertedProjectId) { res.status(400).json({ error: "Lead already converted" }); return; }

  const ConvertBody = z.object({
    address: z.string().min(1),
    city: z.string().min(1),
    province: z.string().min(1),
  });

  const bodyParsed = ConvertBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.flatten() }); return; }

  const [project] = await db
    .insert(projectsTable)
    .values({
      companyId: req.companyId!,
      name: lead.title,
      address: bodyParsed.data.address,
      city: bodyParsed.data.city,
      province: bodyParsed.data.province,
      status: "planning",
      budget: lead.estimatedValue ?? null,
      description: lead.notes ?? null,
    })
    .returning();

  await db
    .update(leadsTable)
    .set({ convertedProjectId: project.id, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  res.status(201).json({ project, leadId });
});

// GET /leads/:leadId/activities
router.get("/leads/:leadId/activities", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  const activities = await db
    .select()
    .from(leadActivitiesTable)
    .where(eq(leadActivitiesTable.leadId, leadId))
    .orderBy(desc(leadActivitiesTable.createdAt));

  // Attach user names
  const userIds = [...new Set(activities.map((a) => a.userId))];
  const users =
    userIds.length > 0
      ? await db
          .select()
          .from(usersTable)
          .innerJoin(
            userMembershipsTable,
            and(
              eq(userMembershipsTable.userId, usersTable.id),
              eq(userMembershipsTable.companyId, req.companyId!),
            ),
          )
      : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json(
    activities.map((a) => ({
      ...a,
      user: userMap[a.userId]
        ? {
            id: userMap[a.userId].id,
            firstName: userMap[a.userId].firstName,
            lastName: userMap[a.userId].lastName,
          }
        : null,
    })),
  );
});

// POST /leads/:leadId/activities
router.post("/leads/:leadId/activities", requireAuth, requireCompany, async (req, res) => {
  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }

  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, req.companyId!)));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [activity] = await db
    .insert(leadActivitiesTable)
    .values({ leadId, userId: req.userId!, ...parsed.data })
    .returning();

  res.status(201).json(activity);
});

export default router;
