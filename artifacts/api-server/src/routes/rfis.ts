import { Router } from "express";
import { db, rfisTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { CreateRFIBody, UpdateRFIBody } from "@workspace/api-zod";
import { sendPushNotification } from "../lib/push";

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
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
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
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = CreateRFIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const rfiNumber = await getNextRFINumber(projectId);

  const [rfi] = await db
    .insert(rfisTable)
    .values({
      ...parsed.data,
      projectId,
      rfiNumber,
      submittedByUserId: req.userId!,
      priority: parsed.data.priority ?? "medium",
    })
    .returning();

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  // Fire-and-forget push notification to assignee
  const assigneeId = parsed.data.assignedToUserId;
  if (assigneeId && assigneeId !== req.userId) {
    db.select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, assigneeId))
      .limit(1)
      .then(([assignee]) => {
        if (assignee?.pushToken) {
          sendPushNotification(
            assignee.pushToken,
            "New RFI Assigned",
            `${rfi.rfiNumber}: ${rfi.subject}`,
            { type: "rfi", rfiId: rfi.id, projectId },
          );
        }
      })
      .catch(() => {});
  }

  res.status(201).json({ ...rfi, submittedBy: submittedBy ?? null });
});

// GET /projects/:projectId/rfis/:rfiId
router.get("/:rfiId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const rfiId = parseInt(req.params.rfiId);

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
router.put("/:rfiId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const rfiId = parseInt(req.params.rfiId);

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

export default router;
