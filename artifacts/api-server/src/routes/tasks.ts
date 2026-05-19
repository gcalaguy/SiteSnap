import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { notify } from "../lib/notify";
import { z } from "zod";

const router = Router({ mergeParams: true });

const CreateTaskBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignedToUserId: z.coerce.number().optional(),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  dueDate: z.string().optional(),
});

const UpdateTaskBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assignedToUserId: z.coerce.number().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().nullable().optional(),
});

// GET /projects/:projectId/tasks
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  // Workers only see tasks assigned to them; owners/foremen see all
  const whereClause =
    req.userRole === "worker"
      ? and(eq(tasksTable.projectId, projectId), eq(tasksTable.assignedToUserId, req.userId!))
      : eq(tasksTable.projectId, projectId);

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(whereClause)
    .orderBy(tasksTable.createdAt);

  res.json(tasks);
});

// POST /projects/:projectId/tasks
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { title, description, assignedToUserId, priority, dueDate } = parsed.data;

  const [task] = await db
    .insert(tasksTable)
    .values({
      projectId,
      title,
      description: description ?? null,
      assignedToUserId: assignedToUserId ?? null,
      priority,
      dueDate: dueDate ?? null,
      status: "todo",
    })
    .returning();

  // Notify assignee (DB record + push)
  if (assignedToUserId) {
    notify({
      userId: assignedToUserId,
      actorUserId: req.userId ?? undefined,
      type: "task",
      title: "New Task Assigned",
      body: `You've been assigned: ${title}`,
      referenceId: task.id,
      projectId,
    }).catch(() => {});
  }

  res.status(201).json(task);
});

// PATCH /projects/:projectId/tasks/:taskId
router.patch("/:taskId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const taskId = parseInt(req.params.taskId as string);
  if (isNaN(projectId) || isNaN(taskId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.assignedToUserId !== undefined) updates.assignedToUserId = parsed.data.assignedToUserId;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;

  const [task] = await db
    .update(tasksTable)
    .set(updates)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.projectId, projectId)))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Notify on re-assignment
  const newAssignee = parsed.data.assignedToUserId;
  if (newAssignee) {
    notify({
      userId: newAssignee,
      actorUserId: req.userId ?? undefined,
      type: "task",
      title: "Task Assigned to You",
      body: `You've been assigned: ${task.title}`,
      referenceId: task.id,
      projectId,
    }).catch(() => {});
  }

  res.json(task);
});

// DELETE /projects/:projectId/tasks/:taskId
router.delete("/:taskId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const taskId = parseInt(req.params.taskId as string);
  if (isNaN(projectId) || isNaN(taskId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  await db
    .delete(tasksTable)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.projectId, projectId)));

  res.status(204).send();
});

export default router;
