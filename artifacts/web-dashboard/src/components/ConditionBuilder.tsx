import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Generic field/operator/value condition-row builder — web counterpart of
 * mobile's components/ConditionBuilder.tsx, extracted so email-filing-rules.tsx
 * (Phase 2, flat conditions) and communications-search.tsx (Phase 4, one level
 * of nested condition groups) don't fork the same interaction pattern.
 */

export interface ConditionRow<F extends string, O extends string> {
  field: F;
  operator: O;
  value: string;
}

export function LogicToggle({
  value,
  onChange,
}: {
  value: "AND" | "OR";
  onChange: (v: "AND" | "OR") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
      {(["AND", "OR"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === l
              ? "bg-primary text-black"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Match {l === "AND" ? "ALL" : "ANY"}
        </button>
      ))}
    </div>
  );
}

export function ConditionBuilder<F extends string, O extends string>({
  conditions,
  onChange,
  fieldOptions,
  operatorOptions,
  logic,
  onLogicChange,
  minConditions = 1,
  valuePlaceholder = "Value to match",
  hideValueFor,
}: {
  conditions: ConditionRow<F, O>[];
  onChange: (conditions: ConditionRow<F, O>[]) => void;
  fieldOptions: { value: F; label: string }[];
  operatorOptions: { value: O; label: string }[];
  logic: "AND" | "OR";
  onLogicChange: (logic: "AND" | "OR") => void;
  minConditions?: number;
  valuePlaceholder?: string;
  /** Hide the value input for operators that don't need one (e.g. is_true / is_false). */
  hideValueFor?: (operator: O) => boolean;
}) {
  function updateCondition(index: number, patch: Partial<ConditionRow<F, O>>) {
    onChange(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, i) => i !== index));
  }

  function addCondition() {
    onChange([...conditions, { field: fieldOptions[0].value, operator: operatorOptions[0].value, value: "" }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conditions</span>
        <LogicToggle value={logic} onChange={onLogicChange} />
      </div>
      {conditions.map((cond, i) => (
        <Card key={i} className="border-border">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">IF</span>
              {conditions.length > minConditions && (
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove condition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={cond.field} onValueChange={(v) => updateCondition(i, { field: v as F })}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={cond.operator} onValueChange={(v) => updateCondition(i, { operator: v as O })}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!hideValueFor?.(cond.operator) && (
              <Input
                value={cond.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                placeholder={valuePlaceholder}
                className="bg-background border-border h-9"
              />
            )}
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addCondition} className="text-primary hover:text-primary px-0 h-7">
        <Plus className="h-3.5 w-3.5 mr-1" /> Add condition
      </Button>
    </div>
  );
}
