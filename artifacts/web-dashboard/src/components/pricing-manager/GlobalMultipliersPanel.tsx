import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Sliders } from "lucide-react";
import { AccordionSection, numericField, guardNumericInput, FINISH_LEVELS, FINISH_BADGE_CLASS, type FinishLevel } from "@/components/pricing-manager/shared";
import { useUpdateEstimatorSettings, type EstimatorSettings } from "@/hooks/pricing-manager/useEstimatorSettings";

function NumberField({
  label, value, onCommit, suffix = "%", max = 100,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  suffix?: string;
  max?: number;
}) {
  const [local, setLocal] = useState(value);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
        <input
          type="number" min={0} max={max}
          value={local}
          onChange={e => setLocal(guardNumericInput(e.target.value, max))}
          onBlur={() => { if (numericField(local) && local !== value) onCommit(local); else setLocal(value); }}
          className="w-full bg-transparent border-0 outline-none text-sm tabular-nums"
        />
        <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>
      </div>
    </div>
  );
}

export function GlobalMultipliersPanel({
  settings,
  companyId,
}: {
  settings: EstimatorSettings;
  companyId: number;
}) {
  const updateMutation = useUpdateEstimatorSettings(companyId);

  function commitTier(tier: FinishLevel, value: string) {
    updateMutation.mutate({
      tierMultipliers: { ...settings.tierMultipliers, [tier]: parseFloat(value) },
    });
  }

  return (
    <AccordionSection title="Global Multipliers" icon={Sliders} defaultOpen={false}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            key={`overhead-${settings.overheadPercent}`}
            label="Overhead"
            value={String(settings.overheadPercent)}
            onCommit={v => updateMutation.mutate({ overheadPercent: parseFloat(v) })}
          />
          <NumberField
            key={`contingency-${settings.contingencyPercent}`}
            label="Contingency"
            value={String(settings.contingencyPercent)}
            onCommit={v => updateMutation.mutate({ contingencyPercent: parseFloat(v) })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Project Tier Adjusters</Label>
          <div className="grid grid-cols-2 gap-2">
            {FINISH_LEVELS.map(tier => (
              <div key={tier} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5">
                <span className={`text-[10px] font-medium capitalize px-1.5 py-0.5 rounded border ${FINISH_BADGE_CLASS[tier]}`}>
                  {tier}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    key={`${tier}-${settings.tierMultipliers[tier]}`}
                    type="number" min={0} max={10} step={0.1}
                    defaultValue={settings.tierMultipliers[tier]}
                    onBlur={e => {
                      const v = e.target.value;
                      if (numericField(v)) commitTier(tier, v);
                    }}
                    className="w-14 bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary text-sm text-right tabular-nums outline-none"
                  />
                  <span className="text-xs text-muted-foreground">x</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Applied to catalog unit prices when estimating for a given project tier, unless a line item has its own override.
          </p>
        </div>
      </div>
    </AccordionSection>
  );
}
