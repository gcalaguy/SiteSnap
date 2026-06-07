/**
 * Compliance dashboard stats + Ministry Audit Export endpoints.
 *
 *  GET  /api/compliance/dashboard            – per-project directive counts + safety status
 *  GET  /api/projects/:projectId/compliance/audit-export  – downloadable PDF audit packet
 */
import { Router } from "express";
import { db, aiComplianceDirectivesTable, projectsTable, formSubmissionsTable,
         formTemplatesTable, usersTable, workerDocumentsTable, companiesTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireCompany } from "../lib/auth";
import { NotFoundError } from "../lib/errors";
import { buildSafetyAuditPdfBuffer } from "../lib/safetyAuditPdf";
import type { AuditSubmission, AuditCertification, AuditDirective } from "../lib/safetyAuditPdf";

const router = Router();

// ── GET /api/compliance/dashboard ─────────────────────────────────────────────
// Returns per-project directive counts and derived safety status for all
// active projects belonging to the authenticated company.
router.get(
  "/compliance/dashboard",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!;

    // Fetch all active projects for this company
    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status })
      .from(projectsTable)
      .where(and(
        eq(projectsTable.companyId, companyId),
        sql`${projectsTable.status} IN ('active','planning')`,
      ));

    if (projects.length === 0) {
      res.json([]);
      return;
    }

    const projectIds = projects.map((p) => p.id);

    // Pull all directives for those projects in one query
    const directives = await db
      .select({
        projectId: aiComplianceDirectivesTable.projectId,
        status: aiComplianceDirectivesTable.status,
        urgency: aiComplianceDirectivesTable.urgency,
      })
      .from(aiComplianceDirectivesTable)
      .where(
        and(
          eq(aiComplianceDirectivesTable.companyId, companyId),
          inArray(aiComplianceDirectivesTable.projectId, projectIds),
        ),
      );

    // Group directive stats per project in JS (fast, no extra queries)
    type Stats = { pending: number; pendingHigh: number; completed: number; dismissed: number };
    const statMap = new Map<number, Stats>();
    for (const pid of projectIds) {
      statMap.set(pid, { pending: 0, pendingHigh: 0, completed: 0, dismissed: 0 });
    }
    for (const d of directives) {
      const s = statMap.get(d.projectId);
      if (!s) continue;
      if (d.status === "PENDING") {
        s.pending++;
        if (d.urgency === "HIGH") s.pendingHigh++;
      } else if (d.status === "COMPLETED") {
        s.completed++;
      } else if (d.status === "DISMISSED") {
        s.dismissed++;
      }
    }

    const rows = projects.map((p) => {
      const s = statMap.get(p.id) ?? { pending: 0, pendingHigh: 0, completed: 0, dismissed: 0 };
      const safetyStatus =
        s.pendingHigh > 0 ? "critical" :
        s.pending > 0     ? "warning" :
                            "ok";
      return { project: p, ...s, safetyStatus };
    });

    // Sort: critical first, then warning, then ok
    const ORDER: Record<string, number> = { critical: 0, warning: 1, ok: 2 };
    rows.sort((a, b) => ORDER[a.safetyStatus] - ORDER[b.safetyStatus]);

    res.json(rows);
  }),
);

