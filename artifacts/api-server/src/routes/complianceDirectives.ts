import { Router } from "express";
import { db, aiComplianceDirectivesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireCompany } from "../lib/auth";
import { BadRequestError, NotFoundError } from "../lib/errors";

const router = Router();

router.get(
  "/compliance/directives",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!;
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const status = (req.query.status as string) ?? "PENDING";

    const allowed = ["PENDING", "IN_PROGRESS", "COMPLETED", "DISMISSED", "SUPERSEDED"];
    if (!allowed.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${allowed.join(", ")}`);
    }

    const conditions = [
      eq(aiComplianceDirectivesTable.companyId, companyId),
      eq(aiComplianceDirectivesTable.status, status as any),
    ];
    if (projectId) {
      conditions.push(eq(aiComplianceDirectivesTable.projectId, projectId));
    }

    const directives = await db
      .select()
      .from(aiComplianceDirectivesTable)
      .where(and(...conditions))
      .orderBy(desc(aiComplianceDirectivesTable.createdAt));

    res.json(directives);
  }),
);

router.patch(
  "/compliance/directives/:id",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new BadRequestError("Invalid directive ID");

    const { status } = req.body as { status?: string };
    const allowed = ["DISMISSED", "COMPLETED", "IN_PROGRESS"];
    if (!status || !allowed.includes(status)) {
      throw new BadRequestError(`status must be one of: ${allowed.join(", ")}`);
    }

    const companyId = req.companyId!;

    const [existing] = await db
      .select()
      .from(aiComplianceDirectivesTable)
      .where(
        and(
          eq(aiComplianceDirectivesTable.id, id),
          eq(aiComplianceDirectivesTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!existing) throw new NotFoundError("Directive not found");

    const now = new Date();
    const patch: Partial<typeof aiComplianceDirectivesTable.$inferInsert> & { updatedAt: Date } = {
      status: status as any,
      updatedAt: now,
    };

    if (status === "COMPLETED") {
      patch.completedBy = req.userId!;
      patch.completedAt = now;
    }

    const [updated] = await db
      .update(aiComplianceDirectivesTable)
      .set(patch)
      .where(eq(aiComplianceDirectivesTable.id, id))
      .returning();

    res.json(updated);
  }),
);

export default router;
