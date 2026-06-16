import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { fmtCurrency as fmt } from "@/lib/estimator";

export function ActualCard({ actual }: { actual: { estimatedCost: string; actualCost: string; variancePct: string | null; notes: string | null; recordedAt: string } }) {
  const parsedVariance = parseFloat(actual.variancePct ?? "0");
  const variance = Number.isFinite(parsedVariance) ? parsedVariance : 0;
  const overBudget = variance > 5;
  const underBudget = variance < -5;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border opacity-[1] bg-[#700d0d05] text-left">
      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
        overBudget ? "bg-red-50" : underBudget ? "bg-[#f0fdf4]" : "bg-muted")}>
        {overBudget ? <TrendingUp className="h-4 w-4 text-red-500" /> :
         underBudget ? <TrendingDown className="h-4 w-4 text-green-600" /> :
         <Minus className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[#f2e9e9]">{fmt(parseFloat(actual.actualCost))}</span>
          <span className="text-xs text-[#f0fdf4]">actual vs {fmt(parseFloat(actual.estimatedCost))} est.</span>
        </div>
        {actual.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{actual.notes}</p>}
        <p className="text-[10px] text-muted-foreground">{format(new Date(actual.recordedAt), "MMM d, yyyy")}</p>
      </div>
      <Badge
        variant="outline"
        className={cn("text-xs font-bold shrink-0",
          overBudget ? "text-red-600 border-red-200" :
          underBudget ? "text-green-600 border-green-200" :
          "text-muted-foreground")}
      >
        {Number.isFinite(parsedVariance) ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%` : "—"}
      </Badge>
    </div>
  );
}
