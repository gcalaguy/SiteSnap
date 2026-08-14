import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BLACK = "#111111";
/** @deprecated import DEFAULT_TAX_RATE from "@/lib/tax" instead */
export const HST_RATE = DEFAULT_TAX_RATE;

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

// ── Cost Catalog helpers ─────────────────────────────────────────────────────

export const COST_CATALOG_UNIT_TYPES = ["sqft", "linft", "hour", "flat", "unit"] as const;
export type CostCatalogUnitType = (typeof COST_CATALOG_UNIT_TYPES)[number];

export const UNIT_TYPE_LABELS: Record<CostCatalogUnitType, string> = {
  sqft: "sq ft",
  linft: "lin ft",
  hour: "hour",
  flat: "flat",
  unit: "unit",
};

const CSV_HEADERS = ["category", "itemName", "description", "unitType", "costPrice", "unitPrice", "defaultMarkupPercent"] as const;

/** Minimal RFC4180-ish CSV parser — handles quoted fields with embedded commas/quotes.
 *  Does not support embedded newlines inside quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r\n|\n/)) {
    if (rawLine.trim() === "") continue;
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (inQuotes) {
        if (ch === '"' && rawLine[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells.map(c => c.trim()));
  }
  return rows;
}

function escapeCsvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function downloadCostCatalogTemplate() {
  const sample = ["Framing", "Wall Framing (2x4/2x6)", "Stud wall framing, materials + layout", "linft", "8.00", "10.00", "20"];
  const csv = [CSV_HEADERS.join(","), sample.map(escapeCsvCell).join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cost-catalog-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ParsedCatalogRow {
  category: string;
  itemName: string;
  description?: string;
  unitType: CostCatalogUnitType;
  costPrice: string;
  unitPrice: string;
  defaultMarkupPercent: string;
  error?: string;
}

/** Parses CSV text into catalog rows, matching columns by header name (order-independent). */
export function parseCostCatalogCsv(text: string): ParsedCatalogRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map(h => h.trim());
  const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iCategory = idx("category");
  const iItemName = idx("itemName");
  const iDescription = idx("description");
  const iUnitType = idx("unitType");
  const iCostPrice = idx("costPrice");
  const iUnitPrice = idx("unitPrice");
  const iMarkup = idx("defaultMarkupPercent");

  return rows.slice(1).map((cells) => {
    const category = (iCategory >= 0 ? cells[iCategory] : "") || "";
    const itemName = (iItemName >= 0 ? cells[iItemName] : "") || "";
    const description = iDescription >= 0 ? cells[iDescription] : undefined;
    const unitTypeRaw = ((iUnitType >= 0 ? cells[iUnitType] : "") || "unit").toLowerCase();
    const costPrice = (iCostPrice >= 0 ? cells[iCostPrice] : "") || "0";
    const unitPrice = (iUnitPrice >= 0 ? cells[iUnitPrice] : "") || "0";
    const defaultMarkupPercent = (iMarkup >= 0 ? cells[iMarkup] : "") || "15";

    let error: string | undefined;
    if (!category) error = "Missing category";
    else if (!itemName) error = "Missing itemName";
    else if (!COST_CATALOG_UNIT_TYPES.includes(unitTypeRaw as CostCatalogUnitType)) error = `Invalid unitType "${unitTypeRaw}"`;
    else if (!numericField(costPrice)) error = "Invalid costPrice";
    else if (!numericField(unitPrice)) error = "Invalid unitPrice";

    return {
      category, itemName, description, unitType: unitTypeRaw as CostCatalogUnitType,
      costPrice, unitPrice, defaultMarkupPercent, error,
    };
  });
}

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
