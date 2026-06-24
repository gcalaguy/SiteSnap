import { Router } from "express";
import { z } from "zod";
import { db, projectsTable, userMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { canAccessProject } from "../lib/projectAccess";
import { ForbiddenError, NotFoundError, BadRequestError } from "../lib/errors";
import { logAuditEventFromRequest } from "../utils/logger";
import {
  getProjectCorDashboard,
  getCompanyCorSummary,
  getCorAuditTrail,
  getWorkerCredentialMatrix,
  getCredentialsForUser,
  upsertWorkerCredential,
  getVoiceLogsForProject,
  getMyCorAuditEntries,
  getMyVoiceLogs,
  listPolicyDocuments,
  createPolicyDocument,
  archivePolicyDocument,
  signPolicyDocument,
  getSignoffMatrix,
  getMyPendingSignoffs,
  getMySignoffs,
  getPolicySignoffSummary,
  getSignoffElementCompliance,
  listSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
  upsertSubcontractorDoc,
  deleteSubcontractorDoc,
  getFlaggedSubcontractors,
  getSubcontractorSummary,
  listCapaTickets,
  getCapaTicket,
  createCapaTicket,
  updateCapaTicket,
  closeCapaTicket,
  voidCapaTicket,
  getCapaSummary,
  getActionRequiredCapas,
  getCompanyMembersForPicker,
  getCompanyExpiringSoonCredentials,
  createAuditorToken,
  listAuditorTokens,
  revokeAuditorToken,
} from "../repositories/cor";
import { checkWorkerEligibility } from "../services/cor/credentialGatekeeper";
import { sendCredentialExpiryAlerts } from "../cron";
import { processVoiceLog } from "../services/cor/voiceLogProcessor";
import {
  buildAuditPackage,
  listAuditPackages,
  getPackageVerificationLog,
  getAuditPackageRecord,
} from "../services/cor/auditPackageBuilder";
import { runShadowAuditor } from "../services/cor/shadowAuditor";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const UpsertCredentialBody = z.object({
  certificateNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expirationDate: z.string().optional(),
  status: z.enum(["active", "expired", "pending", "revoked"]).optional(),
  documentUrl: z.string().url().optional(),
  issuedBy: z.string().optional(),
  notes: z.string().optional(),
});

const CheckEligibilityBody = z.object({
  userId: z.number().int().positive(),
});

const VoiceLogBody = z.object({
  projectId: z.number().int().positive(),
  rawTranscript: z.string().min(3).max(4000),
  assignedToUserId: z.number().int().positive().optional(),
});

const VALID_CREDENTIAL_TYPES = [
  "working_at_heights",
  "whmis",
  "cor_training",
  "first_aid",
  "fall_protection",
  "confined_space",
  "elevated_work_platform",
] as const;

// ── Helper: resolve project with tenant ownership check ───────────────────────

async function resolveProject(projectId: number, companyId: number) {
  const [project] = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project ?? null;
}

// ── GET /cor/projects/:projectId/dashboard ────────────────────────────────────

router.get(
  "/cor/projects/:projectId/dashboard",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) throw new BadRequestError("Invalid project ID");

    const project = await resolveProject(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    const dashboard = await getProjectCorDashboard(req.companyId!, projectId);
    res.json({ project: { id: project.id, name: project.name }, ...dashboard });
  }),
);

// ── GET /cor/projects/:projectId/audit-trail ──────────────────────────────────

router.get(
  "/cor/projects/:projectId/audit-trail",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) throw new BadRequestError("Invalid project ID");

    const project = await resolveProject(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    const limit = Math.min(parseInt((req.query.limit as string) ?? "50") || 50, 200);
    const offset = parseInt((req.query.offset as string) ?? "0") || 0;
    const ihsaElement = req.query.element as string | undefined;
    const findingType = req.query.findingType as string | undefined;

    const result = await getCorAuditTrail(req.companyId!, projectId, {
      limit,
      offset,
      ihsaElement,
      findingType,
    });

    res.json({ data: result.rows, total: result.total });
  }),
);

// ── GET /cor/company/summary ──────────────────────────────────────────────────

router.get(
  "/cor/company/summary",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const summary = await getCompanyCorSummary(req.companyId!);
    res.json(summary);
  }),
);

// ── GET /cor/credentials — full company credential matrix ─────────────────────

