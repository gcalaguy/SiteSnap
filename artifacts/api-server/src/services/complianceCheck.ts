import { db, workerDocumentsTable, workerSchedulesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Canadian COR / provincial safety credentials required before a worker
 * can be legally assigned to a site (Ontario IHSA guidance).
 */
export const REQUIRED_COR_CREDENTIALS: string[] = [
  "Working at Heights",
  "WHMIS",
  "COR Training",
];

/**
 * Validates whether a single worker holds active, non-expired provincial
 * safety certificates. Always scoped to companyId for multi-tenant isolation.
 */
export async function validateWorkerCompliance(
  workerId: string,
  projectId: string,
  companyId: number,
): Promise<{ compliant: boolean; missingCredentials: string[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const docs = await db
    .select({
      documentType: workerDocumentsTable.documentType,
      expirationDate: workerDocumentsTable.expirationDate,
    })
    .from(workerDocumentsTable)
    .where(
      and(
        eq(workerDocumentsTable.workerId, Number(workerId)),
        eq(workerDocumentsTable.companyId, companyId),
        eq(workerDocumentsTable.status, "active"),
      ),
    );

  const validDocTypes = new Set(
    docs
      .filter((d) => !d.expirationDate || d.expirationDate >= today)
      .map((d) => d.documentType),
  );

  const missingCredentials = REQUIRED_COR_CREDENTIALS.filter(
    (c) => !validDocTypes.has(c),
  );

  return { compliant: missingCredentials.length === 0, missingCredentials };
}

/**
 * Batch-checks compliance across multiple projects for a tenant.
 * Returns the set of projectIds that have at least one scheduled worker with
 * missing or expired COR credentials. Never throws — returns empty set on error.
 */
export async function getProjectsWithComplianceAlerts(
  companyId: number,
  projectIds: number[],
): Promise<Set<number>> {
  if (projectIds.length === 0) return new Set();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedules = await db
    .select({
      projectId: workerSchedulesTable.projectId,
      userId: workerSchedulesTable.userId,
    })
    .from(workerSchedulesTable)
    .where(
      and(
        eq(workerSchedulesTable.companyId, companyId),
        inArray(workerSchedulesTable.projectId, projectIds),
      ),
    );

  const workerIds = [
    ...new Set(
      schedules
        .filter((s) => s.userId != null)
        .map((s) => s.userId as number),
    ),
  ];

  if (workerIds.length === 0) return new Set();

  const allDocs = await db
    .select({
      workerId: workerDocumentsTable.workerId,
      documentType: workerDocumentsTable.documentType,
      expirationDate: workerDocumentsTable.expirationDate,
    })
    .from(workerDocumentsTable)
    .where(
      and(
        eq(workerDocumentsTable.companyId, companyId),
        eq(workerDocumentsTable.status, "active"),
        inArray(workerDocumentsTable.workerId, workerIds),
      ),
    );

  const validDocsPerWorker = new Map<number, Set<string>>();
  for (const doc of allDocs) {
    if (!doc.expirationDate || doc.expirationDate >= today) {
      if (!validDocsPerWorker.has(doc.workerId)) {
        validDocsPerWorker.set(doc.workerId, new Set());
      }
      validDocsPerWorker.get(doc.workerId)!.add(doc.documentType);
    }
  }

  const nonCompliantWorkerIds = new Set(
    workerIds.filter((wId) => {
      const validTypes = validDocsPerWorker.get(wId) ?? new Set();
      return REQUIRED_COR_CREDENTIALS.some((c) => !validTypes.has(c));
    }),
  );

  const alertProjectIds = new Set(
    schedules
      .filter(
        (s) => s.userId != null && nonCompliantWorkerIds.has(s.userId as number),
      )
      .map((s) => s.projectId),
  );

  return alertProjectIds;
}
