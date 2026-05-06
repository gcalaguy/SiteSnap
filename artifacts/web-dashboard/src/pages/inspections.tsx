import { useState } from "react";
import { useGetMe, useListProjects, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, AlertTriangle, CheckCircle, Clock, ShieldAlert, Eye, X,
  Bell, BellOff, ChevronDown, ChevronUp, Trash2, Loader2, ClipboardList,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type InspectionItemDraft = {
  itemName: string;
  status: "pass" | "fail" | "na";
  severity: "low" | "medium" | "high";
  comment: string;
};

type Inspection = {
  id: number;
  companyId: number;
  projectId?: number | null;
  inspectorId: number;
  inspectionType: string;
  date: string;
  score?: number | null;
  status: "draft" | "submitted";
  aiSummary?: string | null;
  riskLevel?: string | null;
  riskScore?: string | null;
  failedItemAnalysis?: string | null;
  createdAt: string;
};

type InspectionRow = {
  inspection: Inspection;
  project?: { id: number; name: string } | null;
  inspector?: { id: number; firstName: string; lastName: string } | null;
};

type InspectionDetail = InspectionRow & {
  items: { id: number; itemName: string; status: string; severity: string; comment?: string | null }[];
};

type InspectionAlert = {
  id: number;
  inspectionId: number;
  type: string;
  message: string;
  severity: string;
  isRead: boolean;
  createdAt: string;
  alert: { id: number; type: string; message: string; severity: string; isRead: boolean; createdAt: string };
  project?: { id: number; name: string } | null;
  inspection?: { id: number; inspectionType: string; date: string } | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Low:      { color: "#16a34a", bg: "#dcfce7", label: "Low" },
  Medium:   { color: "#ca8a04", bg: "#fef9c3", label: "Medium" },
  High:     { color: "#ea580c", bg: "#ffedd5", label: "High" },
  Critical: { color: "#dc2626", bg: "#fee2e2", label: "Critical" },
};

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  low:    { color: "#6b7280", label: "Low" },
  medium: { color: "#ca8a04", label: "Medium" },
  high:   { color: "#dc2626", label: "High" },
};

const INSPECTION_TYPES = ["general", "safety", "quality", "progress", "electrical", "structural", "fire", "environmental"];

const DEFAULT_ITEMS: InspectionItemDraft[] = [
  { itemName: "PPE compliance", status: "pass", severity: "high", comment: "" },
  { itemName: "Site housekeeping", status: "pass", severity: "low", comment: "" },
  { itemName: "Equipment safety", status: "pass", severity: "high", comment: "" },
  { itemName: "Fall protection", status: "pass", severity: "high", comment: "" },
  { itemName: "Fire extinguisher accessible", status: "pass", severity: "medium", comment: "" },
];

// ── Risk Badge ─────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-xs text-muted-foreground">Pending</span>;
  const cfg = RISK_CONFIG[level] ?? RISK_CONFIG.Low;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {level}
    </span>
  );
}

// ── Alerts Panel ───────────────────────────────────────────────────────────────

function AlertsPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const { toast } = useToast();

  const { data: alertRows = [] } = useQuery<InspectionAlert[]>({
    queryKey: ["inspection-alerts"],
    queryFn: () => customFetch("/api/inspection-alerts"),
    refetchInterval: 30_000,
  });

  const unread = alertRows.filter((r) => !r.alert?.isRead && !(r as any).isRead);

  const markOne = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inspection-alerts/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection-alerts"] }),
  });

  const markAll = useMutation({
    mutationFn: () => customFetch("/api/inspection-alerts/read-all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspection-alerts"] });
      toast({ title: "All alerts marked as read" });
    },
  });

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...alertRows].sort((a, b) => {
    const sa = (a.alert?.severity ?? (a as any).severity) as string;
    const sb = (b.alert?.severity ?? (b as any).severity) as string;
    return (severityOrder[sa] ?? 9) - (severityOrder[sb] ?? 9);
  });

  if (alertRows.length === 0) return null;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden mb-4">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-orange-100 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-orange-600" />
          <span className="font-semibold text-orange-800 text-sm">
            Inspection Alerts
          </span>
          {unread.length > 0 && (
            <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unread.length} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-orange-700"
              onClick={(e) => { e.stopPropagation(); markAll.mutate(); }}
            >
              Mark all read
            </Button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-orange-600" /> : <ChevronDown className="h-4 w-4 text-orange-600" />}
        </div>
      </div>
      {expanded && (
        <div className="divide-y divide-orange-100 max-h-60 overflow-y-auto">
          {sorted.map((row) => {
            const alertData = row.alert ?? (row as any);
            const sev = alertData.severity as string;
            const isRead = alertData.isRead;
            const sevCfg = {
              critical: { color: "#dc2626", label: "Critical" },
              high:     { color: "#ea580c", label: "High" },
              medium:   { color: "#ca8a04", label: "Medium" },
              low:      { color: "#6b7280", label: "Low" },
            }[sev] ?? { color: "#6b7280", label: sev };
            return (
              <div
                key={alertData.id}
                className={`flex items-start gap-3 px-4 py-3 ${isRead ? "opacity-60" : ""}`}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: sevCfg.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded"
                      style={{ color: sevCfg.color, backgroundColor: `${sevCfg.color}18` }}
                    >
                      {sevCfg.label}
                    </span>
                    {row.inspection && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {row.inspection.inspectionType} · {row.inspection.date}
                      </span>
                    )}
                    {row.project && (
                      <span className="text-xs text-muted-foreground">{row.project.name}</span>
                    )}
                  </div>
                  <p className="text-sm text-orange-900 mt-0.5">{alertData.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(alertData.createdAt), "MMM d, h:mm a")}
                  </p>
                </div>
                {!isRead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={() => markOne.mutate(alertData.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Detail Modal ───────────────────────────────────────────────────────────────

function DetailModal({ row, onClose }: { row: InspectionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isLoading } = useQuery<InspectionDetail>({
    queryKey: ["inspection", row.inspection.id],
    queryFn: () => customFetch(`/api/inspections/${row.inspection.id}`),
  });

  const submit = useMutation({
    mutationFn: () => customFetch(`/api/inspections/${row.inspection.id}/submit`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections"] });
      qc.invalidateQueries({ queryKey: ["inspection", row.inspection.id] });
      toast({ title: "Inspection submitted", description: "AI analysis is running in the background." });
    },
  });

  const insp = detail?.inspection ?? row.inspection;
  const risk = RISK_CONFIG[insp.riskLevel ?? ""] ?? null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {insp.inspectionType.charAt(0).toUpperCase() + insp.inspectionType.slice(1)} Inspection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Date</span>
              <p className="font-medium">{insp.date}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium capitalize">{insp.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Inspector</span>
              <p className="font-medium">{detail?.inspector ? `${detail.inspector.firstName} ${detail.inspector.lastName}` : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Project</span>
              <p className="font-medium">{detail?.project?.name ?? "No project"}</p>
            </div>
            {insp.score != null && (
              <div>
                <span className="text-muted-foreground">Score</span>
                <p className="font-bold text-lg">{insp.score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
              </div>
            )}
            {insp.riskLevel && (
              <div>
                <span className="text-muted-foreground">Risk Level</span>
                <div className="mt-0.5"><RiskBadge level={insp.riskLevel} /></div>
              </div>
            )}
          </div>

          {/* Risk Score Bar */}
          {insp.riskScore && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Risk Score</span>
                <span>{insp.riskScore}/10</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(parseFloat(insp.riskScore) / 10) * 100}%`,
                    backgroundColor: risk?.color ?? "#6b7280",
                  }}
                />
              </div>
            </div>
          )}

          {/* AI Summary */}
          {insp.aiSummary && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <span className="text-primary">✦</span> AI Summary
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{insp.aiSummary}</p>
            </div>
          )}

          {/* Failed Item Analysis */}
          {insp.failedItemAnalysis && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-100">
              <h3 className="text-sm font-semibold mb-2 text-red-800 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Failed Item Analysis
              </h3>
              <p className="text-sm text-red-700 whitespace-pre-wrap">{insp.failedItemAnalysis}</p>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Checklist Items */}
          {detail?.items && detail.items.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Checklist Items ({detail.items.length})</h3>
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    {item.status === "pass" && <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />}
                    {item.status === "fail" && <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />}
                    {item.status === "na" && <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{item.itemName}</span>
                        {item.status === "fail" && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ color: SEVERITY_CONFIG[item.severity]?.color, backgroundColor: `${SEVERITY_CONFIG[item.severity]?.color}18` }}
                          >
                            {SEVERITY_CONFIG[item.severity]?.label} severity
                          </span>
                        )}
                      </div>
                      {item.comment && <p className="text-xs text-muted-foreground mt-0.5">{item.comment}</p>}
                    </div>
                    <span className={`text-xs font-medium capitalize px-1.5 py-0.5 rounded ${item.status === "pass" ? "text-green-700 bg-green-100" : item.status === "fail" ? "text-red-700 bg-red-100" : "text-gray-600 bg-gray-100"}`}>
                      {item.status === "na" ? "N/A" : item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit draft */}
          {insp.status === "draft" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
              <p className="text-sm text-yellow-800">This inspection is a draft. Submit to trigger AI analysis.</p>
              <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── New Inspection Modal ───────────────────────────────────────────────────────

function NewInspectionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects = [] } = useListProjects();

  const [projectId, setProjectId] = useState<string>("");
  const [inspectionType, setInspectionType] = useState("safety");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitNow, setSubmitNow] = useState(true);
  const [items, setItems] = useState<InspectionItemDraft[]>(DEFAULT_ITEMS.map((i) => ({ ...i })));

  const addItem = () => setItems((prev) => [...prev, { itemName: "", status: "pass", severity: "low", comment: "" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InspectionItemDraft, value: string) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const create = useMutation({
    mutationFn: (data: object) => customFetch("/api/inspections", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections"] });
      qc.invalidateQueries({ queryKey: ["inspection-alerts"] });
      toast({ title: submitNow ? "Inspection submitted — AI analysis running" : "Draft saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e?.message, variant: "destructive" }),
  });

  const validItems = items.filter((i) => i.itemName.trim());

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Inspection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Inspection Type</Label>
              <Select value={inspectionType} onValueChange={setInspectionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSPECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No project</SelectItem>
                {(projects as any[]).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Checklist Items ({validItems.length})</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Item name (e.g. PPE compliance)"
                      value={item.itemName}
                      onChange={(e) => updateItem(i, "itemName", e.target.value)}
                      className="flex-1 h-8 text-sm"
                    />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => removeItem(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={item.status} onValueChange={(v) => updateItem(i, "status", v)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">Pass ✓</SelectItem>
                        <SelectItem value="fail">Fail ✗</SelectItem>
                        <SelectItem value="na">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={item.severity} onValueChange={(v) => updateItem(i, "severity", v)} disabled={item.status !== "fail"}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low severity</SelectItem>
                        <SelectItem value="medium">Medium severity</SelectItem>
                        <SelectItem value="high">High severity</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Note..."
                      value={item.comment}
                      onChange={(e) => updateItem(i, "comment", e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit or draft */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <input
              type="checkbox"
              id="submit-now"
              checked={submitNow}
              onChange={(e) => setSubmitNow(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="submit-now" className="text-sm cursor-pointer">
              Submit now (triggers AI analysis & alerts) — uncheck to save as draft
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              create.mutate({
                projectId: projectId ? parseInt(projectId) : null,
                inspectionType,
                date,
                items: validItems,
                submit: submitNow,
              })
            }
            disabled={create.isPending || validItems.length === 0}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitNow ? "Submit Inspection" : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InspectionsPage() {
  const { data: me } = useGetMe();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<InspectionRow | null>(null);
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: rows = [], isLoading } = useQuery<InspectionRow[]>({
    queryKey: ["inspections"],
    queryFn: () => customFetch("/api/inspections"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Inspections
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered site inspections with automatic risk scoring and alerts
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Inspection
        </Button>
      </div>

      {/* Alerts Panel (owners/foremen only) */}
      {isOwnerOrForeman && <AlertsPanel />}

      {/* Inspection List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-muted-foreground">No inspections yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create your first inspection to get started</p>
            <Button className="mt-4" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Inspection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Inspector</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Risk</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const insp = row.inspection;
                return (
                  <tr key={insp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 capitalize font-medium">{insp.inspectionType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.project?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.inspector ? `${row.inspector.firstName} ${row.inspector.lastName}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {insp.score != null ? (
                        <span className={`font-semibold ${insp.score >= 80 ? "text-green-700" : insp.score >= 60 ? "text-yellow-700" : "text-red-700"}`}>
                          {insp.score}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3"><RiskBadge level={insp.riskLevel} /></td>
                    <td className="px-4 py-3">
                      <Badge variant={insp.status === "submitted" ? "default" : "secondary"} className="capitalize text-xs">
                        {insp.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewInspectionModal onClose={() => setShowNew(false)} />}
      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
