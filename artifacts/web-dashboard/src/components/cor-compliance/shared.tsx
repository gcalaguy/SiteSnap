import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, Lock, XCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListProjects } from "@workspace/api-client-react";

// ── Colors ─────────────────────────────────────────────────────────────────────

export const GOLD = "#C9A84C";
export const BLACK = "#111111";

// ── IHSA / Credential constants ────────────────────────────────────────────────

export const IHSA_ELEMENTS: Record<string, string> = {
  element_1:  "Management Leadership",
  element_2:  "Hazard ID & Assessment",
  element_3:  "Hazard Control",
  element_4:  "Ongoing Inspections",
  element_5:  "Qualifications & Training",
  element_6:  "Emergency Response",
  element_7:  "Incident Reporting",
  element_8:  "Program Administration",
  element_9:  "Worker Participation",
  element_10: "Workplace Housekeeping",
  element_11: "Environmental Protection",
  element_12: "Safety Equipment & First Aid",
  element_13: "Fire Safety",
  element_14: "WHMIS & Controlled Products",
  element_15: "Contractor Management",
  element_16: "Medical Management",
  element_17: "Joint Health & Safety Committee",
  element_18: "Occupational Health",
  element_19: "Records & Statistics",
};

export const CREDENTIAL_LABELS: Record<string, string> = {
  working_at_heights:     "Working at Heights",
  whmis:                  "WHMIS",
  cor_training:           "COR Training",
  first_aid:              "First Aid",
  fall_protection:        "Fall Protection",
  confined_space:         "Confined Space",
  elevated_work_platform: "Elevated Work Platform",
};

export const CREDENTIAL_TYPES = Object.keys(CREDENTIAL_LABELS);

// ── Policy document constants ─────────────────────────────────────────────────

export type DocType = "swp" | "jha" | "company_rules" | "policy";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  swp:          "Safe Work Procedure",
  jha:          "Job Hazard Analysis",
  company_rules:"Company Rules",
  policy:       "Policy",
};

export const DOC_TYPE_IHSA_DEFAULT: Record<DocType, string> = {
  swp:          "element_3",
  jha:          "element_2",
  company_rules:"element_1",
  policy:       "element_5",
};

// ── Subcontractor constants ────────────────────────────────────────────────────

export type SubStatus = "compliant" | "non_compliant" | "expired" | "pending";
export type SubDocType = "wsib_clearance" | "safety_manual" | "insurance_certificate" | "health_safety_policy" | "cor_certificate" | "other";
export type SubDocStatus = "valid" | "expired" | "pending" | "rejected";

export const TRADE_TYPE_LABELS: Record<string, string> = {
  electrical: "Electrical", plumbing: "Plumbing", hvac: "HVAC",
  concrete: "Concrete", framing: "Framing", drywall: "Drywall",
  roofing: "Roofing", masonry: "Masonry", excavation: "Excavation",
  landscaping: "Landscaping", painting: "Painting", flooring: "Flooring",
  mechanical: "Mechanical", fire_protection: "Fire Protection",
  steel_erection: "Steel Erection", insulation: "Insulation",
  glazing: "Glazing", general: "General Labour", other: "Other",
};

export const SUB_STATUS_CFG: Record<SubStatus, { label: string; bg: string; text: string }> = {
  compliant:    { label: "Compliant",     bg: "#dcfce7", text: "#166534" },
  non_compliant:{ label: "Non-Compliant", bg: "#fee2e2", text: "#991b1b" },
  expired:      { label: "Expired",       bg: "#ffedd5", text: "#9a3412" },
  pending:      { label: "Pending",       bg: "#f3f4f6", text: "#374151" },
};

export const SUB_DOC_TYPE_LABELS: Record<SubDocType, string> = {
  wsib_clearance:       "WSIB Clearance Certificate",
  safety_manual:        "Company Safety Manual",
  insurance_certificate:"Liability Insurance Certificate",
  health_safety_policy: "Health & Safety Policy",
  cor_certificate:      "COR Certificate",
  other:                "Other Document",
};

export const SUB_DOC_REQUIRED: Record<SubDocType, boolean> = {
  wsib_clearance: true, insurance_certificate: true,
  safety_manual: false, health_safety_policy: false,
  cor_certificate: false, other: false,
};

export const SUB_DOC_STATUS_CFG: Record<SubDocStatus, { label: string; color: string }> = {
  valid:   { label: "Valid",    color: "#16a34a" },
  expired: { label: "Expired",  color: "#ea580c" },
  pending: { label: "Pending",  color: "#ca8a04" },
  rejected:{ label: "Rejected", color: "#dc2626" },
};

export const ALL_SUB_DOC_TYPES: SubDocType[] = [
  "wsib_clearance", "insurance_certificate", "safety_manual",
  "health_safety_policy", "cor_certificate", "other",
];

// ── CAPA constants ─────────────────────────────────────────────────────────────

export type CapaStatus = "open" | "in_progress" | "pending_review" | "closed" | "void";
export type CapaPriority = "critical" | "high" | "medium" | "low";

export const CAPA_STATUS_CFG: Record<CapaStatus, { label: string; bg: string; text: string }> = {
  open:           { label: "Open",           bg: "#fee2e2", text: "#991b1b" },
  in_progress:    { label: "In Progress",    bg: "#dbeafe", text: "#1e40af" },
  pending_review: { label: "Pending Review", bg: "#fef9c3", text: "#854d0e" },
  closed:         { label: "Closed",         bg: "#dcfce7", text: "#166534" },
  void:           { label: "Void",           bg: "#f4f4f5", text: "#71717a" },
};