router.get(
  "/cor/credentials",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const matrix = await getWorkerCredentialMatrix(req.companyId!);
    res.json({ workers: matrix });
  }),
);

// ── GET /cor/credentials/expiring-soon — credentials expiring in 0–65 days ────
// Returns a company-scoped list sorted by days remaining (ascending).

router.get(
  "/cor/credentials/expiring-soon",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const expiring = await getCompanyExpiringSoonCredentials(req.companyId!);
    res.json({ expiring });
  }),
);

// ── POST /cor/credentials/run-expiry-alerts — manually trigger alert scan ─────
// Admin-only. Fires the same job as the 6 AM cron — useful for testing or
// when an admin wants to force alerts immediately after updating credentials.

router.post(
  "/cor/credentials/run-expiry-alerts",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (_req, res) => {
    const result = await sendCredentialExpiryAlerts();
    res.json({ success: true, ...result });
  }),
);

// ── GET /cor/credentials/:userId — individual worker credentials ──────────────
// Owner/Foreman: any worker in company; Worker: own record only

router.get(
  "/cor/credentials/:userId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const targetUserId = parseInt(req.params.userId as string);
    if (isNaN(targetUserId)) throw new BadRequestError("Invalid user ID");

    // Workers can only read their own credentials
    if (req.userRole === "worker" && req.userId !== targetUserId) {
      throw new ForbiddenError("Workers may only view their own credentials");
    }

    // Verify the target user belongs to this company (prevents cross-tenant reads)
    const [membership] = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!membership) throw new NotFoundError("User not found in this company");

    const credentials = await getCredentialsForUser(req.companyId!, targetUserId);
    res.json(credentials);
  }),
);

// ── PUT /cor/credentials/:userId/:credentialType — upsert a credential ────────

router.put(
  "/cor/credentials/:userId/:credentialType",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const targetUserId = parseInt(req.params.userId as string);
    const credentialType = req.params.credentialType as string;

    if (isNaN(targetUserId)) throw new BadRequestError("Invalid user ID");
    if (!(VALID_CREDENTIAL_TYPES as readonly string[]).includes(credentialType)) {
      throw new BadRequestError(
        `Invalid credential type. Valid types: ${VALID_CREDENTIAL_TYPES.join(", ")}`,
      );
    }

    const parsed = UpsertCredentialBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    // Verify the target user is a member of this company
    const [membership] = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, targetUserId),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!membership) throw new NotFoundError("User not found in this company");

    const credential = await upsertWorkerCredential({
      companyId: req.companyId!,
      userId: targetUserId,
      credentialType: credentialType as any,
      ...parsed.data,
    });

    await logAuditEventFromRequest(req, "COR_CREDENTIAL_UPSERT", `Credential "${credentialType}" updated for user #${targetUserId}`);

    res.json(credential);
  }),
);

// ── POST /cor/credentials/check — pre-schedule eligibility check ──────────────
// Read-only check — never throws 409; returns eligibility result for the caller to act on

router.post(
  "/cor/credentials/check",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CheckEligibilityBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("userId is required", parsed.error.flatten());

    const { userId } = parsed.data;

    // Verify the target user is a member of this company
    const [membership] = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, userId),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!membership) throw new NotFoundError("User not found in this company");

    const result = await checkWorkerEligibility(req.companyId!, userId);
    res.json(result);
  }),
);

// ── POST /cor/voice-log — submit voice transcript ─────────────────────────────
// All roles; workers are scoped to projects they can access

router.post(
  "/cor/voice-log",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const parsed = VoiceLogBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const { projectId, rawTranscript, assignedToUserId } = parsed.data;

    // Verify tenant project ownership
    const project = await resolveProject(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    // Workers must be assigned to the project to submit a voice log for it
    if (
      req.userRole === "worker" &&
      !(await canAccessProject(req.companyId!, req.userId!, "worker", projectId))
    ) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    // If assignedToUserId is provided, verify they belong to this company
    if (assignedToUserId) {
      const [assigneeMembership] = await db
        .select({ userId: userMembershipsTable.userId })
        .from(userMembershipsTable)
        .where(
          and(
            eq(userMembershipsTable.userId, assignedToUserId),
            eq(userMembershipsTable.companyId, req.companyId!),
          ),
        )
        .limit(1);

      if (!assigneeMembership) throw new NotFoundError("Assigned user not found in this company");
    }

    const voiceLog = await processVoiceLog(
      rawTranscript,
      req.companyId!,
      projectId,
      req.userId!,
      assignedToUserId,
    );

    res.status(201).json(voiceLog);
  }),
);

