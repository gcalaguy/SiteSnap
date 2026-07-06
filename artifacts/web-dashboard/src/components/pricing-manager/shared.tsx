import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BLACK = "#111111";
export const HST_RATE = 0.13;

/** Hardcoded fallback defaults — merged with server-returned custom labels at runtime. */
export const DEFAULT_PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_new_build:  "Residential New Build",
  commercial_new_build:   "Commercial New Build",
  renovation_residential: "Residential Renovation",
  renovation_commercial:  "Commercial Renovation",
  addition:               "Home Addition",
  garage:                 "Garage",
  deck_patio:             "Deck / Patio",
  basement_finish:        "Basement Finish",
  roofing:                "Roofing",
  concrete_flatwork:      "Concrete Flatwork",
  framing_only:           "Framing Only",
  landscaping:            "Landscaping",
};

export const FINISH_LEVELS = ["basic", "standard", "premium", "luxury"] as const;
export type FinishLevel = (typeof FINISH_LEVELS)[number];

export const FINISH_BADGE_CLASS: Record<FinishLevel, string> = {
  basic:    "bg-gray-100 text-gray-700 border-gray-200",
  standard: "bg-blue-50 text-blue-700 border-blue-200",
  premium:  "bg-purple-50 text-purple-700 border-purple-200",
  luxury:   "bg-amber-50 text-amber-700 border-amber-200",
};

export const FINISH_CARD_CLASS: Record<FinishLevel, string> = {
  basic:    "border-gray-200 hover:border-gray-400",
  standard: "border-blue-200 hover:border-blue-400",
  premium:  "border-purple-200 hover:border-purple-400",
  luxury:   "border-amber-200 hover:border-amber-400",
};

export const FINISH_CARD_SELECTED: Record<FinishLevel, string> = {
  basic:    "border-gray-500 ring-1 ring-gray-400",
  standard: "border-blue-500 ring-1 ring-blue-400",
  premium:  "border-purple-500 ring-1 ring-purple-400",
  luxury:   "border-amber-500 ring-1 ring-amber-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function numericField(v: string) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0;
}

/** Prevents extreme values from reaching the API. Frontend boundary only. */
export function guardNumericInput(v: string, max = 9999) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n > max ? String(max) : v;
}

export const fmtCAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

// ── Accordion Section Wrapper ─────────────────────────────────────────────────

export function AccordionSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = true,
  keepOpenWhen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** When this flips true (e.g. a search starts matching), force the section open. */
  keepOpenWhen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (keepOpenWhen) setOpen(true);
  }, [keepOpenWhen]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{title}</span>
          {badge}
        </div>
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

// ── Loading Skeletons ─────────────────────────────────────────────────────────

export function PricingSkeletons() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="rounded-xl border border-border overflow-hidden">
          <Skeleton className="h-12 w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[130px] rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <Skeleton className="h-12 w-full" />
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="hidden xl:block">
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    </div>
  );
}
