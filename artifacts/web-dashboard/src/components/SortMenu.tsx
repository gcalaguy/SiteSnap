import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortDirection = "asc" | "desc";

export type SortState<T extends string> = {
  key: T;
  dir: SortDirection;
};

export type SortOption<T extends string> = {
  key: T;
  label: string;
};

// Generic client-side comparator: strings compare case-insensitively,
// numbers/dates numerically, nullish values always sort last regardless of direction.
export function compareBy<Row, T extends string>(
  row: Row,
  other: Row,
  key: T,
  dir: SortDirection,
  getValue: (row: Row, key: T) => string | number | null | undefined,
): number {
  const a = getValue(row, key);
  const b = getValue(other, key);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let cmp: number;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}

export function SortMenu<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SortOption<T>[];
  value: SortState<T>;
  onChange: (next: SortState<T>) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Select value={value.key} onValueChange={(v) => onChange({ ...value, key: v as T })}>
        <SelectTrigger className="h-9 w-[150px] text-sm border-[#D4AF37]/20">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-[#121212]/40 shrink-0" />
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 border-[#D4AF37]/20 shrink-0"
        onClick={() => onChange({ ...value, dir: value.dir === "asc" ? "desc" : "asc" })}
        title={value.dir === "asc" ? "Ascending" : "Descending"}
      >
        {value.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  );
}