// ── GET /cor/voice-log — list voice logs (role-scoped) ───────────────────────

router.get(
  "/cor/voice-log",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole === "worker") {
      const logs = await getMyVoiceLogs(req.companyId!, req.userId!);
      return res.json(logs);
    }

    // Owner/Foreman: require ?projectId= to scope the response
    const projectId = parseInt((req.query.projectId as string) ?? "");
    if (isNaN(projectId)) {
      throw new BadRequestError("projectId query param is required for admin voice log listing");
    }

    const project = await resolveProject(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    const logs = await getVoiceLogsForProject(req.companyId!, projectId);
    return res.json(logs);
  }),
);

// ── GET /cor/my-audit — worker's own COR trail ───────────────────────────────

router.get(
  "/cor/my-audit",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const entries = await getMyCorAuditEntries(req.companyId!, req.userId!);
    res.json(entries);
  }),
);

// ── POST /cor/audit-package/generate — generate & stream ZIP ─────────────────

const GeneratePackageBody = z.object({
  label: z.string().min(1).max(200).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  projectIds: z.array(z.number().int().positive()).optional(),
});

router.post(
  "/cor/audit-package/generate",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = GeneratePackageBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const { label, periodStart, periodEnd, projectIds } = parsed.data;
    const packageLabel = label ?? `COR Audit Package — ${new Date().toISOString().slice(0, 10)}`;

    const result = await buildAuditPackage({
      companyId: req.companyId!,
      userId: req.userId!,
      label: packageLabel,
      periodStart,
      periodEnd,
      projectIds,
    });

    await logAuditEventFromRequest(req, "COR_AUDIT_PACKAGE_GENERATED",
      `Audit package "${packageLabel}" generated (${result.totalEntries} entries, checksum: ${result.checksum.slice(0, 16)}...)`);

    const fileName = `COR_Audit_Package_${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", result.fileSizeBytes);
    res.setHeader("X-Package-Id", result.packageId);
    res.setHeader("X-Package-Checksum", result.checksum);
    res.setHeader("X-Total-Entries", result.totalEntries);
    res.setHeader("X-Overall-Score", String(
      Math.round(result.elementSummary.reduce((s, e) => s + e.score, 0) / (result.elementSummary.length || 1))
    ));

    res.end(result.zipBuffer);
  }),
);

// ── GET /cor/audit-packages — list past generated packages ────────────────────

router.get(
  "/cor/audit-packages",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const packages = await listAuditPackages(req.companyId!);
    res.json(packages);
  }),
);

// ── GET /cor/audit-package/:id/verification — tamper-evident log ─────────────

router.get(
  "/cor/audit-package/:id/verification",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const packageId = parseInt(req.params.id as string);
    if (isNaN(packageId)) throw new BadRequestError("Invalid package ID");

    const entries = await getPackageVerificationLog(req.companyId!, packageId);
    if (!entries.length) throw new NotFoundError("Package not found");

    res.json({
      packageId,
      chainEntries: entries,
      verificationNote: "Each entry's chain_hash = SHA-256(prev_chain_hash + JSON(event fields)). Verify the chain in order to confirm data integrity.",
    });
  }),
);

// ── GET /cor/audit-package/:id/download — regenerate & stream ZIP by ID ──────

router.get(
  "/cor/audit-package/:id/download",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const packageId = parseInt(req.params.id as string);
    if (isNaN(packageId)) throw new BadRequestError("Invalid package ID");

    const pkg = await getAuditPackageRecord(req.companyId!, packageId);
    if (!pkg) throw new NotFoundError("Package not found");

    const result = await buildAuditPackage({
      companyId: req.companyId!,
      userId: req.userId!,
      label: pkg.label,
      periodStart: pkg.periodStart ?? undefined,
      periodEnd: pkg.periodEnd ?? undefined,
      projectIds: Array.isArray(pkg.projectIds) ? (pkg.projectIds as number[]) : undefined,
    });

    const fileName = `COR_Audit_Package_${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", result.fileSizeBytes);
    res.setHeader("X-Package-Id", result.packageId);
    res.setHeader("X-Package-Checksum", result.checksum);
    res.end(result.zipBuffer);
  }),
);

