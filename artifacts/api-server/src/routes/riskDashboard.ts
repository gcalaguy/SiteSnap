import { Router } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  inspectionsTable,
  inspectionAlertsTable,
  projectsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.get(
  "/risk-dashboard",
  requireAuth,
  requireCompany,
  requirePermission("viewRiskTab"),
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!;

    // Top high/critical risk inspections (last 30 days)
    const topRisk = await db
      .select({
        inspection: inspectionsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        inspector: {
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        },
      })
      .from(inspectionsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, inspectionsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, inspectionsTable.inspectorId))
      .where(
        and(
          eq(inspectionsTable.companyId, companyId),
          eq(inspectionsTable.status, "submitted"),
          inArray(inspectionsTable.riskLevel, ["Critical", "High", "Medium"]),
        ),
      )
      .orderBy(desc(inspectionsTable.riskScore), desc(inspectionsTable.createdAt))
      .limit(5);

    // Alert severity breakdown (unread only)
    const alertCounts = await db
      .select({
        severity: inspectionAlertsTable.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(inspectionAlertsTable)
      .where(
        and(
          eq(inspectionAlertsTable.companyId, companyId),
          eq(inspectionAlertsTable.isRead, false),
        ),
      )
      .groupBy(inspectionAlertsTable.severity);

    // Overall inspection health for last 30 days
    const healthStats = await db
      .select({
        riskLevel: inspectionsTable.riskLevel,
        count: sql<number>`count(*)::int`,
      })
      .from(inspectionsTable)
      .where(
        and(
          eq(inspectionsTable.companyId, companyId),
          eq(inspectionsTable.status, "submitted"),
          sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '30 days'`,
        ),
      )
      .groupBy(inspectionsTable.riskLevel);

    // Average risk score last 30 days
    const [avgResult] = await db
      .select({ avg: sql<number>`round(avg(${inspectionsTable.riskScore})::numeric, 1)` })
      .from(inspectionsTable)
      .where(
        and(
          eq(inspectionsTable.companyId, companyId),
          eq(inspectionsTable.status, "submitted"),
          sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '30 days'`,
          sql`${inspectionsTable.riskScore} IS NOT NULL`,
        ),
      );

    const severityMap: Record<string, number> = {};
    for (const row of alertCounts) {
      severityMap[row.severity] = row.count;
    }

    const healthMap: Record<string, number> = {};
    for (const row of healthStats) {
      if (row.riskLevel) healthMap[row.riskLevel] = row.count;
    }

    // 7-day daily risk score trend
    const trend = await db
      .select({
        day: sql<string>`DATE(${inspectionsTable.createdAt})::text`,
        avgScore: sql<number>`round(avg(${inspectionsTable.riskScore})::numeric, 1)`,
        count: sql<number>`count(*)::int`,
      })
      .from(inspectionsTable)
      .where(
        and(
          eq(inspectionsTable.companyId, companyId),
          eq(inspectionsTable.status, "submitted"),
          sql`${inspectionsTable.createdAt} >= NOW() - INTERVAL '7 days'`,
          sql`${inspectionsTable.riskScore} IS NOT NULL`,
        ),
      )
      .groupBy(sql`DATE(${inspectionsTable.createdAt})`)
      .orderBy(sql`DATE(${inspectionsTable.createdAt})`);

    res.json({
      topRisk,
      alerts: {
        critical: severityMap["critical"] ?? 0,
        high: severityMap["high"] ?? 0,
        medium: severityMap["medium"] ?? 0,
        total: Object.values(severityMap).reduce((a, b) => a + b, 0),
      },
      health: {
        critical: healthMap["Critical"] ?? 0,
        high: healthMap["High"] ?? 0,
        medium: healthMap["Medium"] ?? 0,
        low: healthMap["Low"] ?? 0,
        avgRiskScore: avgResult?.avg ?? null,
      },
      trend,
    });
  }),
);

export default router;
