import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useApproveTimesheet, useDenyTimesheet } from "@workspace/api-client-react";
import { format, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  AlertCircle, CalendarRange, Pencil, FileDown, Table2, Mail,
  Save, X, Loader2, Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOLD = "#C9A84C";
const BLACK = "#111111";

export type Timesheet = {
  id: number;
  userId: number;
  weekStart: string;
  status: "submitted" | "approved" | "denied";
  totalHours: string;
  hourlyRate: string | null;
  description: string | null;
  notes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  projectId?: number | null;
  user: { id: number; firstName: string | null; lastName: string | null; email: string; role: string } | null;
  reviewer: { id: number; firstName: string | null; lastName: string | null; email: string } | null;
};

type Person = { firstName?: string | null; lastName?: string | null; email?: string | null };
function workerName(u: Person | null) {
  if (!u) return "Unknown";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unknown";
}
function workerInitials(u: Person | null) {
  if (!u) return "?";
  if (u.firstName) return `${u.firstName[0]}${u.lastName?.[0] ?? ""}`.toUpperCase();
  return (u.email?.[0] ?? "?").toUpperCase();
}
function weekRange(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = addDays(start, 6);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}
function fmtCAD(v: string | number | null) {
  if (v == null) return null;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

const STATUS = {
  submitted: { label: "Pending Review", color: "#D97706", bg: "#FEF3C7", icon: AlertCircle },
  approved: { label: "Approved", color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  denied: { label: "Denied", color: "#DC2626", bg: "#FEE2E2", icon: XCircle },
};

// ── PDF export ────────────────────────────────────────────────────────────────
function exportPDF(ts: Timesheet) {
  const doc = new jsPDF();
  const name = workerName(ts.user);
  const range = weekRange(ts.weekStart);
  const statusCfg = STATUS[ts.status as keyof typeof STATUS] ?? STATUS.submitted;
  const totalPay = ts.hourlyRate
    ? parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate)
    : null;

  // Header banner
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, 210, 38, "F");
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(201, 168, 76);
  doc.text("SiteSnap", 14, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text("Weekly Timesheet", 14, 28);
  doc.text(range, 14, 35);

  // Status badge area
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 17, 17);
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(130, 8, 65, 20, 3, 3, "F");
  doc.text(statusCfg.label, 162, 21, { align: "center" });

  // Worker info
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 17, 17);
  doc.text(name, 14, 54);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`${ts.user?.role ?? "worker"} · ${ts.user?.email ?? ""}`, 14, 61);

  // Stats table
  const stats: [string, string][] = [
    ["Week", range],
    ["Total Hours", `${parseFloat(ts.totalHours).toFixed(1)} h`],
  ];
  if (ts.hourlyRate) stats.push(["Hourly Rate", fmtCAD(ts.hourlyRate) ?? ""]);
  if (totalPay != null) stats.push(["Total Pay", fmtCAD(totalPay) ?? ""]);
  stats.push(["Status", statusCfg.label]);
  stats.push(["Submitted", format(new Date(ts.submittedAt), "MMM d, yyyy 'at' h:mm a")]);
  if (ts.reviewer) stats.push(["Reviewed By", workerName(ts.reviewer)]);
  if (ts.reviewedAt) stats.push(["Reviewed On", format(new Date(ts.reviewedAt), "MMM d, yyyy")]);

  autoTable(doc, {
    startY: 70,
    head: [["Field", "Value"]],
    body: stats,
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [17, 17, 17], textColor: [201, 168, 76], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });

  const afterStats = (doc as any).lastAutoTable.finalY + 10;

  if (ts.description) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 17, 17);
    doc.text("Work Description", 14, afterStats);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(ts.description, 182);
    doc.text(lines, 14, afterStats + 7);
  }

  if (ts.notes) {
    const notesY = afterStats + (ts.description ? doc.splitTextToSize(ts.description, 182).length * 5 + 18 : 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 17, 17);
    doc.text(ts.status === "denied" ? "Denial Reason" : "Notes", 14, notesY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const noteLines = doc.splitTextToSize(ts.notes, 182);
    doc.text(noteLines, 14, notesY + 7);
  }

  // Footer
  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`Generated by SiteSnap · ${format(new Date(), "MMM d, yyyy")}`, 14, pageH - 10);

  doc.save(`timesheet_${name.replace(/\s+/g, "_")}_${ts.weekStart}.pdf`);
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(ts: Timesheet) {
  const name = workerName(ts.user);
  const totalPay = ts.hourlyRate
    ? (parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate)).toFixed(2)
    : null;

  const rows = [
    ["SiteSnap — Weekly Timesheet"],
    [],
    ["Worker", name],
    ["Role", ts.user?.role ?? ""],
    ["Email", ts.user?.email ?? ""],
    [],
    ["Week", weekRange(ts.weekStart)],
    ["Week Start", ts.weekStart],
    ["Status", STATUS[ts.status as keyof typeof STATUS]?.label ?? ts.status],
    ["Total Hours", parseFloat(ts.totalHours).toFixed(1)],
    ...(ts.hourlyRate ? [["Hourly Rate (CAD)", parseFloat(ts.hourlyRate).toFixed(2)]] : []),
    ...(totalPay ? [["Total Pay (CAD)", totalPay]] : []),
    [],
    ["Submitted", format(new Date(ts.submittedAt), "yyyy-MM-dd HH:mm")],
    ...(ts.reviewer ? [["Reviewed By", workerName(ts.reviewer)]] : []),
    ...(ts.reviewedAt ? [["Reviewed On", format(new Date(ts.reviewedAt), "yyyy-MM-dd")]] : []),
    [],
    ["Description", ts.description ?? ""],
    ["Notes", ts.notes ?? ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 40 }];

  // Style header
  if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14 } };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
  XLSX.writeFile(wb, `timesheet_${name.replace(/\s+/g, "_")}_${ts.weekStart}.xlsx`);
}

