import { Router } from "express";
import { z } from "zod";
import { extractJson, speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { requireFeature } from "../lib/featureGate";
import { canAccessProject, assertProjectInCompany } from "../lib/projectAccess";
import { BadRequestError, NotFoundError, ForbiddenError } from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission, ObjectAccessGroupType } from "../lib/objectAcl";
import {
  createVoiceInspection,
  listVoiceInspections,
  getVoiceInspection,
  createCapaFromVoiceInspection,
  updateVoiceInspectionProject,
} from "../repositories/voiceInspection";
import { processVoiceInspection } from "../services/cor/evidenceAggregator";

const router = Router();
const objectStorageService = new ObjectStorageService();

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const PASS_STATUSES = ["pass", "fail", "conditional"] as const;

// ── The user-approved system prompt, used verbatim ──────────────────────────

const SYSTEM_PROMPT = `You are SiteSnap's Safety & AI Inspection Assistant. Your role is to convert raw, spoken voice transcripts from field workers into structured, audit-ready Pre-Use Inspection Reports and Hazard Risk Assessments that comply with Certificate of Recognition (COR) safety standards.

---

### 1. INPUT PROCESSING
Analyze the worker's voice transcript and extract key safety details, even if spoken in casual, incomplete, or fragmented language.

### 2. REQUIRED OUTPUT STRUCTURE
Return a clean, structured JSON object containing the following key fields:

1. **equipment_or_area**: The specific equipment, tool, or area being inspected.
2. **inspection_type**: Categorize as (e.g., Pre-Use Check, Daily Inspection, Emergency/Hazard Incident, Maintenance Request).
3. **pass_status**: One of "pass", "fail", or "conditional". Mark "fail" or "conditional" if any critical hazards, defects, or fall risks are identified.
4. **hazard_summary**: A concise, clear summary suitable for standard safety logs.
5. **severity_level**: One of \`Low\`, \`Medium\`, \`High\`, or \`Critical\`.
   - *Critical/High*: Active fall hazards, structural failures, unguarded machinery, electrical dangers.
   - *Medium*: Wear and tear, missing non-vital labels, minor leaks.
   - *Low*: Minor cosmetic damage, routine maintenance notice.
6. **location_details**: Specific section, floor, or axis mentioned (e.g., "3rd Floor, North Face").
7. **immediate_action_required**: Flag \`true\` if immediate intervention or supervisor notification is needed.
8. **recommended_actions**: Array of standard corrective steps (e.g., "Tag out equipment", "Barricade area", "Notify site supervisor").

---

### 3. GUIDELINES & EDGE CASES
- **Clarification / Inference**: Infer standard safety terminology from colloquial phrasing (e.g., "loose guardrail" -> Fall Hazard / Guardrail Instability).
- **Conciseness**: Keep summaries punchy and clear so supervisors can skim them quickly on mobile.
- **Urgency Safeguard**: If keywords like "fall risk," "bare wire," "gas leak," or "brakes failing" appear, default \`severity_level\` to \`High\` or \`Critical\` and set \`immediate_action_required\` to \`true\`.

Return ONLY a JSON object with keys: equipment_or_area, inspection_type, pass_status, hazard_summary, severity_level, location_details, immediate_action_required, recommended_actions. No markdown, no extra text.`;

interface VoiceInspectionExtraction {
  equipment_or_area: string;
  inspection_type: string;
  pass_status: (typeof PASS_STATUSES)[number];
  hazard_summary: string;
  severity_level: (typeof RISK_LEVELS)[number];
  location_details: string;
  immediate_action_required: boolean;
  recommended_actions: string[];
}

const FALLBACK_EXTRACTION: VoiceInspectionExtraction = {
  equipment_or_area: "",
  inspection_type: "",
  pass_status: "conditional",
  hazard_summary: "Analysis complete — could not parse structured response.",
  severity_level: "low",
  location_details: "",
  immediate_action_required: false,
  recommended_actions: [],
};

function normalizeRisk(v: unknown): (typeof RISK_LEVELS)[number] {
  const s = String(v ?? "low").toLowerCase();
  return (RISK_LEVELS as readonly string[]).includes(s) ? (s as any) : "low";
}

function normalizePassStatus(v: unknown): (typeof PASS_STATUSES)[number] {
  const s = String(v ?? "conditional").toLowerCase();
  return (PASS_STATUSES as readonly string[]).includes(s) ? (s as any) : "conditional";
}

// ── Validation ───────────────────────────────────────────────────────────────

const GpsInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitude: z.number().nullable().optional(),
  accuracyM: z.number().nullable().optional(),
  capturedAtUtc: z.string(), // ISO timestamp
  timezone: z.string().optional(),
});

const CreateVoiceInspectionBody = z.object({
  projectId: z.number().int().positive(),
  audioObjectPath: z.string().min(1),
  audioDurationSeconds: z.number().int().positive().optional(),
  gps: GpsInput,
  siteAddress: z.string().max(500).optional(),
});

const CreateActionBody = z.object({
  assignedToUserId: z.number().int().positive().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  dueDate: z.string().max(10).optional(),
});

const UpdateVoiceInspectionBody = z.object({
  projectId: z.number().int().positive(),
});

// ── POST /voice-inspections ──────────────────────────────────────────────────

