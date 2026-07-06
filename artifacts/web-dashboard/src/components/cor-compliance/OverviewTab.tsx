import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, Activity, Download, Package, ShieldCheck,
  XCircle, Loader2, Lock, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize } from "@/lib/format";
import {
  GOLD, BLACK, IHSA_ELEMENTS, CREDENTIAL_LABELS, scoreColor,
  ScoreGauge, ScoreBar, ErrorState, ProjectSelect, CredStatusBadge, CapaPriorityBadge, CapaStatusBadge,
} from "./shared";
import { useProjectDashboard } from "@/hooks/cor-compliance/useProjectDashboard";
import { useMyCredentials } from "@/hooks/cor-compliance/useCredentials";
import { useFlaggedSubcontractors } from "@/hooks/cor-compliance/useSubcontractors";
import { useActionRequiredCapas, useUpdateCapa, useCloseCapa } from "@/hooks/cor-compliance/useCapa";
import { useCompanyMembers } from "@/hooks/cor-compliance/useCompanyMembers";
import { useAuditPackages, downloadAuditPackage, downloadPackageById } from "@/hooks/cor-compliance/useAuditPackages";
import type { ActionRequiredCapa } from "@/components/cor-compliance/shared";
import type { AuditPackage } from "@/hooks/cor-compliance/useAuditPackages";

// ── Audit Package: generation dialog ─────────────────────────────────────────

export function GenerateAuditPackageDialog({
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
            Compiles all audit trail evidence, inspections, voice observations, CAPA tickets,
            policy sign-offs, subcontractor compliance, and training matrices into a structured ZIP
            binder organized by all 19 Ontario IHSA elements — ready for external auditor review.
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
            <p>• All 19 IHSA element folders with audit entries, CSV + JSON</p>
            <p>• Full inspection history with per-item breakdown</p>
            <p>• Voice observation log mapped to elements</p>
            <p>• CAPA tickets grouped by element with closure evidence</p>
            <p>• Policy sign-offs with worker acknowledgement records</p>
            <p>• Subcontractor compliance docs (Element 15)</p>
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
  const { toast } = useToast();
  const packagesQuery = useAuditPackages();

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const packages = packagesQuery.data ?? [];

  function overallScore(pkg: AuditPackage): number {
    if (!pkg.elementSummary?.length) return 0;
    return Math.round(pkg.elementSummary.reduce((s, e) => s + e.score, 0) / pkg.elementSummary.length);
  }

  async function handleRedownload(pkg: AuditPackage) {
    setDownloadingId(pkg.id);
    try {
      await downloadPackageById(pkg.id);
      toast({ title: "Package downloaded", description: `"${pkg.label}" re-downloaded successfully.` });
    } catch (err) {
      toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
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
                            <span className="text-xs text-zinc-500">{formatFileSize(pkg.fileSizeBytes)}</span>
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
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {pkg.status === "ready" && (
                    <>
                      <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded" style={{ background: "#14532d33", color: "#4ade80" }}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Ready
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={downloadingId === pkg.id}
                        onClick={() => handleRedownload(pkg)}
                        className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        {downloadingId === pkg.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><Download className="h-3 w-3 mr-1" />Download</>
                        }
                      </Button>
                    </>
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

// ── Sign-off Element Compliance Panel ────────────────────────────────────────

interface SignoffElementEntry {
  ihsaElement: string;
  documentCount: number;
  avgCompliancePercent: number;
  lowestCompliancePercent: number;
  signedCount: number;
  totalWorkers: number;
}

function SignoffElementPanel() {
  const query = useQuery<{ compliance: SignoffElementEntry[] }>({
    queryKey: ["cor-signoff-element-compliance"],
    queryFn: () => customFetch("/api/cor/signoff-element-compliance"),
    retry: 1,
  });

  const items = query.data?.compliance ?? [];
  if (query.isLoading || items.length === 0) return null;

  const belowThreshold = items.filter((i) => i.lowestCompliancePercent < 100);

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            Policy Sign-off Evidence — IHSA Elements
          </CardTitle>
          {belowThreshold.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: "#7f1d1d20", color: "#f87171" }}
            >
              <AlertTriangle className="h-3 w-3" />
              {belowThreshold.length} element{belowThreshold.length !== 1 ? "s" : ""} incomplete
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Worker acknowledgements mapped to IHSA elements as verifiable evidence
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const pct = item.lowestCompliancePercent;
          const color = pct >= 100 ? "#22c55e" : pct >= 75 ? "#f59e0b" : "#ef4444";
          return (
            <div key={item.ihsaElement} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-zinc-200 truncate">
                    {IHSA_ELEMENTS[item.ihsaElement] ?? item.ihsaElement}
                  </span>
                  <span className="text-xs text-zinc-600 shrink-0">
                    {item.documentCount} doc{item.documentCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1f1f1f" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right w-24">
                <p className="text-sm font-bold" style={{ color }}>{pct}%</p>
                <p className="text-xs text-zinc-600">
                  {item.signedCount}/{item.totalWorkers} signed
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Action Required Panel (overview) ──────────────────────────────────────────

function ActionRequiredPanel() {
  const [assignTarget, setAssignTarget] = useState<ActionRequiredCapa | null>(null);
  const [closeTarget, setCloseTarget] = useState<ActionRequiredCapa | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [closeForm, setCloseForm] = useState({ closureNotes: "", evidencePhotoUrl: "" });

  const query = useActionRequiredCapas();
  const membersQuery = useCompanyMembers();
  const updateMutation = useUpdateCapa("CAPA assigned", () => setAssignTarget(null));
  const closeMutation = useCloseCapa({
    title: "CAPA closed",
    description: "Record locked — corrective action proven.",
    onDone: () => { setCloseTarget(null); setCloseForm({ closureNotes: "", evidencePhotoUrl: "" }); },
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
            const today = new Date().toISOString().split("T")[0]!;
            const isOverdue = item.dueDate && item.dueDate < today;

            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <CapaPriorityBadge priority={item.priority} />
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

// ── Tab: Overview ─────────────────────────────────────────────────────────────

export function OverviewTab({ isAdmin, userId, onGeneratePackage }: {
  isAdmin: boolean;
  userId: number | undefined;
  onGeneratePackage: () => void;
}) {
  const [projectId, setProjectId] = useState("");

  const dashQuery = useProjectDashboard(projectId, isAdmin);
  const credQuery = useMyCredentials(userId, true);
  const flaggedSubsQuery = useFlaggedSubcontractors(isAdmin);

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

      {/* Admin only: Sign-off evidence by IHSA element */}
      {isAdmin && <SignoffElementPanel />}

      {/* Admin only: Audit Package History */}
      {isAdmin && (
        <PackageHistoryCard
          onGenerate={onGeneratePackage}
        />
      )}
    </div>
  );
}
