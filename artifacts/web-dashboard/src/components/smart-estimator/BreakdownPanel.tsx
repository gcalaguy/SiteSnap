import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

type LineItem = {
  id: string;
  description: string;
  category: "labour" | "materials" | "addon" | "overhead";
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  editable: boolean;
};

type EstimateSummary = {
  laborTotal: number;
  materialsTotal: number;
  addonsTotal: number;
  overhead: number;
  overheadPct: number;
  subtotal: number;
  contingency: number;
  contingencyPct: number;
  totalLow: number;
  totalHigh: number;
  suggestedMarginPct: number;
  suggestedMarginAmount: number;
  priceToClient: number;
};

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export function BreakdownPanel({
  summary,
  lineItems,
  marginPct,
  onMarginChange,
}: {
  summary: EstimateSummary;
  lineItems: LineItem[];
  marginPct: number;
  onMarginChange: (v: number) => void;
}) {
  const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const liveContingency = Math.round(liveSubtotal * (summary.contingencyPct / 100));
  const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
  const priceToClient = liveSubtotal + liveContingency + liveMargin;

  return (
    <div className="space-y-4">
      {/* Cost cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Labour",     value: lineItems.filter(i => i.category === "labour").reduce((s,i) => s+i.total,0),    color: "text-blue-600" },
          { label: "Materials",  value: lineItems.filter(i => i.category === "materials").reduce((s,i) => s+i.total,0), color: "text-green-600" },
          { label: "Add-ons",    value: lineItems.filter(i => i.category === "addon").reduce((s,i) => s+i.total,0),     color: "text-purple-600" },
          { label: "Overhead",   value: lineItems.filter(i => i.category === "overhead").reduce((s,i) => s+i.total,0),  color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-muted/30 border border-border p-3">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={cn("text-base font-bold", color)}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Contingency */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold">{fmt(liveSubtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Contingency ({summary.contingencyPct}%)</span>
        <span className="font-semibold text-amber-600">+{fmt(liveContingency)}</span>
      </div>

      <Separator />

      {/* Margin slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <label className="font-medium">Profit Margin</label>
          <Badge variant="outline" className="text-xs font-bold">{marginPct}%</Badge>
        </div>
        <Slider
          min={0}
          max={50}
          step={1}
          value={[marginPct]}
          onValueChange={([v]) => onMarginChange(v!)}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0% (cost recovery)</span>
          <span>50% (high margin)</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Margin ({marginPct}%)</span>
        <span className="font-semibold text-primary">+{fmt(liveMargin)}</span>
      </div>

      {/* Total */}
      <div className="rounded-xl bg-[#0A0A0A] text-white p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Price to Client (CAD)</p>
          <p className="text-2xl font-black text-[#C9A84C]">{fmt(priceToClient)}</p>
          <p className="text-[10px] text-white/40 mt-0.5">excl. HST/GST</p>
        </div>
        <div className="text-right text-xs text-white/50 space-y-0.5">
          <p>Cost: {fmt(liveSubtotal)}</p>
          <p>+Cont: {fmt(liveContingency)}</p>
          <p>+Margin: {fmt(liveMargin)}</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Database className="h-3 w-3 inline" />
        All pricing sourced from database models — not AI-generated
      </p>
    </div>
  );
}