// ── Policy Documents ──────────────────────────────────────────────────────────

const VALID_IHSA_ELEMENTS = [
  "element_1","element_2","element_3","element_4","element_5","element_6","element_7",
  "element_8","element_9","element_10","element_11","element_12","element_13","element_14",
  "element_15","element_16","element_17","element_18","element_19",
] as const;

const VALID_DOC_TYPES = ["swp", "jha", "company_rules", "policy"] as const;

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const CreatePolicyDocBody = z.object({
  documentType: z.enum(VALID_DOC_TYPES),
  title: z.string().min(1).max(300),
  description: z.preprocess(emptyToUndefined, z.string().max(1000).optional()),
  fileUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
  contentText: z.preprocess(emptyToUndefined, z.string().max(50000).optional()),
  ihsaElement: z.enum(VALID_IHSA_ELEMENTS),
  requiresAnnualRenewal: z.boolean().optional().default(false),
});

function isMissingTable(err: unknown): boolean {
  return (err as any)?.code === "42P01"; // PostgreSQL: undefined_table
}

// GET /cor/policy-documents — list all active policy documents (all roles)
router.get(
  "/cor/policy-documents",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === "true" && req.userRole !== "worker";
    try {
      const docs = await listPolicyDocuments(req.companyId!, includeInactive);
      return res.json({ documents: docs });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ documents: [] });
      throw err;
    }
  }),
);

// POST /cor/policy-documents — create a new policy document (admin only)
router.post(
  "/cor/policy-documents",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreatePolicyDocBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(
        parsed.error.issues.map((i) => i.message).join("; "),
        parsed.error.flatten(),
      );
    }

    const doc = await createPolicyDocument({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      ...parsed.data,
    });

    await logAuditEventFromRequest(req, "COR_POLICY_DOC_CREATED",
      `Policy document "${doc.title}" (${doc.documentType}) created for element ${doc.ihsaElement}`);

    res.status(201).json(doc);
  }),
);

// DELETE /cor/policy-documents/:id — archive (soft-delete) a document (admin only)
router.delete(
  "/cor/policy-documents/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid document ID");

    const doc = await archivePolicyDocument(req.companyId!, id);
    if (!doc) throw new NotFoundError("Policy document not found");

    await logAuditEventFromRequest(req, "COR_POLICY_DOC_ARCHIVED",
      `Policy document "${doc.title}" archived`);

    res.json({ success: true });
  }),
);

// POST /cor/policy-documents/:id/sign — worker submits a digital sign-off
router.post(
  "/cor/policy-documents/:id/sign",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const docId = parseInt(req.params.id as string);
    if (isNaN(docId)) throw new BadRequestError("Invalid document ID");

    // Verify document exists and belongs to this company
    const docs = await listPolicyDocuments(req.companyId!);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) throw new NotFoundError("Policy document not found");

    const signatureData = typeof req.body?.signatureData === "string"
      ? req.body.signatureData.slice(0, 100_000)
      : undefined;

    const ipAddress = req.ip ?? req.socket.remoteAddress ?? undefined;

    const signoff = await signPolicyDocument({
      companyId: req.companyId!,
      policyDocumentId: docId,
      workerUserId: req.userId!,
      ipAddress,
      userAgent: req.headers["user-agent"]?.slice(0, 500),
      signatureData,
    });

    await logAuditEventFromRequest(req, "COR_POLICY_SIGNOFF",
      `Worker #${req.userId} signed policy document "${doc.title}" (${doc.documentType})`);

    res.status(201).json(signoff);
  }),
);

// GET /cor/policy-signoffs/pending — documents the calling worker hasn't signed yet
// NOTE: must be registered BEFORE /cor/policy-signoffs to avoid Express matching /pending as the base path
router.get(
  "/cor/policy-signoffs/pending",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    try {
      const pending = await getMyPendingSignoffs(req.companyId!, req.userId!);
      return res.json({ pending });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ pending: [] });
      throw err;
    }
  }),
);

// GET /cor/signoff-element-compliance — per-IHSA-element signoff evidence (admin)
router.get(
  "/cor/signoff-element-compliance",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const compliance = await getSignoffElementCompliance(req.companyId!);
      return res.json({ compliance });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ compliance: [] });
      throw err;
    }
  }),
);

