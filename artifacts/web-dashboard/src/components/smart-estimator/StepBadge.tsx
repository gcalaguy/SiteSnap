import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function StepBadge({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={cn(
      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
      done  && "bg-primary border-primary text-primary-foreground",
      active && "bg-primary/10 border-primary text-primary",
      !done && !active && "bg-muted border-border text-muted-foreground",
    )}>
      {done ? <Check className="h-3.5 w-3.5" /> : step}
    </div>
  );
}
