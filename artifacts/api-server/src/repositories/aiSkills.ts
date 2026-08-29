import {
  db,
  aiSkillRunsTable,
  type AiSkillRun,
  type InsertAiSkillRun,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, notInArray } from "drizzle-orm";

export async function createAiSkillRun(run: InsertAiSkillRun): Promise<AiSkillRun> {
  const [row] = await db.insert(aiSkillRunsTable).values(run).returning();
  return row;
}

export interface ListAiSkillRunsOpts {
  projectId?: number;
  skillKey?: string;
  /** When set, restricts to these project IDs (worker scoping). */
  accessibleProjectIds?: number[];
  /** Skill keys to exclude entirely (worker visibility rule for compliance-gated skills). */
  excludeSkillKeys?: string[];
  limit?: number;
  offset?: number;
}

export async function listAiSkillRuns(
  companyId: number,
  opts: ListAiSkillRunsOpts = {},
): Promise<{ data: AiSkillRun[]; total: number }> {
  const conditions = [eq(aiSkillRunsTable.companyId, companyId)];
  if (opts.projectId) conditions.push(eq(aiSkillRunsTable.projectId, opts.projectId));
  if (opts.skillKey) conditions.push(eq(aiSkillRunsTable.skillKey, opts.skillKey));
  if (opts.accessibleProjectIds) {
    conditions.push(
      opts.accessibleProjectIds.length
        ? inArray(aiSkillRunsTable.projectId, opts.accessibleProjectIds)
        : sql`false`,
    );
  }
  if (opts.excludeSkillKeys?.length) {
    conditions.push(notInArray(aiSkillRunsTable.skillKey, opts.excludeSkillKeys));
  }
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(aiSkillRunsTable)
      .where(where)
      .orderBy(desc(aiSkillRunsTable.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(aiSkillRunsTable).where(where),
  ]);

  return { data: rows, total };
}

export async function getAiSkillRun(companyId: number, id: number): Promise<AiSkillRun | null> {
  const [row] = await db
    .select()
    .from(aiSkillRunsTable)
    .where(and(eq(aiSkillRunsTable.companyId, companyId), eq(aiSkillRunsTable.id, id)));
  return row ?? null;
}

export async function setAiSkillRunApproval(
  companyId: number,
  id: number,
  patch: { status: "approved" | "rejected"; approvedByUserId: number; rejectionReason?: string },
): Promise<AiSkillRun | null> {
  const [row] = await db
    .update(aiSkillRunsTable)
    .set({
      status: patch.status,
      approvedByUserId: patch.approvedByUserId,
      approvedAt: new Date(),
      rejectionReason: patch.status === "rejected" ? (patch.rejectionReason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(aiSkillRunsTable.companyId, companyId), eq(aiSkillRunsTable.id, id)))
    .returning();
  return row ?? null;
}
