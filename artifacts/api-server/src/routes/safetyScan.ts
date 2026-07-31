import { Router } from "express";
import { z } from "zod";
import { extractJson, type VisionImage } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { requireFeature } from "../lib/featureGate";
import { canAccessProject, assertProjectInCompany } from "../lib/projectAccess";
import { BadRequestError, NotFoundError, ForbiddenError } from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission, ObjectAccessGroupType } from "../lib/objectAcl";
import { db, userMembershipsTable, companiesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  createSafetyScan,
  listSafetyScans,
  getSafetyScan,
  deleteSafetyScan,
  getScanHazard,
  signSafetyScan,
  createCapaFromScanHazard,
  setScanReportPath,
  getCapaRowsForScan,
  type SafetyScanWithHazards,
} from "../repositories/safetyScan";
import { buildSafetyScanPdfBuffer } from "../lib/safetyScanPdf";
import { processSafetyScan, classifyForElement } from "../services/cor/evidenceAggregator";
import { logAuditEventFromRequest } from "../utils/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

async function downloadObjectBuffer(objectPath: string): Promise<Buffer | null> {
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const [buf] = await file.download();
    return buf;
  } catch {
    return null;
  }
}

/** Builds the branded PDF report for a scan and stores it, updating the scan record. */
async function buildAndStoreScanPdf(
  req: { companyId: number; userId: number; userDisplayName?: string },
  scan: SafetyScanWithHazards,
): Promise<string | null> {
  const project = await assertProjectInCompany(scan.projectId, req.companyId);
  if (!project) return null;

  const [company] = await db
    .select({ name: companiesTable.name, logoPath: companiesTable.logoPath })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.companyId));

  const [photoBuffers, companyLogoBuffer, capaRows] = await Promise.all([
    Promise.all((scan.photoObjectPaths as string[]).map(downloadObjectBuffer)).then((bufs) =>
      bufs.map((b) => b ?? Buffer.alloc(0)),
    ),
    company?.logoPath ? downloadObjectBuffer(company.logoPath) : Promise.resolve(null),
    getCapaRowsForScan(req.companyId, scan.id),
  ]);

  let foremanName: string | null = null;
  if (scan.foremanUserId) {
    const [foreman] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.id, scan.foremanUserId))
      .limit(1);
    foremanName = foreman ? `${foreman.firstName ?? ""} ${foreman.lastName ?? ""}`.trim() : null;
  }

  const pdfBuffer = await buildSafetyScanPdfBuffer({
    companyName: company?.name ?? "Company",
    companyLogoBuffer,
    projectName: project.name,
    inspectorName: req.userDisplayName || "Inspector",
    scan,
    photoBuffers,
    capaRows,
    foremanName,
  });

  const reportObjectPath = await objectStorageService.uploadBuffer(pdfBuffer, "application/pdf");
  await objectStorageService.trySetCompanyReadAcl(reportObjectPath, String(req.userId), String(req.companyId));
  await setScanReportPath(scan.id, reportObjectPath);
  return reportObjectPath;
}

const PPE_CHECKLIST = [
  "Hard Hat",
  "Safety Vest",
  "Eye Protection",
  "Fall Harness / Lanyard",
  "Steel-Toe Boots",
  "Gloves",
  "Respirator",
];

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

interface HazardAnalysisResult {
  summary: string;
  complianceScore: number;
  riskLevel: (typeof RISK_LEVELS)[number];
  ppeDetected: Array<{ item: string; present: boolean }>;
  hazards: Array<{
    title: string;
    severity: (typeof RISK_LEVELS)[number];
    description: string;
    remediation: string;
    boundingArea: string;
    photoIndex: number;
  }>;
}

const FALLBACK_ANALYSIS: HazardAnalysisResult = {
  summary: "Analysis complete — could not parse structured response.",
  complianceScore: 0,
  riskLevel: "low",
  ppeDetected: PPE_CHECKLIST.map((item) => ({ item, present: false })),
  hazards: [],
};

// ── Validation ───────────────────────────────────────────────────────────────

const GpsInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitude: z.number().nullable().optional(),
  accuracyM: z.number().nullable().optional(),
  capturedAtUtc: z.string(), // ISO timestamp
  timezone: z.string().optional(),
});

const CreateScanBody = z.object({
  projectId: z.number().int().positive(),
  objectPaths: z.array(z.string().min(1)).min(1).max(8),
  // GPS is best-effort — location services may be disabled or permission denied on
  // the device, and the scan must still proceed without a location tag.
  gps: GpsInput.nullable().optional(),
  siteAddress: z.string().max(500).optional(),
});

const CreateActionBody = z.object({
  assignedToUserId: z.number().int().positive().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  dueDate: z.string().max(10).optional(),
});

const SignScanBody = z.object({
  role: z.enum(["inspector", "foreman"]),
  signatureData: z.string().min(10),
});

