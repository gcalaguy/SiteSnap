import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency as fmt } from "@/lib/estimator";

type AddonModel = { id: number; addonKey: string; name: string; description?: string | null; costType: string; amount: string; applicableTypes?: string | null };

export function AddonSelector({
  addons,
  selected,
  onChange,
}: {
  addons: AddonModel[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {addons.map((a) => {
        const on = selected.includes(a.addonKey);
        return (
          <button
            key={a.addonKey}
            onClick={() => toggle(a.addonKey)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
              on
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-muted-foreground/30 hover:bg-muted/30",
            )}
          >
            <div className={cn(
              "mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
              on ? "bg-primary border-primary" : "border-muted-foreground/40",
            )}>
              {on && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <div>
              <div className="text-xs font-medium leading-tight">{a.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {a.costType === "per_sqft" ? `$${a.amount}/sqft` : fmt(parseFloat(a.amount))} flat
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
