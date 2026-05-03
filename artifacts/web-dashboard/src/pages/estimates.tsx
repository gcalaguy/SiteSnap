import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { queryClient } from "@/lib/queryClient";
import { downloadEstimatePDF, downloadEstimateDocx, printEstimate } from "@/lib/estimateExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles, Upload, FileText, Trash2, Clock, ChevronDown, ChevronUp,
  AlertCircle, Loader2, X, HardHat, Hammer, Package, Wrench,
  TrendingUp, ArrowRight, FilePlus, RotateCcw, Info, Mic, MicOff,
  Download, Printer, Mail, FileDown,
} from "lucide-react";
import { format } from "date-fns";

type MaterialLine = { item: string; quantity: number; unit: string; unitCost: number; total: number };
type LaborLine = { trade: string; hours: number; hourlyRate: number; total: number };
type EquipmentLine = { item: string; days: number; dayRate: number; total: number };

type EstimateResult = {
  title?: string;
  summary?: string;
  materials?: MaterialLine[];
  labor?: LaborLine[];
  equipment?: EquipmentLine[];
  subtotal?: number;
  contingencyPct?: number;
  contingency?: number;
  totalLow?: number;
  totalHigh?: number;
  assumptions?: string[];
  notes?: string;
};

type Estimate = {
  id: number;
  title: string;
  scopeText: string | null;
  sourceType: string;
  sourceFilename: string | null;
  result: EstimateResult | null;
  status: string;
  createdAt: string;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function sumLines(lines: { total: number }[] | undefined) {
  return (lines ?? []).reduce((s, l) => s + (l.total ?? 0), 0);
}

// ── Estimate Result Display ────────────────────────────────────────────────────

function EstimateReport({ estimate }: { estimate: Estimate }) {
  const r = estimate.result ?? {};
  const materialsTotal = sumLines(r.materials);
  const laborTotal = sumLines(r.labor);
  const equipmentTotal = sumLines(r.equipment);
  const subtotal = r.subtotal ?? (materialsTotal + laborTotal + equipmentTotal);
  const contingency = r.contingency ?? Math.round(subtotal * ((r.contingencyPct ?? 10) / 100));
  const totalLow = r.totalLow ?? subtotal;
  const totalHigh = r.totalHigh ?? (subtotal + contingency);

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      {r.summary && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
          <p className="text-sm text-slate-700 leading-relaxed">{r.summary}</p>
        </div>
      )}

      {/* Cost summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Materials</p>
          <p className="text-lg font-bold text-slate-900">{fmt(materialsTotal)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Labour</p>
          <p className="text-lg font-bold text-slate-900">{fmt(laborTotal)}</p>
        </div>
        {equipmentTotal > 0 && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Equipment</p>
            <p className="text-lg font-bold text-slate-900">{fmt(equipmentTotal)}</p>
          </div>
        )}
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xs text-primary font-medium mb-1">Contingency ({r.contingencyPct ?? 10}%)</p>
          <p className="text-lg font-bold text-primary">{fmt(contingency)}</p>
        </div>
      </div>

      {/* Total range */}
      <div className="rounded-xl bg-[#172034] text-white p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Estimated Total Range (CAD)</p>
          <p className="text-3xl font-black text-[#FF6600]">{fmt(totalLow)}</p>
          <p className="text-sm text-slate-400 mt-0.5">to {fmt(totalHigh)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Subtotal</p>
          <p className="text-xl font-bold">{fmt(subtotal)}</p>
          <p className="text-xs text-slate-500 mt-1">excl. HST/GST</p>
        </div>
      </div>

      {/* Materials table */}
      {(r.materials ?? []).length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
            <Package className="h-4 w-4 text-primary" /> Materials
          </h3>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit Cost</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.materials!.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-medium">{m.item}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{m.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{m.unit}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(m.unitCost)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(m.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(materialsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Labour table */}
      {(r.labor ?? []).length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
            <HardHat className="h-4 w-4 text-blue-500" /> Labour
          </h3>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Trade / Role</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Hours</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Rate/hr</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.labor!.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-medium">{l.trade}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{l.hours}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(l.hourlyRate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(laborTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Equipment table */}
      {(r.equipment ?? []).length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
            <Wrench className="h-4 w-4 text-amber-500" /> Equipment
          </h3>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Equipment</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Days</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Day Rate</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.equipment!.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-medium">{e.item}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{e.days}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(e.dayRate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(e.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold">{fmt(equipmentTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Assumptions & Notes */}
      {((r.assumptions ?? []).length > 0 || r.notes) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          {(r.assumptions ?? []).length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                <Info className="h-3.5 w-3.5" /> Assumptions
              </h4>
              <ul className="space-y-1">
                {r.assumptions!.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.notes && (
            <div>
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Notes</h4>
              <p className="text-sm text-slate-600">{r.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History Card ───────────────────────────────────────────────────────────────

function HistoryCard({ estimate, onDelete, onView }: {
  estimate: Estimate;
  onDelete: (id: number) => void;
  onView: (e: Estimate) => void;
}) {
  const r = estimate.result ?? {};
  const totalLow = r.totalLow;
  const totalHigh = r.totalHigh;

  return (
    <div className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors rounded-lg border border-transparent hover:border-border">
      <div className="rounded-full bg-primary/10 p-2 shrink-0 mt-0.5">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{estimate.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span>{format(new Date(estimate.createdAt), "MMM d, yyyy")}</span>
              {estimate.sourceFilename && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <FileText className="h-3 w-3" /> {estimate.sourceFilename}
                  </span>
                </>
              )}
              {estimate.status === "ready" && totalLow != null && (
                <>
                  <span>·</span>
                  <span className="font-medium text-primary">
                    {fmt(totalLow)} – {fmt(totalHigh)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {estimate.status === "ready" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onView(estimate)}>
                View <ArrowRight className="h-3 w-3" />
              </Button>
            )}
            {estimate.status === "failed" && (
              <Badge variant="destructive" className="text-xs">Failed</Badge>
            )}
            {estimate.status === "generating" && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Generating
              </Badge>
            )}
            <button
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onDelete(estimate.id)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EstimatesPage() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { getToken } = useAuth();

  const voice = useVoiceRecorder((transcript) => {
    setScope((prev) => (prev ? `${prev.trimEnd()} ${transcript}` : transcript));
  });

  const [mode, setMode] = useState<"text" | "file">("text");
  const [scope, setScope] = useState("");
  const [hint, setHint] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeEstimate, setActiveEstimate] = useState<Estimate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [printing, setPrinting] = useState(false);

  const canAccess = me?.role === "owner" || me?.role === "foreman";

  const { data: estimates = [], isLoading } = useQuery<Estimate[]>({
    queryKey: ["estimates"],
    queryFn: () => customFetch("/api/estimates"),
    enabled: canAccess,
  });

  const deleteEstimate = useMutation({
    mutationFn: (id: number) => customFetch(`/api/estimates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast({ title: "Estimate deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  async function handleGenerate() {
    if (mode === "text") {
      if (scope.trim().length < 20) {
        toast({ title: "Please provide at least 20 characters of scope description", variant: "destructive" });
        return;
      }
      setIsGenerating(true);
      try {
        const result = await customFetch<Estimate>("/api/estimates/generate", {
          method: "POST",
          body: JSON.stringify({ scope }),
        });
        queryClient.invalidateQueries({ queryKey: ["estimates"] });
        setActiveEstimate(result);
        setScope("");
        toast({ title: "Estimate ready" });
      } catch (e: any) {
        toast({ title: e.message ?? "Generation failed", variant: "destructive" });
      } finally {
        setIsGenerating(false);
      }
    } else {
      if (!selectedFile) {
        toast({ title: "Please select a file", variant: "destructive" });
        return;
      }
      setIsGenerating(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (hint.trim()) formData.append("hint", hint.trim());

        const res = await fetch(`${BASE}/api/estimates/generate-from-file`, {
          method: "POST",
          body: formData,
          headers: { Authorization: `Bearer ${await fetchAuthToken()}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Generation failed");
        }
        const result: Estimate = await res.json();
        queryClient.invalidateQueries({ queryKey: ["estimates"] });
        setActiveEstimate(result);
        setSelectedFile(null);
        setHint("");
        toast({ title: "Estimate ready" });
      } catch (e: any) {
        toast({ title: e.message ?? "Generation failed", variant: "destructive" });
      } finally {
        setIsGenerating(false);
      }
    }
  }

  // Get auth token for raw multipart fetch (Clerk token)
  async function fetchAuthToken(): Promise<string | null> {
    try {
      return await getToken() ?? null;
    } catch { return null; }
  }

  async function handleSendEmail() {
    if (!activeEstimate || !emailTo.trim()) return;
    setIsSendingEmail(true);
    try {
      await customFetch(`/api/estimates/${activeEstimate.id}/email`, {
        method: "POST",
        body: JSON.stringify({ to: emailTo.trim(), message: emailMessage.trim() || undefined }),
      });
      toast({ title: "Estimate sent", description: `Delivered to ${emailTo.trim()}` });
      setEmailDialogOpen(false);
      setEmailTo("");
      setEmailMessage("");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("sandbox")) {
        toast({
          title: "Email sandbox restriction",
          description: "Resend is in sandbox mode — emails can only be sent to the verified account address. Verify a domain at resend.com to send freely.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to send email", description: msg, variant: "destructive" });
      }
    } finally {
      setIsSendingEmail(false);
    }
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-sm">The AI Estimating Engine is available to foremen and owners only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Estimating Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload plans or describe your scope — get instant materials, labour, and cost breakdowns
          </p>
        </div>
        {activeEstimate && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveEstimate(null)}>
            <FilePlus className="h-4 w-4" /> New Estimate
          </Button>
        )}
      </div>

      {activeEstimate ? (
        /* ── Active Estimate View ── */
        <div className="space-y-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold">{activeEstimate.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generated {format(new Date(activeEstimate.createdAt), "MMM d, yyyy 'at' h:mm a")}
                {activeEstimate.sourceFilename && ` · from ${activeEstimate.sourceFilename}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setActiveEstimate(null)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> New
            </Button>
          </div>

          {/* Export action bar */}
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs"
              disabled={exportingPdf}
              onClick={async () => {
                setExportingPdf(true);
                try { await downloadEstimatePDF(activeEstimate); }
                catch { toast({ title: "PDF export failed", variant: "destructive" }); }
                finally { setExportingPdf(false); }
              }}
            >
              {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-red-500" />}
              Save as PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs"
              disabled={exportingDocx}
              onClick={async () => {
                setExportingDocx(true);
                try { await downloadEstimateDocx(activeEstimate); }
                catch { toast({ title: "Word export failed", variant: "destructive" }); }
                finally { setExportingDocx(false); }
              }}
            >
              {exportingDocx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-blue-600" />}
              Save as Word
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs"
              disabled={printing}
              onClick={async () => {
                setPrinting(true);
                try { await printEstimate(activeEstimate); }
                catch { toast({ title: "Print failed", variant: "destructive" }); }
                finally { setPrinting(false); }
              }}
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 text-xs"
              onClick={() => setEmailDialogOpen(true)}
            >
              <Mail className="h-3.5 w-3.5 text-primary" />
              Email
            </Button>
          </div>

          <EstimateReport estimate={activeEstimate} />

          {/* Email dialog */}
          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" /> Email Estimate
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-md bg-muted/50 border border-border p-3">
                  <p className="text-xs text-muted-foreground font-medium truncate">{activeEstimate.title}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Recipient email address</label>
                  <Input
                    type="email"
                    placeholder="client@example.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && emailTo.trim()) handleSendEmail(); }}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Personal message <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Textarea
                    placeholder="Hi John, please find the estimate for the basement renovation attached below…"
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="min-h-[80px] resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
                <Button
                  className="gap-2 bg-primary text-white hover:bg-primary/90"
                  disabled={!emailTo.trim() || isSendingEmail}
                  onClick={handleSendEmail}
                >
                  {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Estimate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        /* ── Input Form ── */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-primary" />
                  Generate Estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      mode === "text" ? "bg-primary text-white" : "bg-transparent text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setMode("text")}
                  >
                    <FileText className="h-4 w-4" /> Type Scope
                  </button>
                  <button
                    className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      mode === "file" ? "bg-primary text-white" : "bg-transparent text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setMode("file")}
                  >
                    <Upload className="h-4 w-4" /> Upload Plans
                  </button>
                </div>

                {mode === "text" ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Textarea
                        placeholder={`Describe the project scope in detail. For example:\n\n"Renovate a 1,200 sq ft residential basement in Toronto. Scope includes: framing new walls to create 2 bedrooms and a bathroom, plumbing rough-in for bathroom (toilet, vanity, shower), electrical (15 pot lights, 8 outlets, panel sub-feed), drywall, insulation, LVP flooring throughout, and painting."`}
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                        className="min-h-[220px] resize-none text-sm pr-12"
                        disabled={voice.state === "transcribing"}
                      />
                      <button
                        type="button"
                        title={voice.state === "recording" ? "Stop recording" : "Dictate scope"}
                        onClick={voice.toggle}
                        disabled={voice.state === "transcribing"}
                        className={`absolute bottom-3 right-3 rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          voice.state === "recording"
                            ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                            : voice.state === "transcribing"
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        {voice.state === "transcribing" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : voice.state === "recording" ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {voice.state === "recording" && (
                      <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        Recording… tap the mic button to stop and transcribe
                      </p>
                    )}
                    {voice.state === "transcribing" && (
                      <p className="text-xs text-muted-foreground">Transcribing your voice…</p>
                    )}
                    {voice.error && (
                      <p className="text-xs text-destructive">{voice.error}</p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Be specific: include square footage, location (city/province), materials preferences, and special requirements for the most accurate estimate. Use the mic to dictate instead of typing.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* File drop zone */}
                    <div
                      className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        dragActive ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        const f = e.dataTransfer.files[0];
                        if (f) setSelectedFile(f);
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.heic"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                      />
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileText className="h-8 w-8 text-primary" />
                          <div className="text-left">
                            <p className="text-sm font-semibold">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Click to change
                            </p>
                          </div>
                          <button
                            className="ml-2 p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="h-10 w-10 text-slate-300" />
                          <p className="text-sm font-medium text-slate-600">
                            Drop plans here or <span className="text-primary">browse</span>
                          </p>
                          <p className="text-xs text-slate-400">PDF, Word, images (PNG/JPG), or text files — max 20 MB</p>
                        </div>
                      )}
                    </div>

                    {/* Optional hint */}
                    <Textarea
                      placeholder="Optional: Add context about the project (location, specific requirements, budget target...)"
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      className="min-h-[80px] resize-none text-sm"
                    />
                  </div>
                )}

                <Button
                  className="w-full gap-2 bg-primary hover:bg-primary/90 text-white"
                  onClick={handleGenerate}
                  disabled={isGenerating || (mode === "text" ? !scope.trim() : !selectedFile)}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analysing & Estimating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Estimate
                    </>
                  )}
                </Button>

                {isGenerating && (
                  <p className="text-xs text-center text-muted-foreground">
                    The AI is analysing your scope and building a detailed estimate — this usually takes 15–30 seconds.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tips sidebar */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="shadow-sm border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <TrendingUp className="h-4 w-4" /> What You'll Get
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  { icon: Package, label: "Materials", desc: "Line-by-line with quantities & unit costs" },
                  { icon: HardHat, label: "Labour", desc: "Hours per trade at Canadian market rates" },
                  { icon: Wrench, label: "Equipment", desc: "Rental days and rates where applicable" },
                  { icon: TrendingUp, label: "Cost Range", desc: "Tight budget to high estimate with contingency" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/15 p-1.5 shrink-0">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" /> Tips for Better Estimates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {[
                    "Include square footage and dimensions",
                    "Mention the city/province for accurate labour rates",
                    "Specify materials (e.g. LVP vs. tile vs. hardwood)",
                    "Note any special requirements or existing conditions",
                    "Upload a PDF or drawing for the highest accuracy",
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── History ── */}
      {estimates.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Past Estimates
              <Badge variant="secondary" className="ml-auto font-normal">{estimates.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {estimates.map((e) => (
                  <HistoryCard
                    key={e.id}
                    estimate={e}
                    onDelete={(id) => deleteEstimate.mutate(id)}
                    onView={setActiveEstimate}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