// GET /cor/policy-signoffs/summary — compliance % across all docs (admin)
router.get(
  "/cor/policy-signoffs/summary",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const summary = await getPolicySignoffSummary(req.companyId!);
      return res.json(summary);
    } catch (err) {
      if (isMissingTable(err)) return res.json({ totalDocs: 0, signedAllCount: 0, totalWorkers: 0, overallPercent: 100 });
      throw err;
    }
  }),
);

// GET /cor/policy-signoffs — admin: full signoff matrix; worker: own signoffs
router.get(
  "/cor/policy-signoffs",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    try {
      if (req.userRole === "worker") {
        const rows = await getMySignoffs(req.companyId!, req.userId!);
        return res.json({ signoffs: rows });
      }
      const matrix = await getSignoffMatrix(req.companyId!);
      return res.json({ matrix });
    } catch (err) {
      if (isMissingTable(err)) {
        return req.userRole === "worker"
          ? res.json({ signoffs: [] })
          : res.json({ matrix: [] });
      }
      throw err;
    }
  }),
);

// ── Subcontractor Compliance ──────────────────────────────────────────────────

const VALID_TRADE_TYPES = [
  "electrical","plumbing","hvac","concrete","framing","drywall","roofing",
  "masonry","excavation","landscaping","painting","flooring","mechanical",
  "fire_protection","steel_erection","insulation","glazing","general","other",
] as const;

const VALID_SUB_DOC_TYPES = [
  "wsib_clearance","safety_manual","insurance_certificate",
  "health_safety_policy","cor_certificate","other",
] as const;

const VALID_DOC_STATUSES = ["valid","expired","pending","rejected"] as const;

const CreateSubBody = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  contactEmail: z.preprocess(emptyToUndefined, z.string().email().optional()),
  contactPhone: z.preprocess(emptyToUndefined, z.string().max(50).optional()),
  tradeType: z.enum(VALID_TRADE_TYPES),
  notes: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
});

const UpdateSubBody = CreateSubBody.partial();

const UpsertDocBody = z.object({
  docType: z.enum(VALID_SUB_DOC_TYPES),
  docStatus: z.enum(VALID_DOC_STATUSES),
  documentUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
  issueDate: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
  expiryDate: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
  notes: z.preprocess(emptyToUndefined, z.string().max(1000).optional()),
});

// Specific sub-paths BEFORE the /:id param route
router.get(
  "/cor/subcontractors/flagged",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const flagged = await getFlaggedSubcontractors(req.companyId!);
      return res.json({ flagged });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ flagged: [] });
      throw err;
    }
  }),
);

router.get(
  "/cor/subcontractors/summary",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const summary = await getSubcontractorSummary(req.companyId!);
      return res.json(summary);
    } catch (err) {
      if (isMissingTable(err)) return res.json({ total: 0, compliant: 0, expired: 0, nonCompliant: 0, pending: 0 });
      throw err;
    }
  }),
);

router.get(
  "/cor/subcontractors",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const subs = await listSubcontractors(req.companyId!);
      return res.json({ subcontractors: subs });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ subcontractors: [] });
      throw err;
    }
  }),
);

router.post(
  "/cor/subcontractors",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreateSubBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const sub = await createSubcontractor({
      companyId: req.companyId!,
      ...parsed.data,
    });
    await logAuditEventFromRequest(req, "COR_SUB_CREATED",
      `Subcontractor "${sub.companyName}" (${sub.tradeType}) added`);
    res.status(201).json(sub);
  }),
);

router.put(
  "/cor/subcontractors/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid subcontractor ID");
    const parsed = UpdateSubBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const sub = await updateSubcontractor(req.companyId!, id, parsed.data);
    if (!sub) throw new NotFoundError("Subcontractor not found");
    res.json(sub);
  }),
);

router.delete(
  "/cor/subcontractors/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid subcontractor ID");
    const ok = await deleteSubcontractor(req.companyId!, id);
    if (!ok) throw new NotFoundError("Subcontractor not found");
    await logAuditEventFromRequest(req, "COR_SUB_DELETED", `Subcontractor #${id} removed`);
    res.json({ success: true });
  }),
);

