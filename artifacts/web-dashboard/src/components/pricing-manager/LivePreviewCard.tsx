import { useMemo, useState } from "react";
import type { CostModelRecord, AddonRecord } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Activity, Zap } from "lucide-react";
import {
  HST_RATE,
  FINISH_LEVELS,
  FINISH_BADGE_CLASS,
  fmtCAD,
  type FinishLevel,
} from "@/components/pricing-manager/shared";

// ── Live Preview Card (right panel) ──────────────────────────────────────────

interface PreviewCalc {
  labour: number;
  materials: number;
  base: number;
  subtotal: number;
  overhead: number;
  contingency: number;
  addonsTotal: number;
  totalBeforeHST: number;
  hst: number;
  grandTotal: number;
  addonsApplied: AddonRecord[];
}

function calcPreview(
  model: CostModelRecord | undefined,
  addons: AddonRecord[],
  sqft: number,
  projectType: string,
): PreviewCalc | null {
  if (!model || sqft <= 0) return null;

  const base     = parseFloat(model.baseCostPerSqft)     * sqft;
  const labour   = parseFloat(model.laborCostPerSqft)    * sqft;
  const materials= parseFloat(model.materialCostPerSqft) * sqft;

  if (isNaN(base) || isNaN(labour) || isNaN(materials)) return null;

  const subtotal   = base + labour + materials;
  const overhead   = subtotal * (parseFloat(model.overheadPct)   / 100);
  const contingency= subtotal * (parseFloat(model.contingencyPct) / 100);

  const addonsApplied = addons.filter(a => {
    if (!a.applicableTypes) return true;
    return a.applicableTypes.split(",").map(t => t.trim()).includes(projectType);
  });

  const addonsTotal = addonsApplied.reduce((sum, a) => {
    const amt = parseFloat(a.amount);
    return sum + (a.costType === "per_sqft" ? amt * sqft : amt);
  }, 0);

  const totalBeforeHST = subtotal + overhead + contingency + addonsTotal;
  const hst = totalBeforeHST * HST_RATE;
  const grandTotal = totalBeforeHST + hst;

  return { labour, materials, base, subtotal, overhead, contingency, addonsTotal, totalBeforeHST, hst, grandTotal, addonsApplied };
}

