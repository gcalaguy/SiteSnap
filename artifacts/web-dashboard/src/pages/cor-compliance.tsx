import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe, useListProjects } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  BadgeCheck, Mic,
  AlertTriangle, CheckCircle2, Clock, Plus, Loader2,
  ClipboardList, Activity, XCircle, Download, Package, ShieldCheck,
  FileText, PenLine, ChevronDown, ChevronUp, Users, BarChart3,
  Building2, HardHat, FileCheck, ExternalLink, Pencil, Trash2,
  Wrench, Lock, ChevronRight, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// ── Constants ──────────────────────────────────────────────────────────────────

const GOLD = "#C9A84C";
const BLACK = "#111111";

const IHSA_ELEMENTS: Record<string, string> = {
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
};

const CREDENTIAL_LABELS: Record<string, string> = {
  working_at_heights:     "Working at Heights",
  whmis:                  "WHMIS",
  cor_training:           "COR Training",
  first_aid:              "First Aid",
  fall_protection:        "Fall Protection",
  confined_space:         "Confined Space",
  elevated_work_platform: "Elevated Work Platform",
};

const CREDENTIAL_TYPES = Object.keys(CREDENTIAL_LABELS);

const RISK_CFG = {
  critical: { label: "Critical", bg: "#fee2e2", text: "#991b1b" },
  high:     { label: "High",     bg: "#ffedd5", text: "#9a3412" },
  medium:   { label: "Medium",   bg: "#fef9c3", text: "#854d0e" },
  low:      { label: "Low",      bg: "#dcfce7", text: "#166534" },
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Project { id: number; name: string }

interface ElementScore {
  ihsaElement: string;
  ihsaElementName: string;
  averageScore: number;
  entryCount: number;
  failCount: number;
}

interface CorFinding {
  id: number;
  ihsaElement: string;
  ihsaElementName: string;
  sourceType: string;
  findingType: "pass" | "fail";
  findingDescription: string;
  complianceScore: number;
  createdAt: string;
}

interface CorDashboard {
  project: { id: number; name: string };
  overallScore: number;
  totalEntries: number;
  scoreByElement: ElementScore[];
  recentFindings: CorFinding[];
}

interface AuditTrailEntry {
  id: number;
  sourceType: string;
  sourceRecordId: number;
  ihsaElement: string;
  ihsaElementName: string;
  findingType: "pass" | "fail";
  findingDescription: string;
  complianceScore: number;
  createdAt: string;
}

interface AuditTrailResponse { data: AuditTrailEntry[]; total: number }

interface WorkerCredential {
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

interface CredentialMatrixWorker {
  user: { id: number; firstName: string; lastName: string; email: string };
  credentials: WorkerCredential[];
}

interface VoiceLog {
  id: number;
  projectId: number;
  rawTranscript: string;
  riskLevel: keyof typeof RISK_CFG;
  ihsaElement: string | null;
  dueDate: string | null;
  createdAt: string;
  correctedTaskId: number | null;
}

interface UpsertCredentialForm {
  certificateNumber: string;
  issueDate: string;
  expirationDate: string;
  status: string;
  issuedBy: string;
  notes: string;
}

interface PackageElementSummary {
  element: string;
  name: string;
  score: number;
  totalEntries: number;
  failCount: number;
  passCount: number;
}

// ── Policy document / sign-off types ─────────────────────────────────────────

type DocType = "swp" | "jha" | "company_rules" | "policy";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  swp:          "Safe Work Procedure",
  jha:          "Job Hazard Analysis",
  company_rules:"Company Rules",
  policy:       "Policy",
};

const DOC_TYPE_IHSA_DEFAULT: Record<DocType, string> = {
  swp:          "element_3",
  jha:          "element_2",
  company_rules:"element_1",
  policy:       "element_5",
};

interface PolicyDocument {
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

interface PolicySignoff {
  id: number;
  policyDocumentId: number;
  workerUserId: number;
  signedAt: string;
  isValid: boolean;
}

interface SignoffWorkerEntry {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  signedAt: string | null;
  isValid: boolean | null;
}

interface SignoffMatrixEntry {
  document: PolicyDocument;
  signoffs: SignoffWorkerEntry[];
  signedCount: number;
  totalWorkers: number;
  compliancePercent: number;
}

interface MySignoffEntry {
  signoff: PolicySignoff;
  document: PolicyDocument;
}

interface AuditPackage {
  id: number;
  label: string;
  status: "generating" | "ready" | "failed";
  periodStart: string | null;
  periodEnd: string | null;
  fileSizeBytes: number | null;
  totalEntries: number;
  totalInspections: number;
  totalWorkers: number;
  checksum: string | null;
  elementSummary: PackageElementSummary[] | null;
  generatedAt: string | null;
  createdAt: string;
  generatedByFirst: string | null;
  generatedByLast: string | null;
}

// ── Subcontractor types ───────────────────────────────────────────────────────

type SubStatus = "compliant" | "non_compliant" | "expired" | "pending";
type SubDocType = "wsib_clearance" | "safety_manual" | "insurance_certificate" | "health_safety_policy" | "cor_certificate" | "other";
type SubDocStatus = "valid" | "expired" | "pending" | "rejected";

const TRADE_TYPE_LABELS: Record<string, string> = {
  electrical: "Electrical", plumbing: "Plumbing", hvac: "HVAC",
  concrete: "Concrete", framing: "Framing", drywall: "Drywall",
  roofing: "Roofing", masonry: "Masonry", excavation: "Excavation",
  landscaping: "Landscaping", painting: "Painting", flooring: "Flooring",
  mechanical: "Mechanical", fire_protection: "Fire Protection",
  steel_erection: "Steel Erection", insulation: "Insulation",
  glazing: "Glazing", general: "General Labour", other: "Other",
};

const SUB_STATUS_CFG: Record<SubStatus, { label: string; bg: string; text: string }> = {
  compliant:    { label: "Compliant",     bg: "#dcfce7", text: "#166534" },
  non_compliant:{ label: "Non-Compliant", bg: "#fee2e2", text: "#991b1b" },
  expired:      { label: "Expired",       bg: "#ffedd5", text: "#9a3412" },
  pending:      { label: "Pending",       bg: "#f3f4f6", text: "#374151" },
};

const SUB_DOC_TYPE_LABELS: Record<SubDocType, string> = {
  wsib_clearance:       "WSIB Clearance Certificate",
  safety_manual:        "Company Safety Manual",
  insurance_certificate:"Liability Insurance Certificate",
  health_safety_policy: "Health & Safety Policy",
  cor_certificate:      "COR Certificate",
  other:                "Other Document",
};

const SUB_DOC_REQUIRED: Record<SubDocType, boolean> = {
  wsib_clearance: true, insurance_certificate: true,
  safety_manual: false, health_safety_policy: false,
  cor_certificate: false, other: false,
};

const SUB_DOC_STATUS_CFG: Record<SubDocStatus, { label: string; color: string }> = {
  valid:   { label: "Valid",    color: "#16a34a" },
  expired: { label: "Expired",  color: "#ea580c" },
  pending: { label: "Pending",  color: "#ca8a04" },
  rejected:{ label: "Rejected", color: "#dc2626" },
};

const ALL_SUB_DOC_TYPES: SubDocType[] = [
  "wsib_clearance", "insurance_certificate", "safety_manual",
  "health_safety_policy", "cor_certificate", "other",
];

interface SubcontractorDoc {
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

interface Subcontractor {
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

interface SubSummary {
  total: number; compliant: number; expired: number; nonCompliant: number; pending: number;
}

// ── CAPA types ────────────────────────────────────────────────────────────────

type CapaStatus = "open" | "in_progress" | "pending_review" | "closed" | "void";
type CapaPriority = "critical" | "high" | "medium" | "low";

interface CapaTicket {
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

interface CapaListResponse { data: CapaTicket[]; total: number }
interface CapaSummary { open: number; inProgress: number; pendingReview: number; closed: number; overdue: number }

interface ActionRequiredCapa extends CapaTicket {
  inspectionType: string | null;
  inspectionDate: string | null;
  projectName: string | null;
  sourceItemRef: string | null;
}

interface CompanyMember { id: number; firstName: string; lastName: string; email: string; role: string }

const CAPA_STATUS_CFG: Record<CapaStatus, { label: string; bg: string; text: string }> = {
  open:           { label: "Open",           bg: "#fee2e2", text: "#991b1b" },
  in_progress:    { label: "In Progress",    bg: "#dbeafe", text: "#1e40af" },
  pending_review: { label: "Pending Review", bg: "#fef9c3", text: "#854d0e" },
  closed:         { label: "Closed",         bg: "#dcfce7", text: "#166534" },
  void:           { label: "Void",           bg: "#f4f4f5", text: "#71717a" },
};

const CAPA_PRIORITY_CFG: Record<CapaPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#dc2626" },
  high:     { label: "High",     color: "#ea580c" },
  medium:   { label: "Medium",   color: "#ca8a04" },
  low:      { label: "Low",      color: "#16a34a" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

function credDotColor(status: string, expirationDate: string | null) {
  if (status === "revoked" || status === "expired") return "#dc2626";
  if (expirationDate) {
    const days = (new Date(expirationDate).getTime() - Date.now()) / 86_400_000;
    if (days < 30) return "#ca8a04";
  }
  if (status === "active") return "#16a34a";
  return "#94a3b8";
}

function useProjects() {
  const { data } = useListProjects();
  return ((data as any)?.projects ?? (Array.isArray(data) ? data : [])) as Project[];
}

// ── Small shared components ────────────────────────────────────────────────────

function ScoreGauge({ score, size = 96 }: { score: number; size?: number }) {
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

function ScoreBar({ score }: { score: number }) {
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

function FindingPill({ type }: { type: "pass" | "fail" }) {
  return type === "pass"
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#14532d33", color: "#4ade80" }}><CheckCircle2 className="h-3 w-3" />Pass</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#7f1d1d33", color: "#f87171" }}><AlertTriangle className="h-3 w-3" />Fail</span>;
}

function RiskPill({ level }: { level: string }) {
  const cfg = RISK_CFG[level as keyof typeof RISK_CFG] ?? RISK_CFG.low;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold" style={{ color: cfg.text, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

function CredStatusBadge({ status, expirationDate }: { status: string; expirationDate: string | null }) {
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-sm" style={{ color: "#f87171" }}>
      <XCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function ProjectSelect({ value, onChange, placeholder = "Select project…" }: {
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

// ── Audit Package: download helper ────────────────────────────────────────────

async function downloadAuditPackage(body: {
  label?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<void> {
  const response = await fetch("/api/cor/audit-package/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error((err as any)?.message ?? `Generation failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `COR_Audit_Package_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Audit Package: generation dialog ─────────────────────────────────────────

function GenerateAuditPackageDialog({
  open, onClose, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const defaultLabel = `COR Audit Package — ${today}`;

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await downloadAuditPackage({
        label: label.trim() || defaultLabel,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      });
      toast({ title: "Audit package downloaded", description: "Your digital binder has been compiled and downloaded." });
      onSuccess();
      onClose();
    } catch (err) {
      toast({ title: "Generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v && !isGenerating) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
            <Package className="h-5 w-5" style={{ color: GOLD }} />
            Generate COR Audit Package
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-zinc-400 leading-relaxed" style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 12 }}>
            Compiles all audit trail evidence, inspections, voice observations, and training matrices
            into a structured ZIP binder organized by all 14 IHSA elements — ready for external auditor review.
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Package Label</Label>
            <Input
              placeholder={defaultLabel}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">Evidence From (optional)</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">Evidence To (optional)</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
              />
            </div>
          </div>

          <div className="rounded-lg p-3 text-xs text-zinc-500 space-y-1" style={{ background: "#ffffff08" }}>
            <p className="font-semibold text-zinc-400">What's included:</p>
            <p>• All 14 IHSA element folders with audit entries, CSV + JSON</p>
            <p>• Full inspection history with per-item breakdown</p>
            <p>• Voice observation log mapped to elements</p>
            <p>• Worker credential matrix & deployment eligibility</p>
            <p>• SHA-256 tamper-evident chain log for auditor verification</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isGenerating} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Compiling…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Generate & Download</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Audit Package: history card ───────────────────────────────────────────────

function PackageHistoryCard({ onGenerate }: { onGenerate: () => void }) {
  const packagesQuery = useQuery<AuditPackage[]>({
    queryKey: ["cor-audit-packages"],
    queryFn: () => customFetch("/api/cor/audit-packages"),
    retry: 1,
  });

  const packages = packagesQuery.data ?? [];

  function overallScore(pkg: AuditPackage): number {
    if (!pkg.elementSummary?.length) return 0;
    return Math.round(pkg.elementSummary.reduce((s, e) => s + e.score, 0) / pkg.elementSummary.length);
  }

  function fmtBytes(b: number | null): string {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            Audit Package History
          </CardTitle>
          <Button size="sm" onClick={onGenerate} style={{ background: GOLD, color: BLACK, height: 30, fontSize: 12 }}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            New Package
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {packagesQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
        {packagesQuery.isError && <ErrorState message="Could not load package history." />}

        {!packagesQuery.isLoading && packages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
            <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No packages generated yet.</p>
            <p className="text-xs mt-1">Click "New Package" to generate your first COR audit binder.</p>
          </div>
        )}

        {packages.length > 0 && (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="flex items-start gap-4 p-3 rounded-lg" style={{ background: "#ffffff06" }}>
                <div className="shrink-0 mt-0.5">
                  {pkg.status === "ready"
                    ? <Package className="h-5 w-5" style={{ color: GOLD }} />
                    : pkg.status === "failed"
                    ? <XCircle className="h-5 w-5 text-red-400" />
                    : <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200 truncate">{pkg.label}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-zinc-500">
                      {pkg.generatedAt ? format(new Date(pkg.generatedAt), "MMM d, yyyy · h:mm a") : "Pending…"}
                    </span>
                    {pkg.status === "ready" && (
                      <>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs" style={{ color: scoreColor(overallScore(pkg)) }}>
                          {overallScore(pkg)}% overall
                        </span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">{pkg.totalEntries} entries</span>
                        {pkg.fileSizeBytes && (
                          <>
                            <span className="text-xs text-zinc-600">·</span>
                            <span className="text-xs text-zinc-500">{fmtBytes(pkg.fileSizeBytes)}</span>
                          </>
                        )}
                      </>
                    )}
                    {pkg.status === "failed" && (
                      <span className="text-xs text-red-400">Generation failed — try again</span>
                    )}
                  </div>
                  {pkg.checksum && (
                    <p className="text-[10px] font-mono text-zinc-700 mt-1 truncate">
                      SHA-256: {pkg.checksum}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {pkg.status === "ready" && (
                    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded" style={{ background: "#14532d33", color: "#4ade80" }}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />Ready
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ isAdmin, userId, onGeneratePackage }: {
  isAdmin: boolean;
  userId: number | undefined;
  onGeneratePackage: () => void;
}) {
  const [projectId, setProjectId] = useState("");

  const dashQuery = useQuery<CorDashboard>({
    queryKey: ["cor-dashboard", projectId],
    queryFn: () => customFetch(`/api/cor/projects/${projectId}/dashboard`),
    enabled: isAdmin && !!projectId,
    retry: 1,
  });

  const credQuery = useQuery<WorkerCredential[]>({
    queryKey: ["cor-credentials-self", userId],
    queryFn: () => customFetch(`/api/cor/credentials/${userId}`),
    enabled: !!userId,
    retry: 1,
  });

  const flaggedSubsQuery = useQuery<{ flagged: Subcontractor[] }>({
    queryKey: ["cor-subcontractors-flagged"],
    queryFn: () => customFetch("/api/cor/subcontractors/flagged"),
    enabled: isAdmin,
    retry: 1,
  });

  const flaggedSubs = flaggedSubsQuery.data?.flagged ?? [];

  return (
    <div className="space-y-5">
      {isAdmin && <ActionRequiredPanel />}

      {isAdmin && flaggedSubs.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-900/40 bg-red-950/30">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              {flaggedSubs.length} subcontractor{flaggedSubs.length !== 1 ? "s" : ""} flagged — compliance action required
            </p>
            <p className="text-xs text-red-400 mt-0.5">
              {flaggedSubs.filter((s) => s.overallStatus === "expired").map((s) => s.companyName).join(", ")}
              {flaggedSubs.filter((s) => s.overallStatus === "non_compliant").length > 0 && (
                flaggedSubs.filter((s) => s.overallStatus === "expired").length > 0 ? " (expired); " : ""
              )}
              {flaggedSubs.filter((s) => s.overallStatus === "non_compliant").map((s) => s.companyName).join(", ")}
              {flaggedSubs.filter((s) => s.overallStatus === "non_compliant").length > 0 ? " (non-compliant)" : ""}
            </p>
          </div>
        </div>
      )}
      {isAdmin && (
        <>
          <div className="flex items-center gap-3">
            <ProjectSelect value={projectId} onChange={setProjectId} />
            {dashQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>

          {!projectId && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <Activity className="h-9 w-9 mb-2 opacity-30" />
              <p className="text-sm">Select a project to view its COR score</p>
            </div>
          )}

          {projectId && dashQuery.isError && (
            <ErrorState message="Could not load COR dashboard. Check that the project exists and try again." />
          )}

          {projectId && dashQuery.isLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" style={{ background: "#1a1a1a" }} />)}
            </div>
          )}

          {projectId && dashQuery.data && (() => {
            const d = dashQuery.data;
            return (
              <div className="space-y-4">
                <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-6">
                      <ScoreGauge score={d.overallScore} size={100} />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: GOLD }}>
                          Overall COR Score — {d.project.name}
                        </p>
                        <p className="text-2xl font-bold" style={{ color: scoreColor(d.overallScore) }}>
                          {d.overallScore >= 80 ? "Compliant" : d.overallScore >= 60 ? "Needs Attention" : "Non-Compliant"}
                        </p>
                        <p className="text-sm text-zinc-500 mt-1">
                          {d.totalEntries} evidence entries · {d.scoreByElement.length} IHSA elements tracked
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                        IHSA Element Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {d.scoreByElement.length === 0
                        ? <p className="text-sm text-zinc-600 italic">No evidence recorded yet.</p>
                        : d.scoreByElement.map((el) => (
                          <div key={el.ihsaElement} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-300 font-medium truncate pr-2">{el.ihsaElementName}</span>
                              <span className="text-zinc-500 shrink-0">{el.failCount} fail / {el.entryCount}</span>
                            </div>
                            <ScoreBar score={el.averageScore} />
                          </div>
                        ))}
                    </CardContent>
                  </Card>

                  <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                        Recent Findings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {d.recentFindings.length === 0
                        ? <p className="text-sm text-zinc-600 italic">No findings yet.</p>
                        : d.recentFindings.slice(0, 6).map((f) => (
                          <div key={f.id} className="flex items-start gap-3 pb-3 last:pb-0" style={{ borderBottom: "1px solid #1f1f1f" }}>
                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0`}
                              style={{ background: f.findingType === "fail" ? "#ef4444" : "#22c55e" }} />
                            <div className="min-w-0">
                              <p className="text-sm text-zinc-200 line-clamp-2">{f.findingDescription}</p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {f.ihsaElementName} · {format(new Date(f.createdAt), "MMM d")}
                              </p>
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* All roles: own credentials */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            My Training Credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          {credQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
          {credQuery.isError && <ErrorState message="Could not load credentials." />}
          {credQuery.data && credQuery.data.length === 0 && (
            <p className="text-sm text-zinc-600 italic">No credentials on file yet.</p>
          )}
          {credQuery.data && credQuery.data.length > 0 && (
            <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
              {credQuery.data.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {CREDENTIAL_LABELS[cred.credentialType] ?? cred.credentialType}
                    </p>
                    {cred.certificateNumber && <p className="text-xs text-zinc-500">Cert #{cred.certificateNumber}</p>}
                  </div>
                  <CredStatusBadge status={cred.status} expirationDate={cred.expirationDate} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin only: Audit Package History */}
      {isAdmin && (
        <PackageHistoryCard
          onGenerate={onGeneratePackage}
        />
      )}
    </div>
  );
}

// ── Tab: Audit Trail ──────────────────────────────────────────────────────────

function AuditTrailTab() {
  const [projectId, setProjectId] = useState("");
  const [element, setElement] = useState("all");
  const [findingType, setFindingType] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (element !== "all") params.set("element", element);
  if (findingType !== "all") params.set("findingType", findingType);

  const query = useQuery<AuditTrailResponse>({
    queryKey: ["cor-audit-trail", projectId, element, findingType, page],
    queryFn: () => customFetch(`/api/cor/projects/${projectId}/audit-trail?${params}`),
    enabled: !!projectId,
    retry: 1,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ProjectSelect value={projectId} onChange={(v) => { setProjectId(v); setPage(0); }} />

        <Select value={element} onValueChange={(v) => { setElement(v); setPage(0); }}>
          <SelectTrigger className="w-52" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue placeholder="All Elements" />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All Elements</SelectItem>
            {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
              <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={findingType} onValueChange={(v) => { setFindingType(v); setPage(0); }}>
          <SelectTrigger className="w-36" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all" style={{ color: "#e5e5e5" }}>All Findings</SelectItem>
            <SelectItem value="pass" style={{ color: "#e5e5e5" }}>Pass Only</SelectItem>
            <SelectItem value="fail" style={{ color: "#e5e5e5" }}>Fail Only</SelectItem>
          </SelectContent>
        </Select>

        {query.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {!projectId && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <ClipboardList className="h-9 w-9 mb-2 opacity-30" />
          <p className="text-sm">Select a project to view its audit trail</p>
        </div>
      )}

      {projectId && query.isError && <ErrorState message="Could not load audit trail." />}

      {projectId && query.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" style={{ background: "#1a1a1a" }} />)}
        </div>
      )}

      {projectId && query.data && (
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                  {["Date", "Source", "IHSA Element", "Finding", "Score", "Description"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-600 text-sm italic">No entries for the selected filters.</td></tr>
                )}
                {query.data.data.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">{format(new Date(entry.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ background: "#ffffff10", color: "#a1a1aa" }}>
                        {entry.sourceType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{entry.ihsaElementName}</td>
                    <td className="px-4 py-3"><FindingPill type={entry.findingType} /></td>
                    <td className="px-4 py-3">
                      <span className="font-bold" style={{ color: scoreColor(entry.complianceScore) }}>{entry.complianceScore}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 max-w-xs">
                      <p className="truncate">{entry.findingDescription}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {query.data.total > limit && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #1f1f1f" }}>
              <p className="text-xs text-zinc-500">
                {page * limit + 1}–{Math.min((page + 1) * limit, query.data.total)} of {query.data.total}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * limit >= query.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Tab: Credentials ──────────────────────────────────────────────────────────

function CredentialsTab({ isAdmin, userId }: { isAdmin: boolean; userId: number | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const matrixQuery = useQuery<{ workers: CredentialMatrixWorker[] }>({
    queryKey: ["cor-credential-matrix"],
    queryFn: () => customFetch("/api/cor/credentials"),
    enabled: isAdmin,
    retry: 1,
  });

  const myCredsQuery = useQuery<WorkerCredential[]>({
    queryKey: ["cor-credentials-self", userId],
    queryFn: () => customFetch(`/api/cor/credentials/${userId}`),
    enabled: !isAdmin && !!userId,
    retry: 1,
  });

  const [editTarget, setEditTarget] = useState<{ userId: number; credentialType: string; existing?: WorkerCredential } | null>(null);
  const [form, setForm] = useState<UpsertCredentialForm>({ certificateNumber: "", issueDate: "", expirationDate: "", status: "active", issuedBy: "", notes: "" });

  function openEdit(uid: number, credType: string, existing?: WorkerCredential) {
    setEditTarget({ userId: uid, credentialType: credType, existing });
    setForm({
      certificateNumber: existing?.certificateNumber ?? "",
      issueDate: existing?.issueDate ?? "",
      expirationDate: existing?.expirationDate ?? "",
      status: existing?.status ?? "active",
      issuedBy: existing?.issuedBy ?? "",
      notes: existing?.notes ?? "",
    });
  }

  const upsertMutation = useMutation({
    mutationFn: ({ uid, credType, body }: { uid: number; credType: string; body: Record<string, string> }) =>
      customFetch(`/api/cor/credentials/${uid}/${credType}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Credential saved" });
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["cor-credential-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["cor-credentials-self", userId] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const [checkUserId, setCheckUserId] = useState("");
  const [eligibility, setEligibility] = useState<{ eligible: boolean; blocks: any[]; warnings: any[] } | null>(null);

  const checkMutation = useMutation({
    mutationFn: (uid: number) =>
      customFetch<{ eligible: boolean; blocks: any[]; warnings: any[] }>("/api/cor/credentials/check", {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      }),
    onSuccess: (data) => setEligibility(data),
    onError: () => toast({ title: "Eligibility check failed", variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader><CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>My Training Credentials</CardTitle></CardHeader>
        <CardContent>
          {myCredsQuery.isLoading && <Skeleton className="h-32 rounded-lg" style={{ background: "#1a1a1a" }} />}
          {myCredsQuery.isError && <ErrorState message="Could not load credentials." />}
          {myCredsQuery.data?.length === 0 && <p className="text-sm text-zinc-600 italic">No credentials on file yet.</p>}
          <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
            {myCredsQuery.data?.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{CREDENTIAL_LABELS[cred.credentialType] ?? cred.credentialType}</p>
                  {cred.certificateNumber && <p className="text-xs text-zinc-500">Cert #{cred.certificateNumber}</p>}
                  {cred.issuedBy && <p className="text-xs text-zinc-500">Issued by {cred.issuedBy}</p>}
                </div>
                <CredStatusBadge status={cred.status} expirationDate={cred.expirationDate} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const workers = matrixQuery.data?.workers ?? [];

  return (
    <div className="space-y-5">
      {/* Eligibility checker */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Deployment Eligibility Check</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Select value={checkUserId} onValueChange={(v) => { setCheckUserId(v); setEligibility(null); }}>
              <SelectTrigger className="w-56" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                <SelectValue placeholder="Select worker…" />
              </SelectTrigger>
              <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                {workers.map((w) => (
                  <SelectItem key={w.user.id} value={String(w.user.id)} style={{ color: "#e5e5e5" }}>
                    {w.user.firstName} {w.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline"
              disabled={!checkUserId || checkMutation.isPending}
              onClick={() => checkMutation.mutate(Number(checkUserId))}>
              {checkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
            </Button>
          </div>

          {matrixQuery.isLoading && !workers.length && (
            <p className="text-xs text-zinc-600">Loading team list…</p>
          )}
          {matrixQuery.isError && <ErrorState message="Could not load worker list." />}

          {eligibility && (
            <div className="rounded-lg p-4 text-sm" style={{
              background: eligibility.eligible ? "#14532d20" : "#7f1d1d20",
              border: `1px solid ${eligibility.eligible ? "#14532d60" : "#7f1d1d60"}`,
            }}>
              <div className="flex items-center gap-2 font-semibold mb-2" style={{ color: eligibility.eligible ? "#4ade80" : "#f87171" }}>
                {eligibility.eligible ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {eligibility.eligible ? "Eligible for deployment" : "Deployment blocked"}
              </div>
              {eligibility.blocks.map((b: any, i: number) => (
                <p key={i} className="text-xs" style={{ color: "#f87171" }}>
                  Block: {CREDENTIAL_LABELS[b.credentialType] ?? b.credentialType} — {b.reason}
                </p>
              ))}
              {eligibility.warnings.map((w: any, i: number) => (
                <p key={i} className="text-xs" style={{ color: "#fbbf24" }}>
                  Warning: {CREDENTIAL_LABELS[w.credentialType] ?? w.credentialType} expires in {w.daysUntilExpiry} days
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training matrix */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Training Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {matrixQuery.isLoading && (
            <div className="p-4 space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12" style={{ background: "#1a1a1a" }} />)}</div>
          )}
          {matrixQuery.isError && <div className="p-4"><ErrorState message="Could not load training matrix." /></div>}

          {matrixQuery.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-max">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">Worker</th>
                    {CREDENTIAL_TYPES.map((ct) => (
                      <th key={ct} className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 whitespace-nowrap min-w-[130px]">
                        {CREDENTIAL_LABELS[ct]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 && (
                    <tr><td colSpan={CREDENTIAL_TYPES.length + 1} className="px-4 py-10 text-center text-zinc-600 text-sm italic">No team members found.</td></tr>
                  )}
                  {workers.map((worker) => (
                    <tr key={worker.user.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium text-zinc-200">{worker.user.firstName} {worker.user.lastName}</p>
                        <p className="text-xs text-zinc-500">{worker.user.email}</p>
                      </td>
                      {CREDENTIAL_TYPES.map((ct) => {
                        const cred = worker.credentials.find((c) => c.credentialType === ct);
                        return (
                          <td key={ct} className="px-3 py-3">
                            <button className="text-left w-full hover:opacity-70 transition-opacity"
                              onClick={() => openEdit(worker.user.id, ct, cred)}>
                              {cred
                                ? <CredStatusBadge status={cred.status} expirationDate={cred.expirationDate} />
                                : <span className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300">
                                    <Plus className="h-3 w-3" />Add
                                  </span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upsert dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }}>
              {editTarget?.existing ? "Update" : "Add"} Credential — {CREDENTIAL_LABELS[editTarget?.credentialType ?? ""] ?? editTarget?.credentialType}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(["certificateNumber", "issueDate", "expirationDate", "issuedBy"] as const).map((field) => (
              <div key={field}>
                <Label className="text-xs text-zinc-400 mb-1 block capitalize">
                  {field.replace(/([A-Z])/g, " $1")}
                </Label>
                <Input
                  type={field.includes("Date") ? "date" : "text"}
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
                />
              </div>
            ))}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {["active", "expired", "pending", "revoked"].map((s) => (
                    <SelectItem key={s} value={s} style={{ color: "#e5e5e5" }} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} className="text-zinc-400">Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }} disabled={upsertMutation.isPending}
              onClick={() => {
                if (!editTarget) return;
                const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
                upsertMutation.mutate({ uid: editTarget.userId, credType: editTarget.credentialType, body });
              }}>
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tab: Voice Logs ───────────────────────────────────────────────────────────

function VoiceLogsTab({ isAdmin, userId }: { isAdmin: boolean; userId: number | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projects = useProjects();

  const [adminProjectId, setAdminProjectId] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitProjectId, setSubmitProjectId] = useState("");
  const [transcript, setTranscript] = useState("");

  const adminLogsQuery = useQuery<VoiceLog[]>({
    queryKey: ["cor-voice-logs-project", adminProjectId],
    queryFn: () => customFetch(`/api/cor/voice-log?projectId=${adminProjectId}`),
    enabled: isAdmin && !!adminProjectId,
    retry: 1,
  });

  const myLogsQuery = useQuery<VoiceLog[]>({
    queryKey: ["cor-voice-logs-self"],
    queryFn: () => customFetch("/api/cor/voice-log"),
    enabled: !isAdmin,
    retry: 1,
  });

  const logs = isAdmin ? adminLogsQuery.data : myLogsQuery.data;
  const isLoading = isAdmin ? adminLogsQuery.isLoading : myLogsQuery.isLoading;
  const isError = isAdmin ? adminLogsQuery.isError : myLogsQuery.isError;

  const submitMutation = useMutation({
    mutationFn: (body: { projectId: number; rawTranscript: string }) =>
      customFetch("/api/cor/voice-log", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Observation submitted", description: "AI classification complete, corrective task created." });
      setTranscript("");
      setSubmitProjectId("");
      setShowSubmit(false);
      // Invalidate both worker self-view and admin project view
      queryClient.invalidateQueries({ queryKey: ["cor-voice-logs-self"] });
      queryClient.invalidateQueries({ queryKey: ["cor-voice-logs-project"] });
    },
    onError: () => toast({ title: "Submit failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {isAdmin && (
          <ProjectSelect value={adminProjectId} onChange={setAdminProjectId} />
        )}
        <Button size="sm" style={{ background: GOLD, color: BLACK, marginLeft: "auto" }} onClick={() => setShowSubmit(true)}>
          <Mic className="h-4 w-4 mr-1.5" /> Submit Observation
        </Button>
      </div>

      {/* Submission dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }}>Submit Voice Observation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Project</Label>
              <Select value={submitProjectId} onValueChange={setSubmitProjectId}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} style={{ color: "#e5e5e5" }}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Observation</Label>
              <Textarea rows={5}
                placeholder="Describe the hazard or site condition… e.g. 'The fire extinguisher on level 2 is blocked by material pallets'"
                value={transcript} onChange={(e) => setTranscript(e.target.value)}
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
              <p className="text-xs text-zinc-600 mt-1">AI will classify risk level, map to an IHSA element, and create a corrective task.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSubmit(false)} className="text-zinc-400">Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!submitProjectId || !transcript.trim() || submitMutation.isPending}
              onClick={() => submitMutation.mutate({ projectId: Number(submitProjectId), rawTranscript: transcript.trim() })}>
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin && !adminProjectId && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <Mic className="h-9 w-9 mb-2 opacity-30" />
          <p className="text-sm">Select a project to view voice observations</p>
        </div>
      )}

      {isError && <ErrorState message="Could not load voice observations." />}

      {isLoading && (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />)}</div>
      )}

      {!isLoading && !isError && (isAdmin ? !!adminProjectId : true) && (
        <div className="space-y-3">
          {(!logs || logs.length === 0) && (
            <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
              <Mic className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No voice observations yet.</p>
            </div>
          )}
          {logs?.map((log) => (
            <Card key={log.id} style={{ background: BLACK, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <RiskPill level={log.riskLevel} />
                    {log.ihsaElement && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#ffffff0a", color: "#71717a" }}>
                        {IHSA_ELEMENTS[log.ihsaElement] ?? log.ihsaElement}
                      </span>
                    )}
                    {log.correctedTaskId && (
                      <span className="text-xs flex items-center gap-1" style={{ color: "#4ade80" }}>
                        <CheckCircle2 className="h-3 w-3" /> Task #{log.correctedTaskId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                    <Clock className="h-3 w-3" />
                    {format(new Date(log.createdAt), "MMM d, yyyy")}
                  </div>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">{log.rawTranscript}</p>
                {log.dueDate && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Corrective action due: {format(new Date(log.dueDate), "MMMM d, yyyy")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Sign-offs ────────────────────────────────────────────────────────────

const CREATE_DOC_DEFAULTS = {
  documentType: "swp" as DocType,
  title: "",
  description: "",
  fileUrl: "",
  contentText: "",
  ihsaElement: "element_3",
  requiresAnnualRenewal: false,
};

function SignoffComplianceBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {pct}%
    </span>
  );
}

function DocumentViewModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: PolicyDocument;
  onClose: () => void;
  onSigned: () => void;
}) {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const signMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/cor/policy-documents/${doc.id}/sign`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: "Document signed", description: `You have acknowledged: "${doc.title}"` });
      onSigned();
      onClose();
    },
    onError: () => toast({ title: "Sign-off failed", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
            <PenLine className="h-5 w-5" style={{ color: GOLD }} />
            {doc.title}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#ffffff10", color: GOLD }}>
              {DOC_TYPE_LABELS[doc.documentType]}
            </span>
            <span className="text-xs text-zinc-500">
              {IHSA_ELEMENTS[doc.ihsaElement] ?? doc.ihsaElement}
            </span>
            {doc.requiresAnnualRenewal && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#fef9c320", color: "#fbbf24" }}>
                Annual renewal required
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 pr-1">
          {doc.description && (
            <p className="text-sm text-zinc-300 leading-relaxed">{doc.description}</p>
          )}

          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm p-3 rounded-lg hover:opacity-80 transition-opacity"
              style={{ background: "#ffffff08", color: GOLD, border: "1px solid #2a2a2a" }}
            >
              <FileText className="h-4 w-4" />
              Open document file
            </a>
          )}

          {doc.contentText && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: 8 }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "#a1a1aa" }}
                onClick={() => setExpanded((v) => !v)}
              >
                <span>Document Content</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <div className="px-4 pb-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                  style={{ borderTop: "1px solid #1f1f1f" }}>
                  <div className="pt-3">{doc.contentText}</div>
                </div>
              )}
            </div>
          )}

          <div
            className="rounded-lg p-4"
            style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-yellow-500 cursor-pointer shrink-0"
              />
              <span className="text-sm text-zinc-200 leading-relaxed">
                I confirm that I have read, understood, and agree to comply with this{" "}
                <strong>{DOC_TYPE_LABELS[doc.documentType]}</strong>. My digital acknowledgement
                constitutes a binding sign-off on this document as of today's date and time.
              </span>
            </label>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
            disabled={!confirmed || signMutation.isPending}
            onClick={() => signMutation.mutate()}
          >
            {signMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing…</>
            ) : (
              <><PenLine className="h-4 w-4 mr-2" />Sign & Acknowledge</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDocumentDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(CREATE_DOC_DEFAULTS);

  function handleTypeChange(t: DocType) {
    setForm((f) => ({
      ...f,
      documentType: t,
      ihsaElement: DOC_TYPE_IHSA_DEFAULT[t],
    }));
  }

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      customFetch("/api/cor/policy-documents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Document created", description: "Workers can now be asked to sign this document." });
      setForm(CREATE_DOC_DEFAULTS);
      onCreated();
      onClose();
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !createMutation.isPending && onClose()}>
      <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: GOLD }} />
            Add Policy Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">Document Type</Label>
              <Select value={form.documentType} onValueChange={(v) => handleTypeChange(v as DocType)}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
                    <SelectItem key={t} value={t} style={{ color: "#e5e5e5" }}>{DOC_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1.5 block">IHSA Element</Label>
              <Select value={form.ihsaElement} onValueChange={(v) => setForm((f) => ({ ...f, ihsaElement: v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
                    <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Title <span className="text-red-400">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Elevated Work Platform Safe Work Procedure"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Description (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Brief summary visible to workers before signing"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Document URL (optional)</Label>
            <Input
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              placeholder="https://… (PDF, Word, etc.)"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1.5 block">Inline Content (optional)</Label>
            <Textarea
              value={form.contentText}
              onChange={(e) => setForm((f) => ({ ...f, contentText: e.target.value }))}
              rows={4}
              placeholder="Paste the full text of the document here so workers can read it in-app before signing…"
              style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresAnnualRenewal}
              onChange={(e) => setForm((f) => ({ ...f, requiresAnnualRenewal: e.target.checked }))}
              className="h-4 w-4 accent-yellow-500"
            />
            <span className="text-sm text-zinc-300">Requires annual re-sign</span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
            disabled={!form.title.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Action Required Panel (overview) ──────────────────────────────────────────

function ActionRequiredPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState<ActionRequiredCapa | null>(null);
  const [closeTarget, setCloseTarget] = useState<ActionRequiredCapa | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [closeForm, setCloseForm] = useState({ closureNotes: "", evidencePhotoUrl: "" });

  const query = useQuery<{ items: ActionRequiredCapa[] }>({
    queryKey: ["cor-action-required"],
    queryFn: () => customFetch("/api/cor/capa/action-required"),
    retry: 1,
  });

  const membersQuery = useQuery<{ members: CompanyMember[] }>({
    queryKey: ["cor-members"],
    queryFn: () => customFetch("/api/cor/members"),
    retry: 1,
    staleTime: 60000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA assigned" });
      queryClient.invalidateQueries({ queryKey: ["cor-action-required"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
      setAssignTarget(null);
    },
    onError: () => toast({ title: "Assign failed", variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}/close`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA closed", description: "Record locked — corrective action proven." });
      queryClient.invalidateQueries({ queryKey: ["cor-action-required"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
      setCloseTarget(null);
      setCloseForm({ closureNotes: "", evidencePhotoUrl: "" });
    },
    onError: () => toast({ title: "Close failed", variant: "destructive" }),
  });

  const items = query.data?.items ?? [];
  if (query.isLoading) return null;
  if (items.length === 0) return null;

  const criticalCount = items.filter((i) => i.priority === "critical").length;

  return (
    <>
      <div className="rounded-lg border" style={{ borderColor: "#7f1d1d66", background: "#1a0000" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#7f1d1d44" }}>
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-300">
              Action Required — {items.length} open CAPA{items.length !== 1 ? "s" : ""} from failed inspections
            </p>
            {criticalCount > 0 && (
              <p className="text-xs text-red-400 mt-0.5">
                {criticalCount} critical priority item{criticalCount !== 1 ? "s" : ""} — immediate corrective action needed
              </p>
            )}
          </div>
        </div>

        {/* Item list */}
        <div className="divide-y" style={{ borderColor: "#7f1d1d22" }}>
          {items.map((item) => {
            const pCfg = CAPA_PRIORITY_CFG[item.priority];
            const today = new Date().toISOString().split("T")[0]!;
            const isOverdue = item.dueDate && item.dueDate < today;

            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold" style={{ color: pCfg.color }}>● {pCfg.label}</span>
                    {item.projectName && (
                      <span className="text-xs text-zinc-500">{item.projectName}</span>
                    )}
                    {item.inspectionType && (
                      <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                        style={{ background: "#ffffff08", color: "#71717a" }}>
                        {item.inspectionType} inspection
                        {item.inspectionDate ? ` · ${item.inspectionDate}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-200 truncate">{item.sourceItemRef ?? item.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.assignedToName
                      ? <span className="text-xs text-zinc-500 flex items-center gap-1"><UserCheck className="h-3 w-3" />{item.assignedToName}</span>
                      : <span className="text-xs text-amber-500">Unassigned</span>
                    }
                    {item.dueDate && (
                      <span className="text-xs" style={{ color: isOverdue ? "#ef4444" : "#71717a" }}>
                        Due {item.dueDate}{isOverdue ? " ⚠ overdue" : ""}
                      </span>
                    )}
                    <CapaStatusBadge status={item.status} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline"
                    style={{ height: 28, fontSize: 11, borderColor: "#3a3a3a", color: "#a1a1aa", background: "transparent" }}
                    onClick={() => { setAssignTarget(item); setAssignUserId(String(item.assignedToUserId ?? "")); setDueDate(item.dueDate ?? ""); }}>
                    Assign
                  </Button>
                  <Button size="sm"
                    style={{ height: 28, fontSize: 11, background: "#166534", color: "#ffffff", border: "none" }}
                    onClick={() => { setCloseTarget(item); setCloseForm({ closureNotes: "", evidencePhotoUrl: "" }); }}>
                    Close
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 440 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }}>Assign CAPA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {assignTarget && (
              <p className="text-xs text-zinc-400 truncate border rounded px-3 py-2"
                style={{ borderColor: "#2a2a2a", background: "#ffffff06" }}>
                {assignTarget.sourceItemRef ?? assignTarget.title}
              </p>
            )}
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Assign to team member</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue placeholder="Select member…" />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  {(membersQuery.data?.members ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)} style={{ color: "#e5e5e5" }}>
                      {m.firstName} {m.lastName}
                      <span className="ml-1 text-zinc-500 capitalize">({m.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Target due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!assignUserId || updateMutation.isPending}
              onClick={() => {
                if (!assignTarget) return;
                updateMutation.mutate({
                  id: assignTarget.id,
                  body: {
                    assignedToUserId: parseInt(assignUserId),
                    status: "in_progress",
                    ...(dueDate ? { dueDate } : {}),
                  },
                });
              }}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign & Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / resolve dialog */}
      <Dialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <Lock className="h-4 w-4" style={{ color: GOLD }} />
              Close & Lock CAPA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {closeTarget && (
              <div className="rounded p-3 text-xs text-zinc-300" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
                <span className="font-semibold text-zinc-400">Failed item: </span>
                {closeTarget.sourceItemRef ?? closeTarget.title}
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: "#ffffff04", border: "1px solid #2a2a2a" }}>
              <p className="text-xs text-amber-400 font-semibold mb-1">Irreversible — proves due diligence</p>
              <p className="text-xs text-zinc-500">
                Document what was done and upload a photo of the resolution. The record is locked permanently upon closing.
              </p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Closure notes (required)</Label>
              <Textarea value={closeForm.closureNotes}
                onChange={(e) => setCloseForm((f) => ({ ...f, closureNotes: e.target.value }))}
                rows={3} placeholder="Describe the corrective action taken and how recurrence is prevented…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">
                Resolution photo URL <span className="text-zinc-600">(paste from cloud storage or camera upload)</span>
              </Label>
              <Input value={closeForm.evidencePhotoUrl}
                onChange={(e) => setCloseForm((f) => ({ ...f, evidencePhotoUrl: e.target.value }))}
                placeholder="https://…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button
              style={{ background: "#16a34a", color: "#ffffff" }}
              disabled={closeForm.closureNotes.trim().length < 5 || closeMutation.isPending}
              onClick={() => {
                if (!closeTarget) return;
                closeMutation.mutate({
                  id: closeTarget.id,
                  body: {
                    closureNotes: closeForm.closureNotes,
                    ...(closeForm.evidencePhotoUrl ? { evidencePhotoUrl: closeForm.evidencePhotoUrl } : {}),
                  },
                });
              }}>
              {closeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Lock className="h-4 w-4 mr-2" />Close & Lock Record</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── CAPATab ───────────────────────────────────────────────────────────────────

function CapaStatusBadge({ status }: { status: CapaStatus }) {
  const cfg = CAPA_STATUS_CFG[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}>
      {status === "closed" && <Lock className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

function CapaPriorityBadge({ priority }: { priority: CapaPriority }) {
  const cfg = CAPA_PRIORITY_CFG[priority];
  return (
    <span className="inline-flex items-center text-xs font-bold" style={{ color: cfg.color }}>
      ● {cfg.label}
    </span>
  );
}

const EMPTY_CAPA_FORM = {
  title: "", description: "", ihsaElement: "", priority: "medium" as CapaPriority,
  assignedToUserId: "", dueDate: "",
};

const EMPTY_CLOSE_FORM = { closureNotes: "", evidencePhotoUrl: "" };

function CAPATab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("open");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTicket, setEditTicket] = useState<CapaTicket | null>(null);
  const [closeTicket, setCloseTicket] = useState<CapaTicket | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [capaForm, setCapaForm] = useState({ ...EMPTY_CAPA_FORM });
  const [closeForm, setCloseForm] = useState({ ...EMPTY_CLOSE_FORM });

  const params = new URLSearchParams({ status: statusFilter, limit: "50" });
  const listQuery = useQuery<CapaListResponse>({
    queryKey: ["cor-capa", statusFilter],
    queryFn: () => customFetch(`/api/cor/capa?${params}`),
    retry: 1,
  });

  const membersQuery = useQuery<{ members: CompanyMember[] }>({
    queryKey: ["cor-members"],
    queryFn: () => customFetch("/api/cor/members"),
    retry: 1,
    staleTime: 60000,
  });

  const summaryQuery = useQuery<CapaSummary>({
    queryKey: ["cor-capa-summary"],
    queryFn: () => customFetch("/api/cor/capa/summary"),
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => customFetch("/api/cor/capa", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA ticket created" });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
      setShowCreate(false);
      setCapaForm({ ...EMPTY_CAPA_FORM });
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA ticket updated" });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
      setEditTicket(null);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      customFetch(`/api/cor/capa/${id}/close`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "CAPA closed & locked", description: "The corrective action record is now tamper-proof." });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
      setCloseTicket(null);
      setCloseForm({ ...EMPTY_CLOSE_FORM });
    },
    onError: () => toast({ title: "Close failed", variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/cor/capa/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "CAPA voided" });
      queryClient.invalidateQueries({ queryKey: ["cor-capa"] });
      queryClient.invalidateQueries({ queryKey: ["cor-capa-summary"] });
    },
    onError: () => toast({ title: "Void failed", variant: "destructive" }),
  });

  const summary = summaryQuery.data;
  const today = new Date().toISOString().split("T")[0]!;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Open",           value: summary.open,           color: "#ef4444" },
            { label: "In Progress",    value: summary.inProgress,     color: "#3b82f6" },
            { label: "Pending Review", value: summary.pendingReview,  color: "#f59e0b" },
            { label: "Closed",         value: summary.closed,         color: "#22c55e" },
            { label: "Overdue",        value: summary.overdue,        color: "#dc2626" },
          ].map((s) => (
            <Card key={s.label} style={{ background: "#111111", border: "1px solid #2a2a2a" }}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all"            style={{ color: "#e5e5e5" }}>All Tickets</SelectItem>
            <SelectItem value="open"           style={{ color: "#e5e5e5" }}>Open</SelectItem>
            <SelectItem value="in_progress"    style={{ color: "#e5e5e5" }}>In Progress</SelectItem>
            <SelectItem value="pending_review" style={{ color: "#e5e5e5" }}>Pending Review</SelectItem>
            <SelectItem value="closed"         style={{ color: "#e5e5e5" }}>Closed</SelectItem>
            <SelectItem value="void"           style={{ color: "#e5e5e5" }}>Void</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
            <SelectItem value="all"         style={{ color: "#e5e5e5" }}>All Sources</SelectItem>
            <SelectItem value="inspection"  style={{ color: "#e5e5e5" }}>Inspections</SelectItem>
            <SelectItem value="audit_trail" style={{ color: "#e5e5e5" }}>Audit Trail</SelectItem>
            <SelectItem value="manual"      style={{ color: "#e5e5e5" }}>Manual</SelectItem>
          </SelectContent>
        </Select>

        <Button style={{ background: GOLD, color: BLACK, fontWeight: 600 }}
          onClick={() => { setCapaForm({ ...EMPTY_CAPA_FORM }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" />Create CAPA
        </Button>

        {listQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
      </div>

      {listQuery.isError && <div className="py-6 text-center text-sm text-red-400">Could not load CAPA tickets.</div>}

      {listQuery.isLoading && (
        <div className="space-y-2">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" style={{ background: "#1a1a1a" }} />)}
        </div>
      )}

      {/* Ticket list */}
      {listQuery.data && (() => {
        const filteredTickets = (listQuery.data.data ?? []).filter(
          (t) => sourceFilter === "all" || t.sourceType === sourceFilter,
        );
        if (!filteredTickets.length) return (
          <div className="flex flex-col items-center justify-center py-14 text-zinc-600">
            <Wrench className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No CAPA tickets for this filter.</p>
          </div>
        );
        return (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => {
            const isExpanded = expandedId === ticket.id;
            const isOverdue = ticket.dueDate && ticket.dueDate < today && ticket.status !== "closed" && ticket.status !== "void";

            return (
              <Card key={ticket.id} style={{ background: "#111111", border: `1px solid ${isOverdue ? "#7f1d1d" : "#2a2a2a"}` }}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CapaPriorityBadge priority={ticket.priority} />
                        <CapaStatusBadge status={ticket.status} />
                        {ticket.sourceType === "inspection" && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#78350f44", color: "#fbbf24" }}>From Inspection</span>
                        )}
                        {ticket.sourceType === "audit_trail" && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ffffff10", color: "#71717a" }}>Auto-generated</span>
                        )}
                        {isOverdue && (
                          <span className="text-xs font-bold text-red-400">● OVERDUE</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-200 truncate">{ticket.title}</p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {ticket.ihsaElement && (
                          <span className="text-xs text-zinc-500">{IHSA_ELEMENTS[ticket.ihsaElement] ?? ticket.ihsaElement}</span>
                        )}
                        {ticket.assignedToName && (
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />{ticket.assignedToName}
                          </span>
                        )}
                        {ticket.dueDate && (
                          <span className="text-xs" style={{ color: isOverdue ? "#ef4444" : "#71717a" }}>
                            Due {ticket.dueDate}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!ticket.isLocked && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                            style={{ color: "#71717a" }}
                            onClick={() => {
                              setEditTicket(ticket);
                              setCapaForm({
                                title: ticket.title,
                                description: ticket.description ?? "",
                                ihsaElement: ticket.ihsaElement ?? "",
                                priority: ticket.priority,
                                assignedToUserId: ticket.assignedToUserId ? String(ticket.assignedToUserId) : "",
                                dueDate: ticket.dueDate ?? "",
                              });
                            }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {ticket.status !== "void" && ticket.status !== "closed" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              style={{ color: "#22c55e", fontSize: 11, fontWeight: 700 }}
                              onClick={() => { setCloseTicket(ticket); setCloseForm({ ...EMPTY_CLOSE_FORM }); }}>
                              Close
                            </Button>
                          )}
                          {ticket.status !== "void" && ticket.status !== "closed" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              style={{ color: "#71717a" }}
                              onClick={() => { if (confirm("Void this CAPA ticket?")) voidMutation.mutate(ticket.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded"
                        style={{ color: "#71717a" }}
                        onClick={() => setExpandedId(isExpanded ? null : ticket.id)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid #1f1f1f" }}>
                      {ticket.description && (
                        <p className="text-xs text-zinc-400 leading-relaxed">{ticket.description}</p>
                      )}
                      {ticket.closureNotes && (
                        <div className="rounded p-3" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
                          <p className="text-xs font-semibold text-zinc-400 mb-1">Closure Notes</p>
                          <p className="text-xs text-zinc-300">{ticket.closureNotes}</p>
                        </div>
                      )}
                      {ticket.evidencePhotoUrl && (
                        <a href={ticket.evidencePhotoUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs"
                          style={{ color: GOLD }}>
                          <FileCheck className="h-3 w-3" />View Evidence Photo
                        </a>
                      )}
                      {ticket.isLocked && (
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <Lock className="h-3 w-3" />
                          Record locked — due diligence proven
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        );
      })()}

      {/* Create / Edit dialog */}
      <Dialog open={showCreate || !!editTicket} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setEditTicket(null); }
      }}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <Wrench className="h-5 w-5" style={{ color: GOLD }} />
              {editTicket ? "Edit CAPA Ticket" : "Create CAPA Ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Title *</Label>
              <Input value={capaForm.title} onChange={(e) => setCapaForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Describe the corrective action needed"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Description</Label>
              <Textarea value={capaForm.description}
                onChange={(e) => setCapaForm((f) => ({ ...f, description: e.target.value }))}
                rows={3} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Priority</Label>
                <Select value={capaForm.priority} onValueChange={(v) => setCapaForm((f) => ({ ...f, priority: v as CapaPriority }))}>
                  <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                    {(["critical","high","medium","low"] as CapaPriority[]).map((p) => (
                      <SelectItem key={p} value={p} style={{ color: CAPA_PRIORITY_CFG[p].color }}>
                        {CAPA_PRIORITY_CFG[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Due Date</Label>
                <Input type="date" value={capaForm.dueDate}
                  onChange={(e) => setCapaForm((f) => ({ ...f, dueDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Assign to team member</Label>
              <Select
                value={capaForm.assignedToUserId || "unassigned"}
                onValueChange={(v) => setCapaForm((f) => ({ ...f, assignedToUserId: v === "unassigned" ? "" : v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  <SelectItem value="unassigned" style={{ color: "#71717a" }}>Unassigned</SelectItem>
                  {(membersQuery.data?.members ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)} style={{ color: "#e5e5e5" }}>
                      {m.firstName} {m.lastName}
                      <span className="ml-1 text-zinc-500 capitalize">({m.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">IHSA Element</Label>
              <Select value={capaForm.ihsaElement || "none"} onValueChange={(v) => setCapaForm((f) => ({ ...f, ihsaElement: v === "none" ? "" : v }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }}>
                  <SelectValue placeholder="Select element…" />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #333" }}>
                  <SelectItem value="none" style={{ color: "#71717a" }}>None</SelectItem>
                  {Object.entries(IHSA_ELEMENTS).map(([k, v]) => (
                    <SelectItem key={k} value={k} style={{ color: "#e5e5e5" }}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400"
              onClick={() => { setShowCreate(false); setEditTicket(null); }}>
              Cancel
            </Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!capaForm.title.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                const body: Record<string, unknown> = {
                  title: capaForm.title,
                  priority: capaForm.priority,
                  ...(capaForm.description ? { description: capaForm.description } : {}),
                  ...(capaForm.ihsaElement ? { ihsaElement: capaForm.ihsaElement } : {}),
                  ...(capaForm.dueDate ? { dueDate: capaForm.dueDate } : {}),
                  ...(capaForm.assignedToUserId ? { assignedToUserId: parseInt(capaForm.assignedToUserId) } : {}),
                };
                if (editTicket) {
                  updateMutation.mutate({ id: editTicket.id, body });
                } else {
                  createMutation.mutate(body);
                }
              }}>
              {(createMutation.isPending || updateMutation.isPending)
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editTicket ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / lock dialog */}
      <Dialog open={!!closeTicket} onOpenChange={(open) => !open && setCloseTicket(null)}>
        <DialogContent style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e5e5e5" }} className="flex items-center gap-2">
              <Lock className="h-5 w-5" style={{ color: GOLD }} />
              Close & Lock CAPA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg p-3" style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}>
              <p className="text-xs text-amber-400 font-semibold mb-1">Warning — irreversible action</p>
              <p className="text-xs text-zinc-400">
                Closing this CAPA permanently locks the record. You must provide closure notes and upload evidence (photo URL) that the corrective action was completed. This proves due diligence under IHSA COR.
              </p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Closure Notes * (min 5 characters)</Label>
              <Textarea value={closeForm.closureNotes}
                onChange={(e) => setCloseForm((f) => ({ ...f, closureNotes: e.target.value }))}
                rows={4} placeholder="Describe what was done to correct and prevent recurrence…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Evidence Photo URL (optional)</Label>
              <Input value={closeForm.evidencePhotoUrl}
                onChange={(e) => setCloseForm((f) => ({ ...f, evidencePhotoUrl: e.target.value }))}
                placeholder="https://…"
                style={{ background: "#1a1a1a", border: "1px solid #333", color: "#e5e5e5" }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" onClick={() => setCloseTicket(null)}>Cancel</Button>
            <Button
              style={{ background: "#16a34a", color: "#ffffff" }}
              disabled={closeForm.closureNotes.trim().length < 5 || closeMutation.isPending}
              onClick={() => {
                if (!closeTicket) return;
                closeMutation.mutate({
                  id: closeTicket.id,
                  body: {
                    closureNotes: closeForm.closureNotes,
                    ...(closeForm.evidencePhotoUrl ? { evidencePhotoUrl: closeForm.evidencePhotoUrl } : {}),
                  },
                });
              }}>
              {closeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Lock className="h-4 w-4 mr-2" />Close & Lock Record</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── SubcontractorsTab ─────────────────────────────────────────────────────────

const EMPTY_SUB_FORM = {
  companyName: "", contactName: "", contactEmail: "",
  contactPhone: "", tradeType: "general" as string, notes: "",
};

const EMPTY_DOC_FORM = {
  docType: "wsib_clearance" as SubDocType,
  docStatus: "pending" as SubDocStatus,
  documentUrl: "", issueDate: "", expiryDate: "", notes: "",
};

function SubStatusBadge({ status }: { status: SubStatus }) {
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

function SubcontractorsTab({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const subsQuery = useQuery<{ subcontractors: Subcontractor[] }>({
    queryKey: ["cor-subcontractors"],
    queryFn: () => customFetch("/api/cor/subcontractors"),
    enabled: isAdmin,
    retry: 1,
  });

  const summaryQuery = useQuery<SubSummary>({
    queryKey: ["cor-subcontractors-summary"],
    queryFn: () => customFetch("/api/cor/subcontractors/summary"),
    enabled: isAdmin,
    retry: 1,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editSub, setEditSub] = useState<Subcontractor | null>(null);
  const [docTarget, setDocTarget] = useState<{ subId: number; existing?: SubcontractorDoc; defaultType?: SubDocType } | null>(null);
  const [subForm, setSubForm] = useState({ ...EMPTY_SUB_FORM });
  const [docForm, setDocForm] = useState({ ...EMPTY_DOC_FORM });

  function openCreate() { setSubForm({ ...EMPTY_SUB_FORM }); setShowCreate(true); }
  function openEdit(s: Subcontractor) {
    setEditSub(s);
    setSubForm({
      companyName: s.companyName, contactName: s.contactName ?? "",
      contactEmail: s.contactEmail ?? "", contactPhone: s.contactPhone ?? "",
      tradeType: s.tradeType, notes: s.notes ?? "",
    });
  }
  function openDoc(subId: number, existing?: SubcontractorDoc, defaultType?: SubDocType) {
    setDocTarget({ subId, existing, defaultType });
    setDocForm(existing ? {
      docType: existing.docType, docStatus: existing.docStatus,
      documentUrl: existing.documentUrl ?? "", issueDate: existing.issueDate ?? "",
      expiryDate: existing.expiryDate ?? "", notes: existing.notes ?? "",
    } : { ...EMPTY_DOC_FORM, docType: defaultType ?? "wsib_clearance" });
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["cor-subcontractors"] });
    queryClient.invalidateQueries({ queryKey: ["cor-subcontractors-summary"] });
    queryClient.invalidateQueries({ queryKey: ["cor-subcontractors-flagged"] });
  };

  const createMut = useMutation({
    mutationFn: (body: typeof subForm) =>
      customFetch("/api/cor/subcontractors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Subcontractor added" }); setShowCreate(false); invalidate(); },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: typeof subForm }) =>
      customFetch(`/api/cor/subcontractors/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Subcontractor updated" }); setEditSub(null); invalidate(); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/cor/subcontractors/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Subcontractor removed" }); invalidate(); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const upsertDocMut = useMutation({
    mutationFn: ({ subId, body }: { subId: number; body: typeof docForm }) =>
      customFetch(`/api/cor/subcontractors/${subId}/docs`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Document saved" }); setDocTarget(null); invalidate(); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteDocMut = useMutation({
    mutationFn: ({ subId, docId }: { subId: number; docId: number }) =>
      customFetch(`/api/cor/subcontractors/${subId}/docs/${docId}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Document removed" }); invalidate(); },
    onError: () => toast({ title: "Remove failed", variant: "destructive" }),
  });

  const subs = subsQuery.data?.subcontractors ?? [];
  const summary = summaryQuery.data;
  const flagged = subs.filter((s) => s.overallStatus === "expired" || s.overallStatus === "non_compliant");

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <Building2 className="h-9 w-9 mb-2 opacity-30" />
        <p className="text-sm">Subcontractor compliance is managed by your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: "Total", value: summary.total, color: GOLD },
            { label: "Compliant", value: summary.compliant, color: "#16a34a" },
            { label: "Flagged", value: summary.expired + summary.nonCompliant, color: "#dc2626" },
            { label: "Pending", value: summary.pending, color: "#ca8a04" },
          ] as const).map(({ label, value, color }) => (
            <Card key={label} style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flagged warning banner */}
      {flagged.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-900/40 bg-red-950/30">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              {flagged.length} subcontractor{flagged.length !== 1 ? "s" : ""} require attention
            </p>
            <p className="text-xs text-red-400 mt-0.5">
              {flagged.map((s) => s.companyName).join(", ")} — expired or missing required compliance documents
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
          Trade Partners &amp; Compliance
        </p>
        <Button size="sm" onClick={openCreate} style={{ background: GOLD, color: BLACK }}>
          <Plus className="h-4 w-4 mr-1" /> Add Subcontractor
        </Button>
      </div>

      {/* Loading / error */}
      {subsQuery.isLoading && <Skeleton className="h-40 rounded-lg" style={{ background: "#1a1a1a" }} />}
      {subsQuery.isError && <ErrorState message="Could not load subcontractors." />}
      {!subsQuery.isLoading && subs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <HardHat className="h-9 w-9 mb-2 opacity-30" />
          <p className="text-sm">No subcontractors added yet.</p>
        </div>
      )}

      {/* Subcontractor rows */}
      <div className="space-y-3">
        {subs.map((sub) => {
          const isExpanded = expandedId === sub.id;
          const docMap = new Map(sub.docs.map((d) => [d.docType, d]));
          const requiredOk = (["wsib_clearance", "insurance_certificate"] as SubDocType[])
            .filter((t) => docMap.get(t)?.docStatus === "valid").length;

          return (
            <Card key={sub.id} style={{ background: BLACK, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
              <CardContent className="p-4">
                {/* Row header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  >
                    <Building2 className="h-5 w-5 text-zinc-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-100 truncate">{sub.companyName}</p>
                      <p className="text-xs text-zinc-500">
                        {TRADE_TYPE_LABELS[sub.tradeType] ?? sub.tradeType}
                        {sub.contactEmail && ` · ${sub.contactEmail}`}
                      </p>
                    </div>
                    <SubStatusBadge status={sub.overallStatus} />
                    <span className="text-xs text-zinc-600 shrink-0">{requiredOk}/2 req.</span>
                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(sub)}>
                      <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => { if (confirm(`Remove ${sub.companyName}?`)) deleteMut.mutate(sub.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Expanded doc tracking */}
                {isExpanded && (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "#1f1f1f" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                      Compliance Documents
                    </p>
                    {ALL_SUB_DOC_TYPES.map((dt) => {
                      const doc = docMap.get(dt);
                      const required = SUB_DOC_REQUIRED[dt];
                      const statusCfg = doc ? SUB_DOC_STATUS_CFG[doc.docStatus] : null;
                      return (
                        <div key={dt} className="flex items-center gap-3 py-2 rounded px-2"
                          style={{ background: "#161616" }}>
                          <FileCheck className="h-4 w-4 text-zinc-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-300">
                              {SUB_DOC_TYPE_LABELS[dt]}
                              {required && <span className="text-red-400 ml-1 text-xs">*</span>}
                            </p>
                            {doc && (
                              <p className="text-xs text-zinc-600">
                                {doc.expiryDate && `Expires ${doc.expiryDate}`}
                                {doc.documentUrl && (
                                  <a href={doc.documentUrl} target="_blank" rel="noreferrer"
                                    className="ml-2 inline-flex items-center gap-0.5 text-blue-400 hover:underline">
                                    View <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                          {statusCfg
                            ? <span className="text-xs font-semibold shrink-0" style={{ color: statusCfg.color }}>
                                {statusCfg.label}
                              </span>
                            : <span className="text-xs text-zinc-600 shrink-0">Not uploaded</span>
                          }
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-zinc-400"
                              onClick={() => openDoc(sub.id, doc, dt)}>
                              {doc ? "Update" : "Add"}
                            </Button>
                            {doc && (
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => deleteDocMut.mutate({ subId: sub.id, docId: doc.id })}>
                                <Trash2 className="h-3 w-3 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit subcontractor dialog */}
      <Dialog open={showCreate || !!editSub} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditSub(null); } }}>
        <DialogContent style={{ background: "#111", border: "1px solid #2a2a2a", color: "white" }}>
          <DialogHeader>
            <DialogTitle style={{ color: GOLD }}>{editSub ? "Edit Subcontractor" : "Add Subcontractor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400 text-xs">Company Name *</Label>
              <Input value={subForm.companyName} onChange={(e) => setSubForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Acme Electrical Ltd." style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Contact Name</Label>
                <Input value={subForm.contactName} onChange={(e) => setSubForm((f) => ({ ...f, contactName: e.target.value }))}
                  placeholder="Jane Smith" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Trade Type *</Label>
                <Select value={subForm.tradeType} onValueChange={(v) => setSubForm((f) => ({ ...f, tradeType: v }))}>
                  <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                    {Object.entries(TRADE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} style={{ color: "white" }}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Contact Email</Label>
                <Input value={subForm.contactEmail} onChange={(e) => setSubForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="contact@company.com" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Phone</Label>
                <Input value={subForm.contactPhone} onChange={(e) => setSubForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="416-555-0100" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea value={subForm.notes} onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); setEditSub(null); }} className="text-zinc-400">
              Cancel
            </Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={!subForm.companyName.trim() || createMut.isPending || updateMut.isPending}
              onClick={() => editSub
                ? updateMut.mutate({ id: editSub.id, body: subForm })
                : createMut.mutate(subForm)
              }>
              {(createMut.isPending || updateMut.isPending)
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editSub ? "Save Changes" : "Add Subcontractor"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Update compliance doc dialog */}
      <Dialog open={!!docTarget} onOpenChange={(o) => { if (!o) setDocTarget(null); }}>
        <DialogContent style={{ background: "#111", border: "1px solid #2a2a2a", color: "white" }}>
          <DialogHeader>
            <DialogTitle style={{ color: GOLD }}>
              {docTarget?.existing ? "Update Document" : "Add Compliance Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-400 text-xs">Document Type</Label>
              <Select value={docForm.docType} onValueChange={(v) => setDocForm((f) => ({ ...f, docType: v as SubDocType }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                  {ALL_SUB_DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t} style={{ color: "white" }}>
                      {SUB_DOC_TYPE_LABELS[t]}{SUB_DOC_REQUIRED[t] ? " *" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Status</Label>
              <Select value={docForm.docStatus} onValueChange={(v) => setDocForm((f) => ({ ...f, docStatus: v as SubDocStatus }))}>
                <SelectTrigger style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                  {(["valid","pending","expired","rejected"] as SubDocStatus[]).map((s) => (
                    <SelectItem key={s} value={s} style={{ color: "white" }}>
                      {SUB_DOC_STATUS_CFG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Issue Date</Label>
                <Input type="date" value={docForm.issueDate} onChange={(e) => setDocForm((f) => ({ ...f, issueDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Expiry Date</Label>
                <Input type="date" value={docForm.expiryDate} onChange={(e) => setDocForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Document URL</Label>
              <Input value={docForm.documentUrl} onChange={(e) => setDocForm((f) => ({ ...f, documentUrl: e.target.value }))}
                placeholder="https://..." style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea value={docForm.notes} onChange={(e) => setDocForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "white" }} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDocTarget(null)} className="text-zinc-400">Cancel</Button>
            <Button style={{ background: GOLD, color: BLACK }}
              disabled={upsertDocMut.isPending}
              onClick={() => docTarget && upsertDocMut.mutate({ subId: docTarget.subId, body: docForm })}>
              {upsertDocMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignoffsTab({ isAdmin, userId }: { isAdmin: boolean; userId: number | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Admin: signoff compliance matrix
  const matrixQuery = useQuery<{ matrix: SignoffMatrixEntry[] }>({
    queryKey: ["cor-signoff-matrix"],
    queryFn: () => customFetch("/api/cor/policy-signoffs"),
    enabled: isAdmin,
    retry: 1,
  });

  // Worker: own signoffs + pending
  const mySignoffsQuery = useQuery<{ signoffs: MySignoffEntry[] }>({
    queryKey: ["cor-my-signoffs", userId],
    queryFn: () => customFetch("/api/cor/policy-signoffs"),
    enabled: !isAdmin,
    retry: 1,
  });

  const pendingQuery = useQuery<{ pending: PolicyDocument[] }>({
    queryKey: ["cor-pending-signoffs", userId],
    queryFn: () => customFetch("/api/cor/policy-signoffs/pending"),
    enabled: !!userId,
    retry: 1,
  });

  const docsQuery = useQuery<{ documents: PolicyDocument[] }>({
    queryKey: ["cor-policy-documents"],
    queryFn: () => customFetch("/api/cor/policy-documents"),
    retry: 1,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [viewDoc, setViewDoc] = useState<PolicyDocument | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  const archiveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/cor/policy-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Document archived" });
      queryClient.invalidateQueries({ queryKey: ["cor-policy-documents"] });
      queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
    },
    onError: () => toast({ title: "Archive failed", variant: "destructive" }),
  });

  function handleSigned() {
    queryClient.invalidateQueries({ queryKey: ["cor-pending-signoffs"] });
    queryClient.invalidateQueries({ queryKey: ["cor-my-signoffs"] });
    queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
  }

  const pending = pendingQuery.data?.pending ?? [];
  const matrix = matrixQuery.data?.matrix ?? [];
  const mySignoffs = mySignoffsQuery.data?.signoffs ?? [];
  const docs = docsQuery.data?.documents ?? [];

  // ── Worker view ───────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        {viewDoc && (
          <DocumentViewModal doc={viewDoc} onClose={() => setViewDoc(null)} onSigned={handleSigned} />
        )}

        {/* Pending sign-offs */}
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                Pending Sign-offs
              </CardTitle>
              {pendingQuery.data && (
                <span className="text-xs text-zinc-500">{pending.length} document{pending.length !== 1 ? "s" : ""} awaiting your signature</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
            {pendingQuery.isError && <ErrorState message="Could not load pending documents." />}

            {!pendingQuery.isLoading && pending.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" style={{ color: "#22c55e" }} />
                <p className="text-sm" style={{ color: "#22c55e" }}>All documents signed — you're up to date!</p>
              </div>
            )}

            <div className="space-y-3">
              {pending.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-lg"
                  style={{ background: "#ffffff06", border: "1px solid #2a2a2a" }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 mt-0.5 w-8 h-8 rounded flex items-center justify-center"
                      style={{ background: "#ffffff0a" }}>
                      <FileText className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-zinc-500">{DOC_TYPE_LABELS[doc.documentType]}</span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">{IHSA_ELEMENTS[doc.ihsaElement]}</span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{doc.description}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setViewDoc(doc)}
                    style={{ background: GOLD, color: BLACK, fontWeight: 600, shrink: 0 }}
                    className="shrink-0"
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1.5" />
                    Review & Sign
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Completed sign-offs */}
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              My Signed Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mySignoffsQuery.isLoading && <Skeleton className="h-20 rounded-lg" style={{ background: "#1a1a1a" }} />}
            {mySignoffsQuery.isError && <ErrorState message="Could not load signed documents." />}
            {!mySignoffsQuery.isLoading && mySignoffs.length === 0 && (
              <p className="text-sm text-zinc-600 italic">No signed documents yet.</p>
            )}
            <div className="divide-y" style={{ borderColor: "#1f1f1f" }}>
              {mySignoffs.map(({ signoff, document }) => (
                <div key={signoff.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{document.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {DOC_TYPE_LABELS[document.documentType]} · {IHSA_ELEMENTS[document.ihsaElement]}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 text-xs" style={{ color: "#22c55e" }}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {format(new Date(signoff.signedAt), "MMM d, yyyy")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {viewDoc && (
        <DocumentViewModal doc={viewDoc} onClose={() => setViewDoc(null)} onSigned={handleSigned} />
      )}
      <CreateDocumentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["cor-policy-documents"] });
          queryClient.invalidateQueries({ queryKey: ["cor-signoff-matrix"] });
        }}
      />

      {/* Compliance summary row */}
      {matrix.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Documents",
              value: matrix.length,
              icon: <FileText className="h-4 w-4" style={{ color: GOLD }} />,
            },
            {
              label: "Avg Compliance",
              value: `${Math.round(matrix.reduce((s, m) => s + m.compliancePercent, 0) / matrix.length)}%`,
              icon: <BarChart3 className="h-4 w-4" style={{ color: GOLD }} />,
            },
            {
              label: "Total Workers",
              value: matrix[0]?.totalWorkers ?? 0,
              icon: <Users className="h-4 w-4" style={{ color: GOLD }} />,
            },
          ].map((stat) => (
            <Card key={stat.label} style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: `${GOLD}1a` }}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Document list with per-doc signoff breakdown */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Policy Documents & Sign-off Compliance
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(true)} style={{ background: GOLD, color: BLACK, height: 30, fontSize: 12 }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(matrixQuery.isLoading || docsQuery.isLoading) && (
            <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" style={{ background: "#1a1a1a" }} />)}</div>
          )}
          {matrixQuery.isError && <ErrorState message="Could not load sign-off matrix." />}

          {!matrixQuery.isLoading && matrix.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No policy documents yet.</p>
              <p className="text-xs mt-1">Click "Add Document" to create your first SWP, JHA, or Company Rule.</p>
            </div>
          )}

          <div className="space-y-2">
            {matrix.map((entry) => {
              const isExpanded = expandedDocId === entry.document.id;
              const unsigned = entry.signoffs.filter((s) => !s.signedAt);
              return (
                <div key={entry.document.id} style={{ border: "1px solid #1f1f1f", borderRadius: 8, overflow: "hidden" }}>
                  <button
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                    onClick={() => setExpandedDocId(isExpanded ? null : entry.document.id)}
                  >
                    <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center" style={{ background: "#ffffff08" }}>
                      <FileText className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-100 truncate">{entry.document.title}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ffffff0a", color: "#a1a1aa" }}>
                          {DOC_TYPE_LABELS[entry.document.documentType]}
                        </span>
                        <span className="text-xs text-zinc-600">{IHSA_ELEMENTS[entry.document.ihsaElement]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <SignoffComplianceBadge pct={entry.compliancePercent} />
                        <p className="text-xs text-zinc-600 mt-0.5">{entry.signedCount}/{entry.totalWorkers} signed</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-600" /> : <ChevronDown className="h-4 w-4 text-zinc-600" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #1f1f1f" }}>
                      {/* Document actions */}
                      <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#ffffff03" }}>
                        {(entry.document.fileUrl || entry.document.contentText) && (
                          <Button size="sm" variant="ghost" onClick={() => setViewDoc(entry.document)}
                            className="h-7 text-xs text-zinc-400 hover:text-zinc-100">
                            <FileText className="h-3 w-3 mr-1.5" />
                            Preview
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-red-500 hover:text-red-400 ml-auto"
                          disabled={archiveMutation.isPending}
                          onClick={() => archiveMutation.mutate(entry.document.id)}
                        >
                          Archive
                        </Button>
                      </div>

                      {/* Workers unsigned first */}
                      {unsigned.length > 0 && (
                        <div className="px-4 py-2" style={{ borderTop: "1px solid #1a1a1a" }}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                            Unsigned ({unsigned.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {unsigned.map((w) => (
                              <span key={w.userId} className="text-xs px-2 py-0.5 rounded" style={{ background: "#7f1d1d20", color: "#f87171" }}>
                                {w.firstName} {w.lastName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Signed workers */}
                      <div className="overflow-x-auto" style={{ borderTop: "1px solid #1a1a1a" }}>
                        <table className="w-full text-xs min-w-max">
                          <thead>
                            <tr style={{ borderBottom: "1px solid #1a1a1a" }}>
                              {["Worker", "Status", "Date Signed"].map((h) => (
                                <th key={h} className="text-left px-4 py-2 text-zinc-600 font-semibold uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {entry.signoffs.map((s) => (
                              <tr key={s.userId} style={{ borderBottom: "1px solid #111111" }}>
                                <td className="px-4 py-2.5 text-zinc-300 whitespace-nowrap">
                                  {s.firstName} {s.lastName}
                                  <span className="ml-1.5 text-zinc-600">{s.email}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {s.signedAt
                                    ? <span className="inline-flex items-center gap-1" style={{ color: "#22c55e" }}><CheckCircle2 className="h-3 w-3" />Signed</span>
                                    : <span className="inline-flex items-center gap-1 text-zinc-600"><Clock className="h-3 w-3" />Pending</span>}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">
                                  {s.signedAt ? format(new Date(s.signedAt), "MMM d, yyyy · h:mm a") : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorCompliancePage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  // Wait for role to be known before rendering role-dependent UI
  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isAdmin = me.role === "owner" || me.role === "foreman";

  function handlePackageSuccess() {
    queryClient.invalidateQueries({ queryKey: ["cor-audit-packages"] });
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: "#1a1a1a", background: BLACK }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg"
              style={{ width: 38, height: 38, background: `${GOLD}1a`, border: `1px solid ${GOLD}40` }}>
              <BadgeCheck className="h-5 w-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">COR Compliance</h1>
              <p className="text-xs text-zinc-500">Ontario IHSA Certificate of Recognition</p>
            </div>
          </div>

          {isAdmin && (
            <Button
              onClick={() => setShowGenerateDialog(true)}
              style={{ background: GOLD, color: BLACK, fontWeight: 600, letterSpacing: "0.01em" }}
            >
              <Download className="h-4 w-4 mr-2" />
              Generate Audit Package
            </Button>
          )}
        </div>
      </div>

      {isAdmin && (
        <GenerateAuditPackageDialog
          open={showGenerateDialog}
          onClose={() => setShowGenerateDialog(false)}
          onSuccess={handlePackageSuccess}
        />
      )}

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {isAdmin && <TabsTrigger value="audit-trail">Audit Trail</TabsTrigger>}
            <TabsTrigger value="credentials">{isAdmin ? "Training Matrix" : "My Credentials"}</TabsTrigger>
            <TabsTrigger value="sign-offs">{isAdmin ? "Sign-offs" : "Documents"}</TabsTrigger>
            {isAdmin && <TabsTrigger value="subcontractors">Subcontractors</TabsTrigger>}
            {isAdmin && <TabsTrigger value="capa">CAPA</TabsTrigger>}
            <TabsTrigger value="voice-logs">{isAdmin ? "Voice Logs" : "My Observations"}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab isAdmin={isAdmin} userId={me.id} onGeneratePackage={() => setShowGenerateDialog(true)} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="audit-trail">
              <AuditTrailTab />
            </TabsContent>
          )}

          <TabsContent value="credentials">
            <CredentialsTab isAdmin={isAdmin} userId={me.id} />
          </TabsContent>

          <TabsContent value="sign-offs">
            <SignoffsTab isAdmin={isAdmin} userId={me.id} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="subcontractors">
              <SubcontractorsTab isAdmin={isAdmin} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="capa">
              <CAPATab />
            </TabsContent>
          )}

          <TabsContent value="voice-logs">
            <VoiceLogsTab isAdmin={isAdmin} userId={me.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