// POST /cor/subcontractors/:id/invite — stamp invitedAt and record audit event
router.post(
  "/cor/subcontractors/:id/invite",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid subcontractor ID");
    const sub = await updateSubcontractor(req.companyId!, id, { invitedAt: new Date() });
    if (!sub) throw new NotFoundError("Subcontractor not found");
    await logAuditEventFromRequest(
      req,
      "COR_SUB_INVITED",
      `Invite sent to subcontractor "${sub.companyName}" (${sub.contactEmail ?? "no email"})`,
    );
    res.json(sub);
  }),
);

router.post(
  "/cor/subcontractors/:id/docs",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const subId = parseInt(req.params.id as string);
    if (isNaN(subId)) throw new BadRequestError("Invalid subcontractor ID");
    const parsed = UpsertDocBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const doc = await upsertSubcontractorDoc({
      subcontractorId: subId,
      companyId: req.companyId!,
      ...parsed.data,
    });
    res.status(201).json(doc);
  }),
);

router.delete(
  "/cor/subcontractors/:id/docs/:docId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const subId = parseInt(req.params.id as string);
    const docId = parseInt(req.params.docId as string);
    if (isNaN(subId) || isNaN(docId)) throw new BadRequestError("Invalid ID");
    const ok = await deleteSubcontractorDoc(req.companyId!, subId, docId);
    if (!ok) throw new NotFoundError("Document not found");
    res.json({ success: true });
  }),
);

// ── CAPA Tickets ──────────────────────────────────────────────────────────────

const VALID_CAPA_PRIORITIES = ["critical", "high", "medium", "low"] as const;
const VALID_CAPA_IHSA_ELEMENTS = [
  "element_1","element_2","element_3","element_4","element_5","element_6","element_7",
  "element_8","element_9","element_10","element_11","element_12","element_13","element_14",
  "element_15","element_16","element_17","element_18","element_19",
] as const;

const CreateCapaBody = z.object({
  title: z.string().min(1).max(300),
  description: z.preprocess(emptyToUndefined, z.string().max(4000).optional()),
  ihsaElement: z.enum(VALID_CAPA_IHSA_ELEMENTS).optional(),
  priority: z.enum(VALID_CAPA_PRIORITIES).default("medium"),
  assignedToUserId: z.number().int().positive().optional(),
  dueDate: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
  projectId: z.number().int().positive().optional(),
});

const UpdateCapaBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.preprocess(emptyToUndefined, z.string().max(4000).optional()),
  ihsaElement: z.enum(VALID_CAPA_IHSA_ELEMENTS).optional(),
  priority: z.enum(VALID_CAPA_PRIORITIES).optional(),
  status: z.enum(["open", "in_progress", "pending_review"]).optional(),
  assignedToUserId: z.number().int().positive().optional().nullable(),
  dueDate: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
});

const CloseCapaBody = z.object({
  closureNotes: z.string().min(5).max(4000),
  evidencePhotoUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

// GET /cor/members — company member list for CAPA assignment picker
router.get(
  "/cor/members",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const members = await getCompanyMembersForPicker(req.companyId!);
    res.json({ members });
  }),
);

// GET /cor/capa/action-required — open inspection-sourced CAPAs (BEFORE /:id)
router.get(
  "/cor/capa/action-required",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const items = await getActionRequiredCapas(req.companyId!);
      return res.json({ items });
    } catch (err) {
      if (isMissingTable(err)) return res.json({ items: [] });
      throw err;
    }
  }),
);

// GET /cor/capa/summary — stats (BEFORE /:id)
router.get(
  "/cor/capa/summary",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const summary = await getCapaSummary(req.companyId!);
      return res.json(summary);
    } catch (err) {
      if (isMissingTable(err)) return res.json({ open: 0, inProgress: 0, pendingReview: 0, closed: 0, overdue: 0 });
      throw err;
    }
  }),
);

// GET /cor/capa
router.get(
  "/cor/capa",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
      const offset = parseInt((req.query.offset as string) || "0");
      const result = await listCapaTickets(req.companyId!, { status, limit, offset });
      return res.json(result);
    } catch (err) {
      if (isMissingTable(err)) return res.json({ data: [], total: 0 });
      throw err;
    }
  }),
);