export function LivePreviewCard({
  models,
  addons,
  projectTypes,
  selectedType,
  previewFinish,
  onFinishChange,
  previewSqft,
  onSqftChange,
  syncFlash,
}: {
  models: CostModelRecord[];
  addons: AddonRecord[];
  projectTypes: Record<string, string>;
  selectedType: string;
  previewFinish: FinishLevel;
  onFinishChange: (f: FinishLevel) => void;
  previewSqft: number;
  onSqftChange: (n: number) => void;
  syncFlash: boolean;
}) {
  const [sqftInput, setSqftInput] = useState(String(previewSqft));

  const model = useMemo(
    () => models.find(m => m.projectType === selectedType && m.finishLevel === previewFinish),
    [models, selectedType, previewFinish],
  );

  const calc = useMemo(
    () => calcPreview(model, addons, previewSqft, selectedType),
    [model, addons, previewSqft, selectedType],
  );

  const typeLabel = projectTypes[selectedType] ?? selectedType;

  function handleSqftBlur() {
    const n = parseInt(sqftInput.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= 100 && n <= 100000) {
      onSqftChange(n);
      setSqftInput(n.toLocaleString("en-CA"));
    } else {
      setSqftInput(previewSqft.toLocaleString("en-CA"));
    }
  }

  const LineItem = ({ label, value, muted = false, bold = false, separator = false }: {
    label: string; value: number | string; muted?: boolean; bold?: boolean; separator?: boolean;
  }) => (
    <>
      {separator && <div className="h-px bg-border/60 my-1" />}
      <div className={cn("flex justify-between items-baseline text-xs py-0.5", muted && "text-muted-foreground")}>
        <span>{label}</span>
        <span className={cn("tabular-nums", bold && "font-bold text-sm")}>{typeof value === "number" ? fmtCAD.format(value) : value}</span>
      </div>
    </>
  );

  return (
    <div className={cn(
      "rounded-xl border-2 overflow-hidden transition-all duration-300",
      syncFlash ? "border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.25)]" : "border-border",
    )}>
      {/* Header */}
      <div className={cn(
        "px-4 py-3 flex items-center justify-between transition-colors duration-300",
        syncFlash ? "bg-green-50" : "bg-muted/20",
      )}>
        <div className="flex items-center gap-2">
          <Activity className={cn("h-4 w-4", syncFlash ? "text-green-600" : "text-muted-foreground")} />
          <span className="text-sm font-semibold">Estimate Preview</span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors duration-300",
          syncFlash
            ? "bg-green-100 text-green-700"
            : "bg-muted text-muted-foreground",
        )}>
          {syncFlash
            ? <><Zap className="h-3 w-3" /> Live Syncing</>
            : <><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 inline-block" /> Live Preview</>}
        </div>
      </div>

      {/* Context row */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60 space-y-2.5">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Project Type</p>
          <p className="text-sm font-semibold">{typeLabel || "—"}</p>
        </div>

        {/* Finish level tabs */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Finish Level</p>
          <div className="grid grid-cols-4 gap-1">
            {FINISH_LEVELS.map(fl => {
              const hasModel = models.some(m => m.projectType === selectedType && m.finishLevel === fl);
              return (
                <button
                  key={fl}
                  disabled={!hasModel}
                  onClick={() => onFinishChange(fl)}
                  className={cn(
                    "text-[10px] capitalize py-1 px-1.5 rounded-md border transition-colors font-medium",
                    previewFinish === fl
                      ? FINISH_BADGE_CLASS[fl] + " " + (fl === "luxury" ? "border-amber-400" : fl === "premium" ? "border-purple-400" : fl === "standard" ? "border-blue-400" : "border-gray-400")
                      : "border-border text-muted-foreground hover:border-muted-foreground/40",
                    !hasModel && "opacity-30 cursor-not-allowed",
                  )}
                >
                  {fl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sqft input */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Project Size</p>
          <div className="flex items-center gap-1.5">
            <Input
              value={sqftInput}
              onChange={e => setSqftInput(e.target.value.replace(/[^0-9,]/g, ""))}
              onBlur={handleSqftBlur}
              onKeyDown={e => { if (e.key === "Enter") handleSqftBlur(); }}
              className="h-7 text-sm text-right tabular-nums"
              aria-label="Square footage for preview"
            />
            <span className="text-xs text-muted-foreground shrink-0">sqft</span>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="px-4 py-3">
        {!model ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">No cost model for {typeLabel} / {previewFinish}.</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Add rates on the left to see a preview.</p>
          </div>
        ) : !calc ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Enter valid rates to see a preview.</p>
          </div>
        ) : (
          <div>
            <LineItem label="Base cost" value={calc.base} muted />
            <LineItem label="Labour" value={calc.labour} muted />
            <LineItem label="Materials" value={calc.materials} muted />
            <LineItem label="Subtotal" value={calc.subtotal} bold separator />
            <LineItem label={`Overhead (${model.overheadPct}%)`} value={calc.overhead} muted />
            <LineItem label={`Contingency (${model.contingencyPct}%)`} value={calc.contingency} muted />
            {calc.addonsApplied.length > 0 && (
              <LineItem label={`Add-ons (${calc.addonsApplied.length})`} value={calc.addonsTotal} muted />
            )}
            <LineItem label="Before HST" value={calc.totalBeforeHST} bold separator />
            <LineItem label={`HST (${(HST_RATE * 100).toFixed(0)}%)`} value={calc.hst} muted />
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xs font-bold">Total Estimate</span>
              <span className="text-base font-bold tabular-nums">{fmtCAD.format(calc.grandTotal)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground text-right mt-0.5">CAD · {previewSqft.toLocaleString()} sqft</p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2.5 bg-muted/20 border-t border-border/60">
        <p className="text-[10px] text-muted-foreground text-center">
          Preview reflects your saved rates. Changes save on <em>Save Changes</em>.
        </p>
      </div>
    </div>
  );
}
