import { Router } from "express";
import { db, rfisTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { CreateRFIBody, UpdateRFIBody } from "@workspace/api-zod";
import { notify } from "../lib/notify";
import { asyncHandler } from "../lib/asyncHandler";

// GET /rfis — all RFIs across all projects for the authenticated company
export const allRfisRouter = Router();
allRfisRouter.get(
  "/rfis",
  requireAuth,
  requireCompany,
  requirePermission("viewQuotes"),
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: rfisTable.id,
        projectId: rfisTable.projectId,
        projectName: projectsTable.name,
        rfiNumber: rfisTable.rfiNumber,
        subject: rfisTable.subject,
        status: rfisTable.status,
        priority: rfisTable.priority,
        dueDate: rfisTable.dueDate,
        createdAt: rfisTable.createdAt,
        submittedByFirstName: usersTable.firstName,
        submittedByLastName: usersTable.lastName,
      })
      .from(rfisTable)
      .innerJoin(projectsTable, and(
        eq(rfisTable.projectId, projectsTable.id),
        eq(projectsTable.companyId, req.companyId!),
      ))
      .leftJoin(usersTable, eq(rfisTable.submittedByUserId, usersTable.id))
      .orderBy(rfisTable.createdAt);

    res.json(rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      rfiNumber: r.rfiNumber,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate ?? null,
      createdAt: r.createdAt,
      submittedByName: r.submittedByFirstName && r.submittedByLastName
        ? `${r.submittedByFirstName} ${r.submittedByLastName}`
        : "Unknown",
    })));
  }),
);

const router = Router({ mergeParams: true });

async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project;
}

async function getNextRFINumber(projectId: number): Promise<string> {
  const [result] = await db
    .select({ count: count() })
    .from(rfisTable)
    .where(eq(rfisTable.projectId, projectId));
  const num = (result?.count ?? 0) + 1;
  return `RFI-${String(num).padStart(3, "0")}`;
}

// GET /projects/:projectId/rfis
router.get("/", requireAuth, requireCompany, requirePermission("viewQuotes"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const rfis = await db
    .select()
    .from(rfisTable)
    .where(eq(rfisTable.projectId, projectId));

  // Attach submittedBy user
  const userIds = [...new Set(rfis.map((r) => r.submittedByUserId))];
  const users = userIds.length
    ? await db.select().from(usersTable).where(eq(usersTable.id, userIds[0]))
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json(rfis.map((r) => ({ ...r, submittedBy: userMap[r.submittedByUserId] ?? null })));
});

// POST /projects/:projectId/rfis
router.post("/", requireAuth, requireCompany, requirePermission("manageQuotes"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = CreateRFIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const rfiNumber = await getNextRFINumber(projectId);

  const { dueDate: rfsDueDate, ...rfisData } = parsed.data;
  const [rfi] = await db
    .insert(rfisTable)
    .values({
      ...rfisData,
      projectId,
      rfiNumber,
      submittedByUserId: req.userId!,
      priority: parsed.data.priority ?? "medium",
      ...(rfsDueDate !== undefined && { dueDate: rfsDueDate instanceof Date ? rfsDueDate.toISOString().split("T")[0] : rfsDueDate }),
    })
    .returning();

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  // Notify assignee (DB record + push)
  const assigneeId = parsed.data.assignedToUserId;
  if (assigneeId) {
    notify({
      userId: assigneeId,
      actorUserId: req.userId ?? undefined,
      type: "rfi",
      title: "New RFI Assigned",
      body: `${rfi.rfiNumber}: ${rfi.subject}`,
      referenceId: rfi.id,
      projectId,
    }).catch(() => {});
  }

  res.status(201).json({ ...rfi, submittedBy: submittedBy ?? null });
});

// GET /projects/:projectId/rfis/:rfiId
router.get("/:rfiId", requireAuth, requireCompany, requirePermission("viewQuotes"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const rfiId = parseInt(req.params.rfiId as string);

  const [rfi] = await db
    .select()
    .from(rfisTable)
    .where(and(eq(rfisTable.id, rfiId), eq(rfisTable.projectId, projectId)))
    .limit(1);

  if (!rfi) { res.status(404).json({ error: "RFI not found" }); return; }

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, rfi.submittedByUserId))
    .limit(1);

  res.json({ ...rfi, submittedBy: submittedBy ?? null });
});

// PUT /projects/:projectId/rfis/:rfiId
router.put("/:rfiId", requireAuth, requireCompany, requirePermission("manageQuotes"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const rfiId = parseInt(req.params.rfiId as string);

  const parsed = UpdateRFIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "closed" || parsed.data.status === "answered") {
    updateData.closedAt = new Date();
  }

  const [rfi] = await db
    .update(rfisTable)
    .set(updateData)
    .where(and(eq(rfisTable.id, rfiId), eq(rfisTable.projectId, projectId)))
    .returning();

  if (!rfi) { res.status(404).json({ error: "RFI not found" }); return; }

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, rfi.submittedByUserId))
    .limit(1);

  res.json({ ...rfi, submittedBy: submittedBy ?? null });
});

// DELETE /projects/:projectId/rfis/:rfiId
router.delete("/:rfiId", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const rfiId = parseInt(req.params.rfiId as string);
  await db
    .delete(rfisTable)
    .where(and(eq(rfisTable.id, rfiId), eq(rfisTable.projectId, projectId)));
  res.json({ ok: true });
});

export default router;