async function fetchImagesAsBase64(objectPaths: string[]): Promise<VisionImage[]> {
  const images = await Promise.all(
    objectPaths.map(async (objectPath) => {
      const file = await objectStorageService.getObjectEntityFile(objectPath);
      const [buf] = await file.download();
      const [metadata] = await file.getMetadata();
      return {
        mimeType: (metadata.contentType as string) || "image/jpeg",
        base64: buf.toString("base64"),
      };
    }),
  );
  return images;
}

function buildHazardPrompt(imageCount: number): string {
  return `Analyze these ${imageCount} construction site safety photo(s) as an expert OHS (Occupational Health & Safety) auditor performing a COR-style compliance inspection.

Check PPE compliance for exactly these 7 items: ${PPE_CHECKLIST.join(", ")}.

Check for physical/environmental hazards including: missing guardrails, blocked egress/exits, exposed wiring, chemical spills, unsafe scaffolding/tripod setup, trip hazards, and housekeeping violations.

Return ONLY a JSON object with this exact shape (no markdown, no extra text):
{
  "summary": "2-3 sentence executive description of site conditions",
  "complianceScore": <integer 0-100>,
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "ppeDetected": [{"item": "Hard Hat", "present": true}, ...one entry per checklist item above],
  "hazards": [
    {
      "title": "short hazard name",
      "severity": "Low" | "Medium" | "High" | "Critical",
      "description": "what is wrong and where",
      "remediation": "specific corrective action to take",
      "boundingArea": "brief location description, e.g. 'Center floor area, 2nd level'",
      "photoIndex": <0-based index of the photo this hazard was found in>
    }
  ]
}
If no hazards are found, return an empty "hazards" array.`;
}

function normalizeRisk(v: unknown): (typeof RISK_LEVELS)[number] {
  const s = String(v ?? "low").toLowerCase();
  return (RISK_LEVELS as readonly string[]).includes(s) ? (s as any) : "low";
}

// ── POST /safety/scans ──────────────────────────────────────────────────────

router.post(
  "/safety/scans",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const parsed = CreateScanBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    const { projectId, objectPaths, gps, siteAddress } = parsed.data;

    const project = await assertProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");
    const allowed = await canAccessProject(req.companyId!, req.userId!, req.userRole!, projectId);
    if (!allowed) throw new ForbiddenError("No access to this project");

    // Evidence photos are already durably stored via the presigned-upload flow —
    // just lock down read access to company members (tamper-evident audit trail).
    await Promise.all(
      objectPaths.map((p) =>
        objectStorageService.trySetObjectEntityAclPolicy(p, {
          owner: String(req.userId!),
          visibility: "private",
          aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: String(req.companyId!) }, permission: ObjectPermission.READ }],
        }),
      ),
    );

    const images = await fetchImagesAsBase64(objectPaths);

    const analysis = await extractJson<HazardAnalysisResult>({
      systemPrompt:
        "You are an expert OHS/COR construction safety auditor for Canadian construction sites. Be precise, specific, and use construction industry terminology.",
      prompt: buildHazardPrompt(images.length),
      images,
      model: "gpt-4o",
      jsonMode: true,
      maxTokens: 2048,
      fallback: FALLBACK_ANALYSIS,
    });

    const riskLevel = normalizeRisk(analysis.riskLevel);
    const ppeDetected = Array.isArray(analysis.ppeDetected) && analysis.ppeDetected.length
      ? analysis.ppeDetected
      : FALLBACK_ANALYSIS.ppeDetected;
    const hazardsIn = Array.isArray(analysis.hazards) ? analysis.hazards : [];

    const scan = await createSafetyScan(
      {
        companyId: req.companyId!,
        projectId,
        submittedByUserId: req.userId!,
        status: "complete",
        photoObjectPaths: objectPaths,
        gpsLat: gps ? String(gps.lat) : null,
        gpsLng: gps ? String(gps.lng) : null,
        gpsAltitude: gps?.altitude != null ? String(gps.altitude) : undefined,
        gpsAccuracyM: gps?.accuracyM != null ? String(gps.accuracyM) : undefined,
        gpsCapturedAt: gps ? new Date(gps.capturedAtUtc) : new Date(),
        gpsTimezone: gps?.timezone,
        siteAddress,
        summary: analysis.summary ?? null,
        complianceScore: Math.max(0, Math.min(100, Math.round(analysis.complianceScore ?? 0))),
        riskLevel,
        ppeDetected,
        aiRawResponse: analysis,
      },
      hazardsIn.map((h) => ({
        title: h.title ?? "Untitled hazard",
        severity: normalizeRisk(h.severity),
        description: h.description ?? "",
        remediation: h.remediation ?? null,
        boundingArea: h.boundingArea ?? null,
        sourcePhotoObjectPath: objectPaths[h.photoIndex ?? 0] ?? objectPaths[0],
      })),
    );

    // Instant branded PDF report — generated synchronously so it's ready the
    // moment the scan-results screen loads, no manual export step.
    try {
      const reportObjectPath = await buildAndStoreScanPdf(
        { companyId: req.companyId!, userId: req.userId!, userDisplayName: req.userDisplayName },
        scan,
      );
      if (reportObjectPath) scan.reportObjectPath = reportObjectPath;
    } catch (err) {
      req.log?.error({ err, scanId: scan.id }, "Failed to generate safety scan PDF report");
    }

    // Best-effort COR audit trail entry — feeds the Shadow Auditor, auditor
    // portal, and audit packages. Never fails the request.
    try {
      await processSafetyScan(scan, scan.hazards, req.companyId!);
    } catch (err) {
      req.log?.error({ err, scanId: scan.id }, "Failed to write safety scan to COR audit trail");
    }

    res.status(201).json(scan);
  }),
);