export const CAPA_PRIORITY_CFG: Record<CapaPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#dc2626" },
  high:     { label: "High",     color: "#ea580c" },
  medium:   { label: "Medium",   color: "#ca8a04" },
  low:      { label: "Low",      color: "#16a34a" },
};

// ── Shared entity types (used across multiple tabs) ───────────────────────────

export interface Project { id: number; name: string }

export interface WorkerCredential {
  id: number;
  userId: number;
  credentialType: string;
  certificateNumber: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  status: string;
  issuedBy: string | null;
  notes: string | null;
}

export interface CompanyMember { id: number; firstName: string; lastName: string; email: string; role: string }

export interface PolicyDocument {
  id: number;
  documentType: DocType;
  title: string;
  description: string | null;
  fileUrl: string | null;
  contentText: string | null;
  ihsaElement: string;
  requiresAnnualRenewal: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Subcontractor {
  id: number;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tradeType: string;
  overallStatus: SubStatus;
  notes: string | null;
  invitedAt: string | null;
  lastReviewedAt: string | null;
  docs: SubcontractorDoc[];
}

export interface SubcontractorDoc {
  id: number;
  subcontractorId: number;
  docType: SubDocType;
  docStatus: SubDocStatus;
  documentUrl: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubSummary {
  total: number; compliant: number; expired: number; nonCompliant: number; pending: number;
}

export interface CapaTicket {
  id: number;
  companyId: number;
  projectId: number | null;
  title: string;
  description: string | null;
  sourceType: string;
  sourceRecordId: number | null;
  ihsaElement: string | null;
  priority: CapaPriority;
  status: CapaStatus;
  assignedToUserId: number | null;
  assignedToName: string | null;
  createdByName: string | null;
  dueDate: string | null;
  closedAt: string | null;
  closureNotes: string | null;
  evidencePhotoUrl: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRequiredCapa extends CapaTicket {
  inspectionType: string | null;
  inspectionDate: string | null;
  projectName: string | null;
  sourceItemRef: string | null;
}

export interface CapaListResponse { data: CapaTicket[]; total: number }
export interface CapaSummary { open: number; inProgress: number; pendingReview: number; closed: number; overdue: number }

export interface ExpiringCredential {
  credentialId: number;
  userId: number;
  credentialType: string;
  expirationDate: string;
  daysRemaining: number;
  alertWindow: "30_day" | "60_day" | "expired" | "ok";
  workerFirstName: string;
  workerLastName: string;
  workerEmail: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

export function credDotColor(status: string, expirationDate: string | null) {
  if (status === "revoked" || status === "expired") return "#dc2626";
  if (expirationDate) {
    const days = (new Date(expirationDate).getTime() - Date.now()) / 86_400_000;
    if (days < 30) return "#ca8a04";
  }
  if (status === "active") return "#16a34a";
  return "#94a3b8";
}

// useListProjects always returns a plain array (Project[] | undefined) — no
// wrapper object shape — so this needs no defensive `any` casting.
export function useProjects(): Project[] {
  const { data } = useListProjects();
  return data ?? [];
}

// ── Small shared presentational components ────────────────────────────────────

export function ScoreGauge({ score, size = 96 }: { score: number; size?: number }) {
  const color = scoreColor(score);
  const cx = size / 2, cy = size / 2;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.24} fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold tabular-nums w-8" style={{ color }}>{score}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#2a2a2a" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export function FindingPill({ type }: { type: "pass" | "fail" }) {
  return type === "pass"
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#14532d33", color: "#4ade80" }}><CheckCircle2 className="h-3 w-3" />Pass</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#7f1d1d33", color: "#f87171" }}><AlertTriangle className="h-3 w-3" />Fail</span>;
}

export function CredStatusBadge({ status, expirationDate }: { status: string; expirationDate: string | null }) {
  const color = credDotColor(status, expirationDate);
  let label = status.charAt(0).toUpperCase() + status.slice(1);
  if (status === "active" && expirationDate) {
    label = `Active · exp ${format(new Date(expirationDate), "MMM d, yy")}`;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-sm" style={{ color: "#f87171" }}>
      <XCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function ProjectSelect({ value, onChange, placeholder = "Select project…" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const projects = useProjects();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-56" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
        {projects.map((p) => (
          <SelectItem key={p.id} value={String(p.id)} style={{ color: "#e5e5e5" }}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SignoffComplianceBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {pct}%
    </span>
  );
}

export function CapaStatusBadge({ status }: { status: CapaStatus }) {
  const cfg = CAPA_STATUS_CFG[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}>
      {status === "closed" && <Lock className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

export function CapaPriorityBadge({ priority }: { priority: CapaPriority }) {
  const cfg = CAPA_PRIORITY_CFG[priority];
  return (
    <span className="inline-flex items-center text-xs font-bold" style={{ color: cfg.color }}>
      ● {cfg.label}
    </span>
  );
}

export function SubStatusBadge({ status }: { status: SubStatus }) {
  const cfg = SUB_STATUS_CFG[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}>
      {status === "compliant" && <CheckCircle2 className="h-3 w-3" />}
      {status === "expired" && <Clock className="h-3 w-3" />}
      {(status === "non_compliant" || status === "pending") && <AlertTriangle className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}
