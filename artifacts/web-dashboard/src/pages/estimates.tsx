import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { queryClient } from "@/lib/queryClient";
import { downloadEstimatePDF, downloadEstimateDocx, printEstimate, type CompanyInfo } from "@/lib/estimateExport";
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
  Download, Printer, Mail, FileDown, Pencil, Save, Plus, Building2,
} from "lucide-react";
import { format } from "date-fns";

type MaterialLine = { item: string; quantity: number; unit: string; unitCost: number; total: number };
type LaborLine = { trade: string; hours: number; hourlyRate: number; total: number };
type EquipmentLine = { item: string; days: number; dayRate: number; total: number };

type EstimateResult = {
  title?: string;
  summary?: string | SmartSummary;
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
  // Smart Estimator format
  lineItems?: SmartLineItem[];
  costModelUsed?: unknown;
};

type SmartSummary = {
  laborTotal: number; materialsTotal: number; addonsTotal: number;
  overhead: number; overheadPct: number; subtotal: number;
  contingency: number; contingencyPct: number;
  totalLow: number; totalHigh: number;
  priceToClient: number; suggestedMarginPct: number; suggestedMarginAmount: number;
};

type SmartLineItem = {
  id: string; label: string; category: "labour" | "materials" | "addon" | "overhead";
  total: number; quantity?: number; unit?: string; unitCost?: number;
  hours?: number; rate?: number; overheadPct?: number;
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
  const r = estimate.result ?? {} as EstimateResult;

  // Detect Smart Estimator format: result.summary is a pricing object, not a string
  const isSmartEst = r.summary !== null && typeof r.summary === "object" && "priceToClient" in (r.summary as object);
  const smart = isSmartEst ? r.summary as SmartSummary : null;
  const smartLines = isSmartEst ? (r.lineItems ?? []) : [];
  const summaryText = !isSmartEst && typeof r.summary === "string" ? r.summary : null;

  const materialsTotal = smart ? smart.materialsTotal : sumLines(r.materials);
  const laborTotal     = smart ? smart.laborTotal     : sumLines(r.labor);
  const equipmentTotal = smart ? 0                    : sumLines(r.equipment);
  const addonsTotal    = smart ? smart.addonsTotal    : 0;
  const overhead       = smart ? smart.overhead       : 0;
  const subtotal       = smart ? smart.subtotal       : (r.subtotal ?? (materialsTotal + laborTotal + equipmentTotal));
  const contingency    = smart ? smart.contingency    : (r.contingency ?? Math.round(subtotal * ((r.contingencyPct ?? 10) / 100)));
  const totalLow       = smart ? smart.totalLow       : (r.totalLow ?? subtotal);
  const totalHigh      = smart ? smart.priceToClient  : (r.totalHigh ?? (subtotal + contingency));

  return (
    <div className="space-y-5">
      {/* Summary banner — only for AI estimator text summaries */}
      {summaryText && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{summaryText}</p>
        </div>
      )}

      {/* Cost summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Materials</p>
          <p className="text-lg font-bold text-foreground">{fmt(materialsTotal)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Labour</p>
          <p className="text-lg font-bold text-foreground">{fmt(laborTotal)}</p>
        </div>
        {equipmentTotal > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Equipment</p>
            <p className="text-lg font-bold text-foreground">{fmt(equipmentTotal)}</p>
          </div>
        )}
        {addonsTotal > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Add-ons</p>
            <p className="text-lg font-bold text-foreground">{fmt(addonsTotal)}</p>
          </div>
        )}
        {overhead > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Overhead ({smart?.overheadPct ?? 0}%)</p>
            <p className="text-lg font-bold text-foreground">{fmt(overhead)}</p>
          </div>
        )}
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xs text-primary font-medium mb-1">Contingency ({smart?.contingencyPct ?? r.contingencyPct ?? 10}%)</p>
          <p className="text-lg font-bold text-primary">{fmt(contingency)}</p>
        </div>
      </div>

      {/* Total range */}
      <div className="rounded-xl bg-[#0A0A0A] text-white p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">
            {smart ? "Price to Client (CAD)" : "Estimated Total Range (CAD)"}
          </p>
          <p className="text-3xl font-black text-[#D4AF37]">{fmt(totalLow)}</p>
          {!smart && <p className="text-sm text-muted-foreground/70 mt-0.5">to {fmt(totalHigh)}</p>}
          {smart && smart.suggestedMarginPct > 0 && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">incl. {smart.suggestedMarginPct}% margin</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground/70">Subtotal</p>
          <p className="text-xl font-bold">{fmt(subtotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">excl. HST/GST</p>
        </div>
      </div>

      {/* Smart Estimator line items table */}
      {smartLines.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <TrendingUp className="h-4 w-4 text-primary" /> Line Items
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Category</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {smartLines.map((li, i) => (
                  <tr key={li.id ?? i} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{li.label}</td>
                    <td className="px-3 py-2.5 text-muted-foreground capitalize">{li.category}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Materials table */}
      {(r.materials ?? []).length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Package className="h-4 w-4 text-primary" /> Materials
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit Cost</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {r.materials!.map((m, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{m.item}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{m.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{m.unit}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(m.unitCost)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(m.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t border-border">
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
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <HardHat className="h-4 w-4 text-blue-500" /> Labour
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Trade / Role</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Hours</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Rate/hr</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {r.labor!.map((l, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{l.trade}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{l.hours}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(l.hourlyRate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t border-border">
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
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Wrench className="h-4 w-4 text-amber-500" /> Equipment
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Equipment</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Days</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Day Rate</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {r.equipment!.map((e, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{e.item}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{e.days}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(e.dayRate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(e.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t border-border">
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
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          {(r.assumptions ?? []).length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <Info className="h-3.5 w-3.5" /> Assumptions
              </h4>
              <ul className="space-y-1">
                {r.assumptions!.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground">{r.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Estimate Editor ────────────────────────────────────────────────────────────

function EstimateEditor({
  estimate,
  company,
  onSave,
  onCancel,
}: {
  estimate: Estimate;
  company?: CompanyInfo & { id?: number };
  onSave: (updated: Estimate) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const r = estimate.result ?? {};

  const [title, setTitle] = useState(estimate.title);
  const [summary, setSummary] = useState(typeof r.summary === "string" ? r.summary : "");
  const [materials, setMaterials] = useState<MaterialLine[]>(r.materials ?? []);
  const [labor, setLabor] = useState<LaborLine[]>(r.labor ?? []);
  const [equipment, setEquipment] = useState<EquipmentLine[]>(r.equipment ?? []);
  const [contingencyPct, setContingencyPct] = useState(r.contingencyPct ?? 10);
  const [notes, setNotes] = useState(r.notes ?? "");
  const [assumptions, setAssumptions] = useState<string[]>(r.assumptions ?? []);
  const [isSaving, setIsSaving] = useState(false);

  // Company detail fields
  const [coName, setCoName] = useState(company?.name ?? "");
  const [coPhone, setCoPhone] = useState(company?.phone ?? "");
  const [coAddress, setCoAddress] = useState(company?.address ?? "");
  const [coCity, setCoCity] = useState(company?.city ?? "");
  const [coProvince, setCoProvince] = useState(company?.province ?? "");
  const [coWebsite, setCoWebsite] = useState(company?.website ?? "");
  const [coHst, setCoHst] = useState(company?.hstNumber ?? "");

  function updateMaterial(i: number, field: keyof MaterialLine, raw: string) {
    setMaterials((prev) =>
      prev.map((m, idx) => {
        if (idx !== i) return m;
        const val = field === "item" || field === "unit" ? raw : parseFloat(raw) || 0;
        const updated = { ...m, [field]: val };
        if (field === "quantity" || field === "unitCost") {
          const qty = field === "quantity" ? (parseFloat(raw) || 0) : m.quantity;
          const uc = field === "unitCost" ? (parseFloat(raw) || 0) : m.unitCost;
          updated.total = Math.round(qty * uc);
        }
        return updated;
      })
    );
  }

  function updateLabor(i: number, field: keyof LaborLine, raw: string) {
    setLabor((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const val = field === "trade" ? raw : parseFloat(raw) || 0;
        const updated = { ...l, [field]: val };
        if (field === "hours" || field === "hourlyRate") {
          const h = field === "hours" ? (parseFloat(raw) || 0) : l.hours;
          const r = field === "hourlyRate" ? (parseFloat(raw) || 0) : l.hourlyRate;
          updated.total = Math.round(h * r);
        }
        return updated;
      })
    );
  }

  function updateEquipment(i: number, field: keyof EquipmentLine, raw: string) {
    setEquipment((prev) =>
      prev.map((e, idx) => {
        if (idx !== i) return e;
        const val = field === "item" ? raw : parseFloat(raw) || 0;
        const updated = { ...e, [field]: val };
        if (field === "days" || field === "dayRate") {
          const d = field === "days" ? (parseFloat(raw) || 0) : e.days;
          const dr = field === "dayRate" ? (parseFloat(raw) || 0) : e.dayRate;
          updated.total = Math.round(d * dr);
        }
        return updated;
      })
    );
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      // Save company details if changed
      const companyChanged =
        coName !== (company?.name ?? "") ||
        coPhone !== (company?.phone ?? "") ||
        coAddress !== (company?.address ?? "") ||
        coCity !== (company?.city ?? "") ||
        coProvince !== (company?.province ?? "") ||
        coWebsite !== (company?.website ?? "") ||
        coHst !== (company?.hstNumber ?? "");

      if (companyChanged && company?.id) {
        await customFetch(`/api/companies/${company.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: coName,
            phone: coPhone,
            address: coAddress,
            city: coCity,
            province: coProvince,
            website: coWebsite,
            hstNumber: coHst,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["me"] });
      }

      const matTotal = sumLines(materials);
      const labTotal = sumLines(labor);
      const equTotal = sumLines(equipment);
      const subtotal = matTotal + labTotal + equTotal;
      const contingency = Math.round(subtotal * (contingencyPct / 100));
      const totalLow = subtotal;
      const totalHigh = Math.round(subtotal + contingency + subtotal * 0.15);

      const result = {
        ...r,
        summary,
        materials,
        labor,
        equipment,
        subtotal,
        contingencyPct,
        contingency,
        totalLow,
        totalHigh,
        notes,
        assumptions,
      };

      const updated = await customFetch<Estimate>(`/api/estimates/${estimate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, result }),
      });

      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      onSave(updated);
      toast({ title: "Estimate saved" });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  const cellInput = "h-7 text-xs border-transparent focus:border-input px-2 rounded-none";

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimate Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-semibold" />
      </div>

      {/* Company Details */}
      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4 text-blue-500" /> Company Details
          <span className="ml-1 text-xs font-normal text-muted-foreground">(shown on all exports)</span>
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Company Name</label>
            <Input value={coName} onChange={(e) => setCoName(e.target.value)} className="h-8 text-sm" placeholder="Acme Construction Inc." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <Input value={coPhone} onChange={(e) => setCoPhone(e.target.value)} className="h-8 text-sm" placeholder="(416) 555-0100" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Street Address</label>
            <Input value={coAddress} onChange={(e) => setCoAddress(e.target.value)} className="h-8 text-sm" placeholder="123 Main St" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Input value={coCity} onChange={(e) => setCoCity(e.target.value)} className="h-8 text-sm" placeholder="Toronto" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Province</label>
            <Input value={coProvince} onChange={(e) => setCoProvince(e.target.value)} className="h-8 text-sm" placeholder="ON" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Website</label>
            <Input value={coWebsite} onChange={(e) => setCoWebsite(e.target.value)} className="h-8 text-sm" placeholder="www.example.ca" />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">HST / GST Registration #</label>
            <Input value={coHst} onChange={(e) => setCoHst(e.target.value)} className="h-8 text-sm" placeholder="123456789 RT0001" />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="resize-none text-sm min-h-[72px]" />
      </div>

      {/* Materials */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Package className="h-4 w-4 text-primary" /> Materials
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setMaterials((p) => [...p, { item: "", quantity: 1, unit: "ea", unitCost: 0, total: 0 }])}>
            <Plus className="h-3 w-3" /> Add Row
          </Button>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Item</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-16">Qty</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-16">Unit</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-24">Unit Cost</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {materials.map((m, i) => (
                <tr key={i}>
                  <td className="px-1 py-0.5">
                    <Input value={m.item} onChange={(e) => updateMaterial(i, "item", e.target.value)} className={cellInput} placeholder="Item name" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={m.quantity} onChange={(e) => updateMaterial(i, "quantity", e.target.value)} className={`${cellInput} text-right w-16`} />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input value={m.unit} onChange={(e) => updateMaterial(i, "unit", e.target.value)} className={`${cellInput} text-right w-16`} />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={m.unitCost} onChange={(e) => updateMaterial(i, "unitCost", e.target.value)} className={`${cellInput} text-right w-24`} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-xs">{fmt(m.total)}</td>
                  <td className="pr-1">
                    <button onClick={() => setMaterials((p) => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {materials.length > 0 && (
              <tfoot className="bg-muted/30 border-t border-border">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold text-sm">{fmt(sumLines(materials))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Labour */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HardHat className="h-4 w-4 text-blue-500" /> Labour
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setLabor((p) => [...p, { trade: "", hours: 8, hourlyRate: 60, total: 0 }])}>
            <Plus className="h-3 w-3" /> Add Row
          </Button>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Trade / Role</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-16">Hours</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-24">Rate/hr</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {labor.map((l, i) => (
                <tr key={i}>
                  <td className="px-1 py-0.5">
                    <Input value={l.trade} onChange={(e) => updateLabor(i, "trade", e.target.value)} className={cellInput} placeholder="Trade or role" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={l.hours} onChange={(e) => updateLabor(i, "hours", e.target.value)} className={`${cellInput} text-right w-16`} />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={l.hourlyRate} onChange={(e) => updateLabor(i, "hourlyRate", e.target.value)} className={`${cellInput} text-right w-24`} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-xs">{fmt(l.total)}</td>
                  <td className="pr-1">
                    <button onClick={() => setLabor((p) => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {labor.length > 0 && (
              <tfoot className="bg-muted/30 border-t border-border">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold text-sm">{fmt(sumLines(labor))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Equipment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wrench className="h-4 w-4 text-amber-500" /> Equipment
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEquipment((p) => [...p, { item: "", days: 1, dayRate: 0, total: 0 }])}>
            <Plus className="h-3 w-3" /> Add Row
          </Button>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Equipment</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-16">Days</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-24">Day Rate</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {equipment.map((e, i) => (
                <tr key={i}>
                  <td className="px-1 py-0.5">
                    <Input value={e.item} onChange={(ev) => updateEquipment(i, "item", ev.target.value)} className={cellInput} placeholder="Equipment name" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={e.days} onChange={(ev) => updateEquipment(i, "days", ev.target.value)} className={`${cellInput} text-right w-16`} />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={e.dayRate} onChange={(ev) => updateEquipment(i, "dayRate", ev.target.value)} className={`${cellInput} text-right w-24`} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-xs">{fmt(e.total)}</td>
                  <td className="pr-1">
                    <button onClick={() => setEquipment((p) => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {equipment.length > 0 && (
              <tfoot className="bg-muted/30 border-t border-border">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">Subtotal</td>
                  <td className="px-3 py-2 text-right font-bold text-sm">{fmt(sumLines(equipment))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Contingency */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Contingency %</label>
        <Input
          type="number"
          value={contingencyPct}
          onChange={(e) => setContingencyPct(parseFloat(e.target.value) || 0)}
          className="w-20 text-sm"
          min={0}
          max={50}
        />
        <span className="text-xs text-muted-foreground">of subtotal</span>
      </div>

      {/* Assumptions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Assumptions
          </label>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAssumptions((p) => [...p, ""])}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        <div className="space-y-1.5">
          {assumptions.map((a, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0 mt-0.5" />
              <Input value={a} onChange={(e) => setAssumptions((p) => p.map((x, j) => j === i ? e.target.value : x))} className="h-7 text-sm flex-1" />
              <button onClick={() => setAssumptions((p) => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {assumptions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No assumptions — click Add to include one.</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes / Exclusions</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none text-sm min-h-[72px]" placeholder="Any important caveats, exclusions, or clarifications…" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-primary text-white hover:bg-primary/90">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Discard
        </Button>
      </div>
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
  const [isEditing, setIsEditing] = useState(false);

  async function fetchLogoDataUrl(): Promise<string | undefined> {
    const logoPath = (me?.company as any)?.logoPath;
    if (!logoPath) return undefined;
    try {
      const cleanPath = logoPath.replace(/^\/objects\//, "");
      const token = await getToken();
      const res = await fetch(`/api/storage/objects/${cleanPath}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return undefined;
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  const { data: estimates = [], isLoading } = useQuery<Estimate[]>({
    queryKey: ["estimates"],
    queryFn: () => customFetch("/api/estimates"),
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
            {!isEditing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-8 text-xs"
                  disabled={exportingPdf}
                  onClick={async () => {
                    setExportingPdf(true);
                    try {
                      const logo = await fetchLogoDataUrl();
                      const co = me?.company as any;
                      await downloadEstimatePDF(activeEstimate, false, logo, co ?? undefined);
                    } catch { toast({ title: "PDF export failed", variant: "destructive" }); }
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
                    try {
                      const logo = await fetchLogoDataUrl();
                      const co = me?.company as any;
                      await downloadEstimateDocx(activeEstimate, logo, co ?? undefined);
                    } catch { toast({ title: "Word export failed", variant: "destructive" }); }
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
                    try {
                      const logo = await fetchLogoDataUrl();
                      const co = me?.company as any;
                      await printEstimate(activeEstimate, logo, co ?? undefined);
                    } catch { toast({ title: "Print failed", variant: "destructive" }); }
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
              </>
            )}

            <div className="ml-auto">
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                className={`gap-2 h-8 text-xs ${isEditing ? "bg-muted hover:bg-muted/80 text-foreground" : ""}`}
                onClick={() => setIsEditing((v) => !v)}
              >
                {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {isEditing ? "Cancel Edit" : "Edit Estimate"}
              </Button>
            </div>
          </div>

          {isEditing ? (
            <EstimateEditor
              estimate={activeEstimate}
              company={me?.company ? { ...(me.company as any), id: (me.company as any).id } : undefined}
              onSave={(updated) => { setActiveEstimate(updated); setIsEditing(false); }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <EstimateReport estimate={activeEstimate} />
          )}

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
                  <label className="text-xs font-semibold text-muted-foreground">Recipient email address</label>
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
                  <label className="text-xs font-semibold text-muted-foreground">Personal message <span className="font-normal text-muted-foreground">(optional)</span></label>
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
                        dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
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
                          <p className="text-sm font-medium text-muted-foreground">
                            Drop plans here or <span className="text-primary">browse</span>
                          </p>
                          <p className="text-xs text-muted-foreground/70">PDF, Word, images (PNG/JPG), or text files — max 20 MB</p>
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