// ── GET /api/projects/:projectId/compliance/audit-export ─────────────────────
// Compiles all signed safety forms, certifications, and directive history for
// a project into a downloadable PDF audit packet.
router.get(
  "/projects/:projectId/compliance/audit-export",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
    const companyId = req.companyId!;

    // Verify the project belongs to this company
    const [project] = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        address: projectsTable.address,
        city: projectsTable.city,
        province: projectsTable.province,
      })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
      .limit(1);

    if (!project) throw new NotFoundError("Project not found");

    // Get requesting user name
    const [me] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    const exportedBy = me ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() : "System";

    // ── Safety form submissions ──────────────────────────────────────────────
    const rawSubs = await db
      .select({
        id: formSubmissionsTable.id,
        templateId: formSubmissionsTable.templateId,
        data: formSubmissionsTable.data,
        status: formSubmissionsTable.status,
        aiSummary: formSubmissionsTable.aiSummary,
        reviewedAt: formSubmissionsTable.reviewedAt,
        reviewNotes: formSubmissionsTable.reviewNotes,
        createdAt: formSubmissionsTable.createdAt,
        reviewedByUserId: formSubmissionsTable.reviewedByUserId,
        userId: formSubmissionsTable.userId,
        templateName: formTemplatesTable.name,
        category: formTemplatesTable.category,
      })
      .from(formSubmissionsTable)
      .innerJoin(formTemplatesTable, eq(formTemplatesTable.id, formSubmissionsTable.templateId))
      .where(
        and(
          eq(formSubmissionsTable.projectId, projectId),
          eq(formSubmissionsTable.companyId, companyId),
        ),
      )
      .orderBy(desc(formSubmissionsTable.createdAt));

    // Batch-fetch user names for submitters and reviewers
    const userIds = Array.from(new Set([
      ...rawSubs.map((s) => s.userId),
      ...rawSubs.map((s) => s.reviewedByUserId).filter(Boolean) as number[],
    ]));

    const userRows = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()]));

    const submissions: AuditSubmission[] = rawSubs.map((s) => ({
      id: s.id,
      templateName: s.templateName,
      category: s.category,
      submittedBy: userMap.get(s.userId) ?? `User #${s.userId}`,
      status: s.status,
      reviewedBy: s.reviewedByUserId ? (userMap.get(s.reviewedByUserId) ?? null) : null,
      reviewedAt: s.reviewedAt ? new Date(s.reviewedAt).toISOString() : null,
      reviewNotes: s.reviewNotes ?? null,
      aiSummary: s.aiSummary ?? null,
      createdAt: new Date(s.createdAt).toISOString(),
      data: (s.data as Record<string, unknown>) ?? {},
    }));

    // ── Worker certifications ────────────────────────────────────────────────
    const rawCerts = await db
      .select({
        id: workerDocumentsTable.id,
        workerId: workerDocumentsTable.workerId,
        documentType: workerDocumentsTable.documentType,
        status: workerDocumentsTable.status,
        expirationDate: workerDocumentsTable.expirationDate,
        fileUrl: workerDocumentsTable.fileUrl,
        createdAt: workerDocumentsTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(workerDocumentsTable)
      .innerJoin(usersTable, eq(usersTable.id, workerDocumentsTable.workerId))
      .where(eq(workerDocumentsTable.companyId, companyId))
      .orderBy(desc(workerDocumentsTable.createdAt));

    const certifications: AuditCertification[] = rawCerts.map((c) => ({
      workerName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      documentType: c.documentType,
      status: c.status,
      expirationDate: c.expirationDate ? new Date(c.expirationDate).toISOString() : null,
      fileUrl: c.fileUrl ?? null,
      uploadedAt: new Date(c.createdAt).toISOString(),
    }));

    // ── AI compliance directive history ──────────────────────────────────────
    const rawDirectives = await db
      .select()
      .from(aiComplianceDirectivesTable)
      .where(
        and(
          eq(aiComplianceDirectivesTable.projectId, projectId),
          eq(aiComplianceDirectivesTable.companyId, companyId),
        ),
      )
      .orderBy(desc(aiComplianceDirectivesTable.createdAt));

    const directives: AuditDirective[] = rawDirectives.map((d) => ({
      targetFormId: d.targetFormId,
      urgency: d.urgency,
      workerDirective: d.workerDirective,
      status: d.status,
      confidenceScore: d.confidenceScore,
      createdAt: new Date(d.createdAt).toISOString(),
    }));

    // ── Build PDF ────────────────────────────────────────────────────────────
    const [company] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);

    const pdfBuffer = await buildSafetyAuditPdfBuffer({
      companyName: (company as any)?.name ?? "Your Company",
      projectName: project.name,
      projectLocation: [project.address, project.city, project.province].filter(Boolean).join(", "),
      exportedAt: new Date().toLocaleDateString("en-CA", {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      }),
      exportedBy,
      submissions,
      certifications,
      directives,
    });

    const filename = `audit-${project.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  }),
);

export default router;