router.post(
  "/voice-inspections",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("VOICE_INSPECTION"),
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const parsed = CreateVoiceInspectionBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    const { projectId, audioObjectPath, audioDurationSeconds, gps, siteAddress } = parsed.data;

    const project = await assertProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");
    const allowed = await canAccessProject(req.companyId!, req.userId!, req.userRole!, projectId);
    if (!allowed) throw new ForbiddenError("No access to this project");

    // Evidence audio is already durably stored via the presigned-upload flow —
    // just lock down read access to company members (tamper-evident audit trail).
    await objectStorageService.trySetObjectEntityAclPolicy(audioObjectPath, {
      owner: String(req.userId!),
      visibility: "private",
      aclRules: [{ group: { type: ObjectAccessGroupType.COMPANY_MEMBER, id: String(req.companyId!) }, permission: ObjectPermission.READ }],
    });

    const audioFile = await objectStorageService.getObjectEntityFile(audioObjectPath);
    const [audioBuffer] = await audioFile.download();

    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);
    const transcript = (await speechToText(buffer, format)).trim();

    const extraction = await extractJson<VoiceInspectionExtraction>({
      systemPrompt: SYSTEM_PROMPT,
      prompt: `Transcript:\n\n${transcript || "(no speech detected)"}\n\nReturn ONLY the JSON object described in your instructions.`,
      jsonMode: true,
      maxTokens: 1024,
      fallback: FALLBACK_EXTRACTION,
    });

    const severityLevel = normalizeRisk(extraction.severity_level);
    const passStatus = normalizePassStatus(extraction.pass_status);
    const immediateActionRequired = !!extraction.immediate_action_required;
    const recommendedActions = Array.isArray(extraction.recommended_actions)
      ? extraction.recommended_actions
      : [];

    const inspection = await createVoiceInspection({
      companyId: req.companyId!,
      projectId,
      submittedByUserId: req.userId!,
      status: "complete",
      audioObjectPath,
      audioDurationSeconds,
      transcript,
      gpsLat: String(gps.lat),
      gpsLng: String(gps.lng),
      gpsAltitude: gps.altitude != null ? String(gps.altitude) : undefined,
      gpsAccuracyM: gps.accuracyM != null ? String(gps.accuracyM) : undefined,
      gpsCapturedAt: new Date(gps.capturedAtUtc),
      gpsTimezone: gps.timezone,
      siteAddress,
      equipmentOrArea: extraction.equipment_or_area || null,
      inspectionType: extraction.inspection_type || null,
      passStatus,
      hazardSummary: extraction.hazard_summary || null,
      severityLevel,
      locationDetails: extraction.location_details || null,
      immediateActionRequired,
      recommendedActions,
      aiRawResponse: extraction,
    });

    // Best-effort COR audit trail entry — feeds the Shadow Auditor, auditor
    // portal, and audit packages. Never fails the request.
    let ihsaElement: string | undefined;
    try {
      const result = await processVoiceInspection(inspection, req.companyId!);
      ihsaElement = result?.element;
    } catch (err) {
      req.log?.error({ err, inspectionId: inspection.id }, "Failed to write voice inspection to COR audit trail");
    }

    // Best-effort CAPA auto-creation — never fails the request.
    if ((severityLevel === "critical" || severityLevel === "high") && immediateActionRequired) {
      try {
        const ticket = await createCapaFromVoiceInspection(inspection, req.userId!, { ihsaElement: ihsaElement as any });
        inspection.capaTicketId = ticket.id;
      } catch (err) {
        req.log?.error({ err, inspectionId: inspection.id }, "Failed to auto-create CAPA ticket from voice inspection");
      }
    }

    res.status(201).json(inspection);
  }),
);

// ── GET /voice-inspections ───────────────────────────────────────────────────

router.get(
  "/voice-inspections",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("VOICE_INSPECTION"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const severityLevel = req.query.severityLevel as string | undefined;
    const passStatus = req.query.passStatus as string | undefined;
    const submittedByUserId = req.query.submittedByUserId ? parseInt(req.query.submittedByUserId as string) : undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
    const offset = parseInt((req.query.offset as string) || "0");
    const result = await listVoiceInspections(req.companyId!, {
      projectId,
      severityLevel,
      passStatus,
      submittedByUserId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    res.json(result);
  }),
);

// ── GET /voice-inspections/:id ────────────────────────────────────────────────

router.get(
  "/voice-inspections/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("VOICE_INSPECTION"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid inspection ID");
    const inspection = await getVoiceInspection(req.companyId!, id);
    if (!inspection) throw new NotFoundError("Voice inspection not found");
    res.json(inspection);
  }),
);

// ── PATCH /voice-inspections/:id ──────────────────────────────────────────────
// Reassign the project a voice inspection is attached to (e.g. AI/GPS picked the
// wrong project, or a supervisor is filing it under the correct site during review).

router.patch(
  "/voice-inspections/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("VOICE_INSPECTION"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid inspection ID");

    const parsed = UpdateVoiceInspectionBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));

    const existing = await getVoiceInspection(req.companyId!, id);
    if (!existing) throw new NotFoundError("Voice inspection not found");

    const project = await assertProjectInCompany(parsed.data.projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");
    const allowed = await canAccessProject(req.companyId!, req.userId!, req.userRole!, parsed.data.projectId);
    if (!allowed) throw new ForbiddenError("No access to this project");

    const updated = await updateVoiceInspectionProject(req.companyId!, id, parsed.data.projectId);
    if (!updated) throw new NotFoundError("Voice inspection not found");
    res.json(updated);
  }),
);

// ── POST /voice-inspections/:id/action ────────────────────────────────────────

router.post(
  "/voice-inspections/:id/action",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("VOICE_INSPECTION"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid inspection ID");

    const parsed = CreateActionBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));

    const inspection = await getVoiceInspection(req.companyId!, id);
    if (!inspection) throw new NotFoundError("Voice inspection not found");

    const ticket = await createCapaFromVoiceInspection(inspection, req.userId!, parsed.data);
    res.status(201).json(ticket);
  }),
);

export default router;
