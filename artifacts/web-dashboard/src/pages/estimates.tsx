import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { downloadEstimatePDF, downloadEstimateDocx, printEstimate, type CompanyInfo } from "@/lib/estimateExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { updateBuilderEstimateBodyNotesMax as NOTES_MAX } from "@workspace/api-zod";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sparkles, FileText, Trash2, Clock,
  Loader2, X, HardHat, Package, Wrench,
  TrendingUp, ArrowRight, RotateCcw, Info,
  Printer, Mail, FileDown, Pencil, Save, Plus, Calculator, Box, Building2,
} from "lucide-react";
import SmartEstimatorTab from "@/pages/smart-estimator";
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
  scanId: number | null;
};

const LazySplatViewer = lazy(() => import("@/components/SplatViewer"));

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
        <div className="rounded-lg bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4">
          <p className="text-sm text-[#121212]/70 leading-relaxed font-medium">{summaryText}</p>
        </div>
      )}

      {/* Cost summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-white border border-[#D4AF37]/20 p-3 text-center">
          <p className="text-xs text-[#121212]/60 mb-1 font-semibold">Materials</p>
          <p className="text-lg font-extrabold text-[#121212]">{fmt(materialsTotal)}</p>
        </div>
        <div className="rounded-lg bg-white border border-[#D4AF37]/20 p-3 text-center">
          <p className="text-xs text-[#121212]/60 mb-1 font-semibold">Labour</p>
          <p className="text-lg font-extrabold text-[#121212]">{fmt(laborTotal)}</p>
        </div>
        {equipmentTotal > 0 && (
          <div className="rounded-lg bg-white border border-[#D4AF37]/20 p-3 text-center">
            <p className="text-xs text-[#121212]/60 mb-1 font-semibold">Equipment</p>
            <p className="text-lg font-extrabold text-[#121212]">{fmt(equipmentTotal)}</p>
          </div>
        )}
        {addonsTotal > 0 && (
          <div className="rounded-lg bg-white border border-[#D4AF37]/20 p-3 text-center">
            <p className="text-xs text-[#121212]/60 mb-1 font-semibold">Add-ons</p>
            <p className="text-lg font-extrabold text-[#121212]">{fmt(addonsTotal)}</p>
          </div>
        )}
        {overhead > 0 && (
          <div className="rounded-lg bg-white border border-[#D4AF37]/20 p-3 text-center">
            <p className="text-xs text-[#121212]/60 mb-1 font-semibold">Overhead ({smart?.overheadPct ?? 0}%)</p>
            <p className="text-lg font-extrabold text-[#121212]">{fmt(overhead)}</p>
          </div>
        )}
        <div className="rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30 p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold mb-1" style={{ color: "#D4AF37" }}>Contingency ({smart?.contingencyPct ?? r.contingencyPct ?? 10}%)</p>
          <p className="text-lg font-extrabold" style={{ color: "#D4AF37" }}>{fmt(contingency)}</p>
        </div>
      </div>

      {/* Total range */}
      <div className="rounded-xl bg-[#121212] text-white p-5 flex items-center justify-between gap-4 flex-wrap border-t-[3px] border-[#D4AF37]">
        <div>
          <p className="text-xs text-white/60 uppercase tracking-wider mb-1 font-semibold">
            {smart ? "Price to Client (CAD)" : "Estimated Total Range (CAD)"}
          </p>
          <p className="text-3xl font-black" style={{ color: "#D4AF37" }}>{fmt(totalLow)}</p>
          {!smart && <p className="text-sm text-white/60 mt-0.5 font-medium">to {fmt(totalHigh)}</p>}
          {smart && smart.suggestedMarginPct > 0 && (
            <p className="text-xs text-white/60 mt-0.5">incl. {smart.suggestedMarginPct}% margin</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-white/60 font-semibold">Subtotal</p>
          <p className="text-xl font-extrabold text-white">{fmt(subtotal)}</p>
          <p className="text-xs text-white/60 mt-1">excl. HST/GST</p>
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
        <CharCountedTextarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTES_MAX} className="resize-none text-sm min-h-[72px]" placeholder="Any important caveats, exclusions, or clarifications…" />
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
    <div className="flex items-start gap-4 p-4 hover:bg-[#D4AF37]/5 transition-colors rounded-lg border border-[#D4AF37]/15 hover:border-[#D4AF37]/40 bg-white">
      <div className="rounded-full p-2 shrink-0 mt-0.5" style={{ background: "rgba(201,168,76,0.12)" }}>
        <Sparkles className="h-4 w-4" style={{ color: "#D4AF37" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="font-extrabold text-sm truncate text-[#121212]">{estimate.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#121212]/60 flex-wrap font-medium">
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
                  <span className="font-extrabold" style={{ color: "#D4AF37" }}>
                    {fmt(totalLow)} – {fmt(totalHigh)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {estimate.scanId != null && (
              <Badge variant="secondary" className="text-xs gap-0.5 px-1.5 text-[#D4AF37] font-extrabold border-0" style={{ background: "rgba(201,168,76,0.12)" }}>
                <Box className="h-2.5 w-2.5" /> 3D
              </Badge>
            )}
            {estimate.status === "ready" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 font-semibold border-[#D4AF37]/40 text-[#121212] hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]" onClick={() => onView(estimate)}>
                View <ArrowRight className="h-3 w-3" />
              </Button>
            )}
            {estimate.status === "failed" && (
              <Badge variant="destructive" className="text-xs font-extrabold">Failed</Badge>
            )}
            {estimate.status === "generating" && (
              <Badge variant="secondary" className="text-xs gap-1 font-extrabold border-0" style={{ background: "rgba(201,168,76,0.12)", color: "#D4AF37" }}>
                <Loader2 className="h-3 w-3 animate-spin" /> Generating
              </Badge>
            )}
            <button
              className="p-1.5 rounded hover:bg-destructive/10 text-[#121212]/40 hover:text-destructive transition-colors"
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

  const [tab, setTab] = useState<"estimator" | "history">("estimator");
  const [activeEstimate, setActiveEstimate] = useState<Estimate | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanModalUrl, setScanModalUrl] = useState<string | null>(null);
  const [scanModalLoading, setScanModalLoading] = useState(false);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [printing, setPrinting] = useState(false);

  async function fetchLogoDataUrl(): Promise<string | undefined> {
    const logoPath = (me?.company as any)?.logoPath;
    if (!logoPath) return undefined;
    try {
      const { url } = await customFetch(`/api/storage/objects/${logoPath.replace(/^\/objects\//, "")}/signed-url`) as { url: string };
      const res = await fetch(url);
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

  const { data: estimates = [], isLoading, isError: estimatesError } = useQuery<Estimate[]>({
    queryKey: ["estimates"],
    queryFn: () => customFetch("/api/estimates"),
  });

  const deleteEstimate = useMutation({
    mutationFn: (id: number) => customFetch(`/api/estimates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      if (activeEstimate) setActiveEstimate(null);
      toast({ title: "Estimate deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

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

  function handleViewEstimate(est: Estimate) {
    setActiveEstimate(est);
    setIsEditing(false);
    setTab("history");
  }

  function handleBackToList() {
    setActiveEstimate(null);
    setIsEditing(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2 text-[#121212]">
            <Calculator className="h-6 w-6" style={{ color: "#D4AF37" }} />
            Estimating
          </h1>
          <p className="text-[#121212]/60 text-sm mt-1 font-medium">
            DB-driven pricing · AI-powered parsing · type scope or upload plans
          </p>
        </div>
        {tab === "history" && activeEstimate && (
          <Button variant="outline" size="sm" className="gap-2" onClick={handleBackToList}>
            <RotateCcw className="h-4 w-4" /> Back to List
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border border-[#D4AF37]/30 overflow-hidden bg-white">
        {([
          { key: "estimator" as const, label: "Estimator", icon: Calculator },
          { key: "history" as const, label: "Past Estimates", icon: Clock },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors border-r last:border-r-0 border-[#D4AF37]/20 ${
              tab === key
                ? "bg-[#D4AF37] text-white"
                : "bg-transparent text-[#121212]/70 hover:bg-[#D4AF37]/10"
            }`}
            onClick={() => { setTab(key); setActiveEstimate(null); setIsEditing(false); }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === "history" && estimates.length > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-bold ${tab === "history" ? "bg-white/20 text-white" : "bg-[#D4AF37]/15 text-[#D4AF37]"}`}>
                {estimates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Estimator tab — renders the full DB-backed estimator */}
      {tab === "estimator" && <SmartEstimatorTab isOwnerOrForeman={me?.role === "owner" || me?.role === "foreman"} />}

      {/* Past Estimates tab */}
      {tab === "history" && (activeEstimate ? (
        /* ── Viewing a saved estimate ── */
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold">{activeEstimate.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(activeEstimate.createdAt), "MMM d, yyyy 'at' h:mm a")}
                {activeEstimate.sourceFilename && ` · from ${activeEstimate.sourceFilename}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleBackToList}>
              <RotateCcw className="h-3.5 w-3.5" /> Back
            </Button>
          </div>

          {/* Export action bar */}
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3">
            {!isEditing && (
              <>
                <Button
                  variant="outline" size="sm" className="gap-2 h-8 text-xs"
                  disabled={exportingPdf}
                  onClick={async () => {
                    setExportingPdf(true);
                    try {
                      const logo = await fetchLogoDataUrl();
                      await downloadEstimatePDF(activeEstimate as any, false, logo, (me?.company as any) ?? undefined);
                    } catch { toast({ title: "PDF export failed", variant: "destructive" }); }
                    finally { setExportingPdf(false); }
                  }}
                >
                  {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-red-500" />}
                  Save as PDF
                </Button>
                <Button
                  variant="outline" size="sm" className="gap-2 h-8 text-xs"
                  disabled={exportingDocx}
                  onClick={async () => {
                    setExportingDocx(true);
                    try {
                      const logo = await fetchLogoDataUrl();
                      await downloadEstimateDocx(activeEstimate as any, logo, (me?.company as any) ?? undefined);
                    } catch { toast({ title: "Word export failed", variant: "destructive" }); }
                    finally { setExportingDocx(false); }
                  }}
                >
                  {exportingDocx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-blue-600" />}
                  Save as Word
                </Button>
                <Button
                  variant="outline" size="sm" className="gap-2 h-8 text-xs"
                  disabled={printing}
                  onClick={async () => {
                    setPrinting(true);
                    try {
                      const logo = await fetchLogoDataUrl();
                      await printEstimate(activeEstimate as any, logo, (me?.company as any) ?? undefined);
                    } catch { toast({ title: "Print failed", variant: "destructive" }); }
                    finally { setPrinting(false); }
                  }}
                >
                  {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                  Print
                </Button>
                <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={() => setEmailDialogOpen(true)}>
                  <Mail className="h-3.5 w-3.5 text-primary" /> Email
                </Button>
                {activeEstimate.scanId != null && (
                  <Button
                    variant="outline" size="sm" className="gap-2 h-8 text-xs"
                    disabled={scanModalLoading}
                    onClick={async () => {
                      setScanModalLoading(true);
                      try {
                        const res = await customFetch<{ url: string }>(`/api/scans/${activeEstimate.scanId}/url`);
                        setScanModalUrl(res.url);
                        setScanModalOpen(true);
                      } catch {
                        toast({ title: "Could not load 3D scan", variant: "destructive" });
                      } finally {
                        setScanModalLoading(false);
                      }
                    }}
                  >
                    {scanModalLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Box className="h-3.5 w-3.5 text-violet-500" />}
                    3D View
                  </Button>
                )}
              </>
            )}
            <div className="ml-auto">
              <Button
                variant={isEditing ? "default" : "outline"} size="sm"
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

          <Dialog
            open={scanModalOpen}
            onOpenChange={(open) => {
              setScanModalOpen(open);
              if (!open) setScanModalUrl(null);
            }}
          >
            <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <Box className="h-4 w-4 text-violet-500" />
                  3D Site Scan — {activeEstimate.title}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0">
                {scanModalUrl ? (
                  <Suspense
                    fallback={
                      <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Loading 3D viewer…</p>
                      </div>
                    }
                  >
                    <LazySplatViewer scanUrl={scanModalUrl} />
                  </Suspense>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Fetching scan URL…</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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
                    type="email" placeholder="client@example.com"
                    value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && emailTo.trim()) handleSendEmail(); }}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Personal message <span className="font-normal">(optional)</span>
                  </label>
                  <Textarea
                    placeholder="Hi John, please find the estimate attached below…"
                    value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)}
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
        /* ── Estimate list ── */
        <Card className="shadow-sm border-[#D4AF37]/20 bg-white">
          <CardHeader className="pb-3 border-b border-[#D4AF37]/15">
            <CardTitle className="text-base flex items-center gap-2 font-extrabold text-[#121212]">
              <Clock className="h-4 w-4" style={{ color: "#D4AF37" }} />
              Past Estimates
              <Badge variant="secondary" className="ml-auto font-extrabold border-0" style={{ background: "rgba(201,168,76,0.12)", color: "#D4AF37" }}>{estimates.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-[#121212]/60">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" style={{ color: "#D4AF37" }} />Loading…
              </div>
            ) : estimatesError ? (
              <div className="p-8 text-center text-sm text-red-500 font-medium">Failed to load estimates. Please refresh and try again.</div>
            ) : estimates.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#121212]/60 font-medium">No saved estimates yet.</div>
            ) : (
              <div className="divide-y divide-[#D4AF37]/10">
                {estimates.map((e) => (
                  <HistoryCard
                    key={e.id}
                    estimate={e}
                    onDelete={(id) => deleteEstimate.mutate(id)}
                    onView={handleViewEstimate}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