// POST /cor/capa
router.post(
  "/cor/capa",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreateCapaBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    if (parsed.data.assignedToUserId != null) {
      const [membership] = await db
        .select({ userId: userMembershipsTable.userId })
        .from(userMembershipsTable)
        .where(
          and(
            eq(userMembershipsTable.userId, parsed.data.assignedToUserId),
            eq(userMembershipsTable.companyId, req.companyId!),
          ),
        )
        .limit(1);
      if (!membership) throw new NotFoundError("Assigned user not found in this company");
    }

    const ticket = await createCapaTicket({
      companyId: req.companyId!,
      sourceType: "manual",
      createdByUserId: req.userId!,
      ...parsed.data,
    });
    await logAuditEventFromRequest(req, "CAPA_CREATED", `CAPA ticket created: "${ticket.title}"`);
    res.status(201).json(ticket);
  }),
);

// GET /cor/capa/:id
router.get(
  "/cor/capa/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid CAPA ID");
    try {
      const ticket = await getCapaTicket(req.companyId!, id);
      if (!ticket) throw new NotFoundError("CAPA ticket not found");
      res.json(ticket);
    } catch (err) {
      if (isMissingTable(err)) throw new NotFoundError("CAPA ticket not found");
      throw err;
    }
  }),
);

// PUT /cor/capa/:id
router.put(
  "/cor/capa/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid CAPA ID");
    const parsed = UpdateCapaBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    if (parsed.data.assignedToUserId != null) {
      const [membership] = await db
        .select({ userId: userMembershipsTable.userId })
        .from(userMembershipsTable)
        .where(
          and(
            eq(userMembershipsTable.userId, parsed.data.assignedToUserId),
            eq(userMembershipsTable.companyId, req.companyId!),
          ),
        )
        .limit(1);
      if (!membership) throw new NotFoundError("Assigned user not found in this company");
    }

    const ticket = await updateCapaTicket(req.companyId!, id, parsed.data as any);
    if (!ticket) throw new NotFoundError("CAPA ticket not found or is locked");
    res.json(ticket);
  }),
);

// POST /cor/capa/:id/close
router.post(
  "/cor/capa/:id/close",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid CAPA ID");
    const parsed = CloseCapaBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const ticket = await closeCapaTicket(req.companyId!, id, {
      closedByUserId: req.userId!,
      closureNotes: parsed.data.closureNotes,
      evidencePhotoUrl: parsed.data.evidencePhotoUrl,
    });
    if (!ticket) throw new NotFoundError("CAPA ticket not found or already locked");
    await logAuditEventFromRequest(req, "CAPA_CLOSED", `CAPA ticket #${id} closed with evidence`);
    res.json(ticket);
  }),
);

// DELETE /cor/capa/:id (void)
router.delete(
  "/cor/capa/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid CAPA ID");
    const ok = await voidCapaTicket(req.companyId!, id);
    if (!ok) throw new NotFoundError("CAPA ticket not found or is locked");
    res.json({ success: true });
  }),
);

// ── External Auditor Token Management ────────────────────────────────────────

const CreateAuditorTokenBody = z.object({
  label: z.string().min(1).max(120),
  expiryDays: z.number().int().min(1).max(180).default(30),
});

router.post(
  "/cor/auditor-tokens",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole !== "owner") {
      throw new ForbiddenError("Only owners can generate auditor access links.");
    }
    const parsed = CreateAuditorTokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const row = await createAuditorToken(
      req.companyId!,
      parsed.data.label,
      req.userId!,
      parsed.data.expiryDays,
    );
    res.status(201).json(row);
  }),
);

router.get(
  "/cor/auditor-tokens",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole !== "owner") {
      throw new ForbiddenError("Only owners can view auditor access links.");
    }
    const tokens = await listAuditorTokens(req.companyId!);
    res.json(tokens);
  }),
);

router.delete(
  "/cor/auditor-tokens/:id",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole !== "owner") {
      throw new ForbiddenError("Only owners can revoke auditor access links.");
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid token ID");
    await revokeAuditorToken(req.companyId!, id);
    res.json({ success: true });
  }),
);

// ── GET /cor/shadow-auditor — predictive AI audit score analysis ───────────────
// Runs the Shadow Auditor engine: gathers company-wide evidence across all
// data sources, applies a weighted scoring model per IHSA element, and uses
// AI to produce gap warnings with specific score impact estimates.

router.get(
  "/cor/shadow-auditor",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const lookbackDays = Math.min(
      parseInt((req.query.lookbackDays as string) ?? "90") || 90,
      365,
    );
    const report = await runShadowAuditor(req.companyId!, lookbackDays);
    res.json(report);
  }),
);

export default router;