// ── Export ALL timesheets to Excel ────────────────────────────────────────────
function exportAllExcel(timesheets: Timesheet[]) {
  const header = ["Worker", "Role", "Email", "Week", "Status", "Total Hours", "Hourly Rate (CAD)", "Total Pay (CAD)", "Description", "Submitted", "Notes"];
  const rows = timesheets.map((ts) => {
    const name = workerName(ts.user);
    const totalPay = ts.hourlyRate ? parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate) : null;
    return [
      name,
      ts.user?.role ?? "",
      ts.user?.email ?? "",
      weekRange(ts.weekStart),
      STATUS[ts.status as keyof typeof STATUS]?.label ?? ts.status,
      parseFloat(ts.totalHours).toFixed(1),
      ts.hourlyRate ? parseFloat(ts.hourlyRate).toFixed(2) : "",
      totalPay != null ? totalPay.toFixed(2) : "",
      ts.description ?? "",
      format(new Date(ts.submittedAt), "yyyy-MM-dd HH:mm"),
      ts.notes ?? "",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map((_, i) => ({ wch: i === 8 || i === 10 ? 36 : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Timesheets");
  XLSX.writeFile(wb, `timesheets_export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

// ── TimesheetRow ──────────────────────────────────────────────────────────────
function TimesheetRow({
  ts,
  isPrivileged,
}: {
  ts: Timesheet;
  isPrivileged: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [denying, setDenying] = useState(false);
  const [denyNotes, setDenyNotes] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailTo, setEmailTo] = useState("");

  const [draft, setDraft] = useState({
    totalHours: "",
    hourlyRate: "",
    description: "",
    notes: "",
  });

  const statusCfg = STATUS[ts.status as keyof typeof STATUS] ?? STATUS.submitted;
  const StatusIcon = statusCfg.icon;
  const totalPay = ts.hourlyRate
    ? parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate)
    : null;
  const reviewerName = ts.reviewer ? workerName(ts.reviewer) : null;

  const approveTs = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
        toast({ title: "Timesheet approved" });
      },
      onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
    },
  });

  const denyTs = useDenyTimesheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
        setDenying(false);
        setDenyNotes("");
        toast({ title: "Timesheet denied" });
      },
      onError: () => toast({ title: "Failed to deny", variant: "destructive" }),
    },
  });

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch(`/api/timesheets/${ts.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setEditing(false);
      toast({ title: "Timesheet updated" });
    },
    onError: () => toast({ title: "Failed to update timesheet", variant: "destructive" }),
  });

  const emailMutation = useMutation({
    mutationFn: (to: string) =>
      customFetch(`/api/timesheets/${ts.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      }),
    onSuccess: () => {
      setEmailing(false);
      setEmailTo("");
      toast({ title: "Timesheet emailed successfully" });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Failed to send email";
      toast({ title: msg, variant: "destructive" });
    },
  });

  function handleStartEdit() {
    setDraft({
      totalHours: parseFloat(ts.totalHours).toString(),
      hourlyRate: ts.hourlyRate ? parseFloat(ts.hourlyRate).toString() : "",
      description: ts.description ?? "",
      notes: ts.notes ?? "",
    });
    setEditing(true);
    setExpanded(true);
  }

  function handleSaveEdit() {
    const h = parseFloat(draft.totalHours);
    if (isNaN(h) || h <= 0) {
      toast({ title: "Enter a valid number of hours", variant: "destructive" });
      return;
    }
    const body: Record<string, unknown> = { totalHours: h };
    const r = parseFloat(draft.hourlyRate);
    body.hourlyRate = draft.hourlyRate ? (isNaN(r) ? null : r) : null;
    body.description = draft.description || null;
    if (isPrivileged) body.notes = draft.notes || null;
    editMutation.mutate(body);
  }

  return (
    <div className="border-b last:border-b-0">
      {/* Row header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
        {/* Expand toggle */}
        <button
          onClick={() => { setExpanded((v) => !v); setEditing(false); setDenying(false); setEmailing(false); }}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <Avatar className="h-9 w-9 border shrink-0" style={{ borderColor: `${GOLD}40` }}>
            <AvatarFallback className="text-xs font-bold" style={{ background: `${GOLD}14`, color: GOLD }}>
              {workerInitials(ts.user)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{workerName(ts.user)}</span>
              <span className="text-xs text-muted-foreground capitalize">{ts.user?.role}</span>
              <Badge
                className="text-xs gap-1 border"
                style={{ background: `${statusCfg.color}12`, color: statusCfg.color, borderColor: `${statusCfg.color}30` }}
              >
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarRange className="h-3 w-3" /> {weekRange(ts.weekStart)}
              </span>
              <span className="text-xs font-semibold" style={{ color: GOLD }}>
                {parseFloat(ts.totalHours).toFixed(1)}h
              </span>
              {totalPay != null && (
                <span className="text-xs font-semibold text-muted-foreground">
                  {fmtCAD(totalPay)}
                </span>
              )}
            </div>
          </div>

          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {/* Quick action buttons (always visible) */}
        <div className="flex items-center gap-1 shrink-0">
          {isPrivileged && ts.status === "submitted" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                disabled={approveTs.isPending}
                onClick={() => approveTs.mutate({ timesheetId: ts.id, data: {} })}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => { setDenying(true); setExpanded(true); setEditing(false); }}
              >
                <XCircle className="h-3.5 w-3.5" />
                Deny
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-muted/20 border-t px-4 pb-4 pt-3 space-y-4">
          {/* Detail grid */}
          {!editing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Hours", value: `${parseFloat(ts.totalHours).toFixed(1)} h` },
                { label: "Hourly Rate", value: ts.hourlyRate ? `${fmtCAD(ts.hourlyRate)}/hr` : "—" },
                { label: "Total Pay", value: totalPay != null ? fmtCAD(totalPay) : "—" },
                { label: "Submitted", value: format(new Date(ts.submittedAt), "MMM d, yyyy") },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-background p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{label}</p>
                  <p className="text-sm font-bold">{value}</p>
                </div>
              ))}
            </div>
          )}

          {!editing && ts.description && (
            <div className="rounded-lg border bg-background p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Work Description</p>
              <p className="text-sm leading-relaxed">{ts.description}</p>
            </div>
          )}

          {!editing && ts.notes && (
            <div className="rounded-lg border bg-background p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                {ts.status === "denied" ? "Denial Reason" : "Notes"}
              </p>
              <p className="text-sm leading-relaxed">{ts.notes}</p>
            </div>
          )}

          {!editing && reviewerName && ts.status !== "submitted" && (
            <p className="text-xs text-muted-foreground">
              {ts.status === "approved" ? "Approved" : "Denied"} by {reviewerName}
              {ts.reviewedAt ? ` on ${format(new Date(ts.reviewedAt), "MMM d, yyyy")}` : ""}
            </p>
          )}

          {/* ── Deny form ── */}
          {denying && !editing && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-sm font-medium text-red-800">Deny this timesheet?</p>
              <Textarea
                placeholder="Reason for denial (optional)…"
                value={denyNotes}
                onChange={(e) => setDenyNotes(e.target.value)}
                className="text-sm h-20 resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={denyTs.isPending}
                  onClick={() => denyTs.mutate({ timesheetId: ts.id, data: { notes: denyNotes || undefined } })}
                >
                  {denyTs.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Denial"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setDenying(false); setDenyNotes(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── Edit form ── */}
          {editing && (
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <p className="text-sm font-semibold">Edit Timesheet</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Total Hours *</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.totalHours}
                    onChange={(e) => setDraft((d) => ({ ...d, totalHours: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Hourly Rate (CAD)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.hourlyRate}
                    onChange={(e) => setDraft((d) => ({ ...d, hourlyRate: e.target.value }))}
                    placeholder="e.g. 35.00"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Work Description</label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="What did the worker do this week?"
                  className="text-sm h-20 resize-none"
                />
              </div>
              {isPrivileged && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (internal)</label>
                  <Textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="Internal notes…"
                    className="text-sm h-16 resize-none"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={editMutation.isPending}
                  onClick={handleSaveEdit}
                  style={{ background: GOLD, color: BLACK }}
                >
                  {editMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Changes</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── Email form ── */}
          {emailing && !editing && (
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <p className="text-sm font-semibold">Email Timesheet</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="recipient@company.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="h-8 text-sm flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") emailMutation.mutate(emailTo.trim()); }}
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={!emailTo.trim() || emailMutation.isPending}
                  onClick={() => emailMutation.mutate(emailTo.trim())}
                  style={{ background: GOLD, color: BLACK }}
                >
                  {emailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEmailing(false); setEmailTo(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Action bar ── */}
          {!editing && !denying && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportPDF(ts)}
              >
                <FileDown className="h-3 w-3" /> Save PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportExcel(ts)}
              >
                <Table2 className="h-3 w-3" /> Save Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => { setEmailing((v) => !v); setEmailTo(""); }}
              >
                <Mail className="h-3 w-3" /> Email
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
type Props = {
  timesheets: Timesheet[];
  isLoading: boolean;
  members: any[];
  isPrivileged: boolean;
  me: any;
  tsStatusFilter: "all" | "submitted" | "approved" | "denied";
  setTsStatusFilter: (v: "all" | "submitted" | "approved" | "denied") => void;
  tsWorkerFilter: string;
  setTsWorkerFilter: (v: string) => void;
};

export default function TimesheetSection({
  timesheets,
  isLoading,
  members,
  isPrivileged,
  tsStatusFilter,
  setTsStatusFilter,
  tsWorkerFilter,
  setTsWorkerFilter,
}: Props) {
  return (
    <div className="mt-2">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" style={{ color: GOLD }} />
            Timesheets
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Weekly submissions from the mobile app — review, edit, and export
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Worker filter */}
          <select
            value={tsWorkerFilter}
            onChange={(e) => setTsWorkerFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Workers</option>
            {members?.map((m) => {
              const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email;
              return <option key={m.id} value={String(m.id)}>{name}</option>;
            })}
          </select>

          {/* Status pills */}
          <div className="flex items-center gap-1.5">
            {(["all", "submitted", "approved", "denied"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setTsStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  tsStatusFilter === s
                    ? "text-white border-transparent"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
                style={tsStatusFilter === s ? { background: GOLD, borderColor: GOLD } : undefined}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="ml-1 opacity-70">
                  ({s === "all" ? timesheets.length : timesheets.filter((t) => t.status === s).length})
                </span>
              </button>
            ))}
          </div>

          {/* Export all */}
          {timesheets.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => exportAllExcel(timesheets)}
              title="Export all visible timesheets to Excel"
            >
              <Download className="h-3.5 w-3.5" />
              Export All
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading timesheets…
            </div>
          ) : timesheets.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">
                {tsStatusFilter === "submitted"
                  ? "No pending timesheets to review."
                  : "No timesheets found."}
              </p>
              <p className="text-xs text-muted-foreground">
                Workers submit timesheets from the mobile app under each project's Timesheets tab.
              </p>
            </div>
          ) : (
            <div>
              {timesheets.map((ts) => (
                <TimesheetRow
                  key={ts.id}
                  ts={ts as Timesheet}
                  isPrivileged={isPrivileged}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