// ── GET /safety/scans ────────────────────────────────────────────────────────

router.get(
  "/safety/scans",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const riskLevel = req.query.riskLevel as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
    const offset = parseInt((req.query.offset as string) || "0");
    const result = await listSafetyScans(req.companyId!, { projectId, riskLevel, limit, offset });
    res.json(result);
  }),
);

// ── GET /safety/scans/:id ─────────────────────────────────────────────────────

router.get(
  "/safety/scans/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");
    const scan = await getSafetyScan(req.companyId!, id);
    if (!scan) throw new NotFoundError("Safety scan not found");
    res.json(scan);
  }),
);

// ── DELETE /safety/scans/:id ──────────────────────────────────────────────────

router.delete(
  "/safety/scans/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");
    const scan = await getSafetyScan(req.companyId!, id);
    if (!scan) throw new NotFoundError("Safety scan not found");

    await deleteSafetyScan(req.companyId!, id);

    for (const objectPath of scan.photoObjectPaths as string[]) {
      objectStorageService.deleteObjectByPath(objectPath).catch((err) => {
        req.log?.warn({ err, objectPath, scanId: id }, "Failed to delete safety scan photo during scan deletion");
      });
    }
    if (scan.reportObjectPath) {
      objectStorageService.deleteObjectByPath(scan.reportObjectPath).catch((err) => {
        req.log?.warn({ err, objectPath: scan.reportObjectPath, scanId: id }, "Failed to delete safety scan report during scan deletion");
      });
    }

    logAuditEventFromRequest(
      req,
      "Safety Scan Deleted",
      `Deleted AI Safety Scan #${id}${scan.siteAddress ? ` (${scan.siteAddress})` : ""}`,
    ).catch(() => {});

    res.status(204).end();
  }),
);

// ── POST /safety/scans/:id/hazards/:hazardId/action ──────────────────────────

router.post(
  "/safety/scans/:id/hazards/:hazardId/action",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  asyncHandler(async (req, res) => {
    const scanId = parseInt(req.params.id as string);
    const hazardId = parseInt(req.params.hazardId as string);
    if (isNaN(scanId) || isNaN(hazardId)) throw new BadRequestError("Invalid ID");

    const parsed = CreateActionBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));

    const scan = await getSafetyScan(req.companyId!, scanId);
    if (!scan) throw new NotFoundError("Safety scan not found");
    const hazard = await getScanHazard(req.companyId!, scanId, hazardId);
    if (!hazard) throw new NotFoundError("Hazard not found");

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

    const { element } = classifyForElement(`${hazard.title} ${hazard.description}`);
    const ticket = await createCapaFromScanHazard(scan, hazard, req.userId!, { ...parsed.data, ihsaElement: element as any });
    res.status(201).json(ticket);
  }),
);

// ── POST /safety/scans/:id/sign ───────────────────────────────────────────────

router.post(
  "/safety/scans/:id/sign",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");
    const parsed = SignScanBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));

    const updated = await signSafetyScan(req.companyId!, id, parsed.data.role, parsed.data.signatureData, req.userId!);
    if (!updated) throw new NotFoundError("Safety scan not found");

    // Regenerate the PDF so the sign-off appears in the audit-ready document.
    const full = await getSafetyScan(req.companyId!, id);
    if (full) {
      try {
        await buildAndStoreScanPdf(
          { companyId: req.companyId!, userId: req.userId!, userDisplayName: req.userDisplayName },
          full,
        );
      } catch (err) {
        req.log?.error({ err, scanId: id }, "Failed to regenerate safety scan PDF after signature");
      }
    }

    res.json(updated);
  }),
);

// ── GET /safety/scans/:id/report ──────────────────────────────────────────────

router.get(
  "/safety/scans/:id/report",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("SAFETY_SCANNER"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid scan ID");
    const scan = await getSafetyScan(req.companyId!, id);
    if (!scan) throw new NotFoundError("Safety scan not found");

    let reportObjectPath = scan.reportObjectPath;
    if (!reportObjectPath) {
      reportObjectPath = await buildAndStoreScanPdf(
        { companyId: req.companyId!, userId: req.userId!, userDisplayName: req.userDisplayName },
        scan,
      );
      if (!reportObjectPath) throw new NotFoundError("Project not found");
    }

    const file = await objectStorageService.getObjectEntityFile(reportObjectPath);
    const [buf] = await file.download();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="safety-scan-${id}.pdf"`);
    res.send(buf);
  }),
);

export default router;
