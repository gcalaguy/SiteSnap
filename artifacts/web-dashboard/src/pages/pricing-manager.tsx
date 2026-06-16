import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListCostModels,
  useCreateCostModel,
  useUpdateCostModel,
  useDeleteCostModel,
  useCreateAddon,
  useUpdateAddon,
  useDeleteAddon,
  getListCostModelsQueryKey,
  customFetch,
  getGetCompanyQueryKey,
} from "@workspace/api-client-react";
import type { CostModelRecord, AddonRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Edit3,
  Trash2,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Tag,
  FileText,
  Receipt,
  Activity,
  Settings2,
  Zap,
  TrendingUp,
  Search,
  X,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BLACK = "#111111";
const HST_RATE = 0.13;

/** Hardcoded fallback defaults — merged with server-returned custom labels at runtime. */
const DEFAULT_PROJECT_TYPE_LABELS: Record<string, string> = {
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

const FINISH_LEVELS = ["basic", "standard", "premium", "luxury"] as const;
type FinishLevel = (typeof FINISH_LEVELS)[number];

const FINISH_BADGE_CLASS: Record<FinishLevel, string> = {
  basic:    "bg-gray-100 text-gray-700 border-gray-200",
  standard: "bg-blue-50 text-blue-700 border-blue-200",
  premium:  "bg-purple-50 text-purple-700 border-purple-200",
  luxury:   "bg-amber-50 text-amber-700 border-amber-200",
};

const FINISH_CARD_CLASS: Record<FinishLevel, string> = {
  basic:    "border-gray-200 hover:border-gray-400",
  standard: "border-blue-200 hover:border-blue-400",
  premium:  "border-purple-200 hover:border-purple-400",
  luxury:   "border-amber-200 hover:border-amber-400",
};

const FINISH_CARD_SELECTED: Record<FinishLevel, string> = {
  basic:    "border-gray-500 ring-1 ring-gray-400",
  standard: "border-blue-500 ring-1 ring-blue-400",
  premium:  "border-purple-500 ring-1 ring-purple-400",
  luxury:   "border-amber-500 ring-1 ring-amber-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function numericField(v: string) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0;
}

/** Prevents extreme values from reaching the API. Frontend boundary only. */
function guardNumericInput(v: string, max = 9999) {
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n > max ? String(max) : v;
}

const fmtCAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

// ── CostModel Edit Modal ──────────────────────────────────────────────────────

type CostModelForm = {
  baseCostPerSqft: string;
  laborCostPerSqft: string;
  materialCostPerSqft: string;
  overheadPct: string;
  contingencyPct: string;
  notes: string;
};

function CostModelModal({ model, onClose }: { model: CostModelRecord; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMutation = useUpdateCostModel();

  const [form, setForm] = useState<CostModelForm>({
    baseCostPerSqft:     model.baseCostPerSqft,
    laborCostPerSqft:    model.laborCostPerSqft,
    materialCostPerSqft: model.materialCostPerSqft,
    overheadPct:         model.overheadPct,
    contingencyPct:      model.contingencyPct,
    notes:               model.notes ?? "",
  });
  const [errors, setErrors] = useState<Partial<CostModelForm>>({});

  function validate() {
    const e: Partial<CostModelForm> = {};
    const numFields: (keyof CostModelForm)[] = [
      "baseCostPerSqft", "laborCostPerSqft", "materialCostPerSqft",
      "overheadPct", "contingencyPct",
    ];
    for (const f of numFields) {
      if (!numericField(form[f])) e[f] = "Must be ≥ 0";
      else if (parseFloat(form[f]) > 9999) e[f] = "Max value is 9999";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    updateMutation.mutate(
      { id: model.id, data: { ...form, notes: form.notes || undefined } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
          toast({ title: "Cost model updated" });
          onClose();
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  }

  const field = (key: keyof CostModelForm, label: string, suffix?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={9999}
          step="0.01"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: guardNumericInput(e.target.value) }))}
          className={cn("pr-10 text-sm", errors[key] && "border-red-400 focus-visible:ring-red-400")}
          placeholder="0.00"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {errors[key] && <p className="text-[11px] text-red-500">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Edit3 className="h-4 w-4 text-primary" />
            Edit Cost Model
          </DialogTitle>
          <DialogDescription className="text-xs">{model.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            {field("baseCostPerSqft",     "Base $/sqft",      "$/sqft")}
            {field("laborCostPerSqft",    "Labour $/sqft",    "$/sqft")}
            {field("materialCostPerSqft", "Material $/sqft",  "$/sqft")}
            {field("overheadPct",         "Overhead %",       "%")}
            {field("contingencyPct",      "Contingency %",    "%")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={form.notes}
              maxLength={500}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Builder-grade finishes, standard fixtures"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" style={{ background: BLACK, color: "white" }} disabled={updateMutation.isPending} onClick={handleSave}>
            {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Cost Model Modal ───────────────────────────────────────────────────

function CreateCostModelModal({
  projectType,
  projectLabel,
  missingFinishes,
  onClose,
}: {
  projectType: string;
  projectLabel: string;
  missingFinishes: FinishLevel[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMutation = useCreateCostModel();

  const [form, setForm] = useState({
    finishLevel: missingFinishes[0] ?? "standard",
    baseCostPerSqft: "",
    laborCostPerSqft: "",
    materialCostPerSqft: "",
    overheadPct: "10",
    contingencyPct: "10",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    const numFields = ["baseCostPerSqft", "laborCostPerSqft", "materialCostPerSqft", "overheadPct", "contingencyPct"] as const;
    for (const f of numFields) {
      if (!numericField(form[f])) e[f] = "Must be ≥ 0";
      else if (parseFloat(form[f]) > 9999) e[f] = "Max value is 9999";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleCreate() {
    if (!validate()) return;
    const fl = form.finishLevel;
    createMutation.mutate(
      {
        data: {
          projectType,
          finishLevel: fl as "basic" | "standard" | "premium" | "luxury",
          name: `${projectLabel} — ${fl.charAt(0).toUpperCase() + fl.slice(1)}`,
          baseCostPerSqft: form.baseCostPerSqft,
          laborCostPerSqft: form.laborCostPerSqft,
          materialCostPerSqft: form.materialCostPerSqft,
          overheadPct: form.overheadPct,
          contingencyPct: form.contingencyPct,
          notes: form.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
          toast({ title: "Cost model created" });
          onClose();
        },
        onError: () => toast({ title: "Failed to create", variant: "destructive" }),
      },
    );
  }

  const numField = (key: keyof typeof form, label: string, suffix: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number" min={0} max={9999} step="0.01"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: guardNumericInput(e.target.value) }))}
          placeholder="0.00"
          className={cn("pr-10 text-sm", errors[key] && "border-red-400 focus-visible:ring-red-400")}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
      </div>
      {errors[key] && <p className="text-[11px] text-red-500">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add Cost Model
          </DialogTitle>
          <DialogDescription className="text-xs">{projectLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Finish Level</Label>
            <Select value={form.finishLevel} onValueChange={v => setForm(f => ({ ...f, finishLevel: v as FinishLevel }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {missingFinishes.map(fl => (
                  <SelectItem key={fl} value={fl} className="capitalize">{fl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {numField("baseCostPerSqft",     "Base $/sqft",      "$/sqft")}
            {numField("laborCostPerSqft",    "Labour $/sqft",    "$/sqft")}
            {numField("materialCostPerSqft", "Material $/sqft",  "$/sqft")}
            {numField("overheadPct",         "Overhead %",       "%")}
            {numField("contingencyPct",      "Contingency %",    "%")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={form.notes} maxLength={500}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Builder-grade finishes"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" style={{ background: BLACK, color: "white" }} disabled={createMutation.isPending} onClick={handleCreate}>
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Addon Modal ───────────────────────────────────────────────────────────────

type AddonForm = {
  name: string;
  addonKey: string;
  description: string;
  costType: string;
  amount: string;
  applicableTypes: string;
};

const BLANK_ADDON: AddonForm = {
  name: "", addonKey: "", description: "", costType: "flat", amount: "", applicableTypes: "",
};

function AddonModal({ addon, onClose }: { addon: AddonRecord | "new"; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMutation = useCreateAddon();
  const updateMutation = useUpdateAddon();
  const isNew = addon === "new";

  const [form, setForm] = useState<AddonForm>(
    isNew ? BLANK_ADDON : {
      name:            (addon as AddonRecord).name,
      addonKey:        (addon as AddonRecord).addonKey,
      description:     (addon as AddonRecord).description ?? "",
      costType:        (addon as AddonRecord).costType,
      amount:          (addon as AddonRecord).amount,
      applicableTypes: (addon as AddonRecord).applicableTypes ?? "",
    },
  );
  const [errors, setErrors] = useState<Partial<AddonForm>>({});

  function validate() {
    const e: Partial<AddonForm> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.addonKey.trim()) e.addonKey = "Key is required";
    if (!numericField(form.amount)) e.amount = "Must be a valid number ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const body = {
      name:            form.name.trim().slice(0, 200),
      addonKey:        form.addonKey.trim().slice(0, 100),
      description:     form.description.trim().slice(0, 500) || undefined,
      costType:        form.costType as "flat" | "per_sqft",
      amount:          form.amount,
      applicableTypes: form.applicableTypes.trim() || undefined,
    };
    if (isNew) {
      createMutation.mutate({ data: body }, {
        onSuccess: () => { void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() }); toast({ title: "Add-on created" }); onClose(); },
        onError: () => toast({ title: "Failed to create", variant: "destructive" }),
      });
    } else {
      updateMutation.mutate({ id: (addon as AddonRecord).id, data: body }, {
        onSuccess: () => { void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() }); toast({ title: "Add-on updated" }); onClose(); },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            {isNew ? "New Add-on" : "Edit Add-on"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Display Name</Label>
              <Input
                value={form.name} maxLength={200}
                onChange={e => {
                  const n = e.target.value;
                  setForm(f => ({
                    ...f, name: n,
                    addonKey: isNew ? n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : f.addonKey,
                  }));
                }}
                placeholder="e.g. HVAC System"
                className={cn("text-sm", errors.name && "border-red-400")}
              />
              {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Identifier Key</Label>
              <Input
                value={form.addonKey}
                onChange={e => setForm(f => ({ ...f, addonKey: e.target.value }))}
                placeholder="hvac_system"
                className={cn("text-sm font-mono", errors.addonKey && "border-red-400")}
                disabled={!isNew}
              />
              {errors.addonKey && <p className="text-[11px] text-red-500">{errors.addonKey}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cost Type</Label>
              <Select value={form.costType} onValueChange={v => setForm(f => ({ ...f, costType: v }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat Rate</SelectItem>
                  <SelectItem value="per_sqft">Per Sqft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount ({form.costType === "per_sqft" ? "$/sqft" : "$ flat"})</Label>
              <Input
                type="number" min={0} max={999999}
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className={cn("text-sm", errors.amount && "border-red-400")}
              />
              {errors.amount && <p className="text-[11px] text-red-500">{errors.amount}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={form.description} maxLength={500}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Applicable Project Types (leave blank for all)</Label>
            <Input
              value={form.applicableTypes}
              onChange={e => setForm(f => ({ ...f, applicableTypes: e.target.value }))}
              placeholder="e.g. residential_new_build,addition"
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Comma-separated keys. Leave blank to apply to all types.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" style={{ background: BLACK, color: "white" }} disabled={isPending} onClick={handleSave}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {isNew ? "Create Add-on" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Finish Level Card ─────────────────────────────────────────────────────────

function FinishLevelCard({
  finish,
  model,
  isSelected,
  onSelect,
  onEdit,
  onAdd,
}: {
  finish: FinishLevel;
  model: CostModelRecord | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: (m: CostModelRecord) => void;
  onAdd: () => void;
}) {
  if (!model) {
    return (
      <div
        className={cn(
          "rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors min-h-[130px]",
          "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/20",
        )}
        onClick={onAdd}
        role="button"
        aria-label={`Add ${finish} cost model`}
      >
        <Badge className={cn("capitalize border text-[11px]", FINISH_BADGE_CLASS[finish])}>{finish}</Badge>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">No model yet</p>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 mt-1 text-primary" onClick={e => { e.stopPropagation(); onAdd(); }}>
            <Plus className="h-3 w-3" /> Add rates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 transition-all cursor-pointer group",
        isSelected ? FINISH_CARD_SELECTED[finish] : FINISH_CARD_CLASS[finish],
      )}
      onClick={onSelect}
      role="button"
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between mb-3">
        <Badge className={cn("capitalize border text-[11px]", FINISH_BADGE_CLASS[finish])}>{finish}</Badge>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {model.sourceType !== "manual" && (
            <Badge variant="outline" className={cn("text-[10px] gap-0.5 shrink-0",
              model.sourceType === "quote" ? "border-blue-200 text-blue-600" : "border-green-200 text-green-600")}>
              {model.sourceType === "quote" ? <FileText className="h-2.5 w-2.5" /> : <Receipt className="h-2.5 w-2.5" />}
              {model.sourceType}
            </Badge>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={e => { e.stopPropagation(); onEdit(model); }}
            aria-label={`Edit ${finish} model`}>
            <Edit3 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Base</span>
          <span className="font-semibold tabular-nums">${model.baseCostPerSqft}/sqft</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Labour</span>
          <span className="font-semibold tabular-nums">${model.laborCostPerSqft}/sqft</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Materials</span>
          <span className="font-semibold tabular-nums">${model.materialCostPerSqft}/sqft</span>
        </div>
        <div className="h-px bg-border/60 my-1.5" />
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Overhead</span>
          <span className="font-semibold tabular-nums">{model.overheadPct}%</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Contingency</span>
          <span className="font-semibold tabular-nums">{model.contingencyPct}%</span>
        </div>
      </div>

      {model.notes && (
        <p className="mt-2 text-[10px] text-muted-foreground italic truncate">{model.notes}</p>
      )}
    </div>
  );
}

// ── Accordion Section Wrapper ─────────────────────────────────────────────────

function AccordionSection({
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

// ── Cost Models Section (left panel) ─────────────────────────────────────────

function CostModelsSection({
  models,
  projectTypes,
  selectedType,
  onTypeChange,
  previewFinish,
  onFinishChange,
  search = "",
}: {
  models: CostModelRecord[];
  projectTypes: Record<string, string>;
  selectedType: string;
  onTypeChange: (t: string) => void;
  previewFinish: FinishLevel;
  onFinishChange: (f: FinishLevel) => void;
  /** Lowercased, trimmed search query shared across the Pricing Manager. */
  search?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deleteMutation = useDeleteCostModel();

  const [editModel, setEditModel] = useState<CostModelRecord | null>(null);
  const [addingFinish, setAddingFinish] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CostModelRecord | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ item: CostModelRecord; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeKeys = useMemo(() => Object.keys(projectTypes).sort((a, b) =>
    projectTypes[a]!.localeCompare(projectTypes[b]!)
  ), [projectTypes]);

  const filteredTypeKeys = useMemo(() => {
    if (!search) return typeKeys;
    return typeKeys.filter(k => (projectTypes[k] ?? k).toLowerCase().includes(search) || k.toLowerCase().includes(search));
  }, [typeKeys, projectTypes, search]);

  const modelsForType = useMemo(
    () => models.filter(m => m.projectType === selectedType),
    [models, selectedType],
  );

  const missingFinishes = useMemo(
    () => FINISH_LEVELS.filter(fl => !modelsForType.some(m => m.finishLevel === fl)),
    [modelsForType],
  );

  const modelByFinish = useMemo(
    () => Object.fromEntries(modelsForType.map(m => [m.finishLevel, m])) as Partial<Record<FinishLevel, CostModelRecord>>,
    [modelsForType],
  );

  const coverageCount = FINISH_LEVELS.length - missingFinishes.length;

  return (
    <AccordionSection
      title="Cost Models & Rates"
      icon={TrendingUp}
      keepOpenWhen={!!search && filteredTypeKeys.length > 0}
      badge={
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {coverageCount}/{FINISH_LEVELS.length}
        </Badge>
      }
    >
      {/* Project type selector */}
      <div className="space-y-1.5 mb-4">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Project Type
        </Label>
        <Select value={selectedType} onValueChange={onTypeChange}>
          <SelectTrigger className="text-sm h-9">
            <SelectValue placeholder="Select a project type…" />
          </SelectTrigger>
          <SelectContent>
            {filteredTypeKeys.map(key => (
              <SelectItem key={key} value={key}>
                {projectTypes[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {missingFinishes.length > 0 && (
          <p className="text-[11px] text-amber-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Missing: {missingFinishes.map(fl => fl.charAt(0).toUpperCase() + fl.slice(1)).join(", ")}
          </p>
        )}
      </div>

      {search && filteredTypeKeys.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No project types match "{search}".
        </p>
      )}

      {/* Finish level 2×2 grid */}
      {(!search || filteredTypeKeys.length > 0) && (
      <div className="grid grid-cols-2 gap-3">
        {FINISH_LEVELS.map(fl => (
          <FinishLevelCard
            key={fl}
            finish={fl}
            model={modelByFinish[fl]}
            isSelected={previewFinish === fl && !!modelByFinish[fl]}
            onSelect={() => { if (modelByFinish[fl]) onFinishChange(fl); }}
            onEdit={m => setEditModel(m)}
            onAdd={() => setAddingFinish(true)}
          />
        ))}
      </div>
      )}

      {/* Delete actions row */}
      {(!search || filteredTypeKeys.length > 0) && modelsForType.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {modelsForType.map(m => (
            <button
              key={m.id}
              onClick={() => setDeleteConfirm(m)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-500 transition-colors px-1.5 py-0.5 rounded border border-border/50 hover:border-red-200"
              aria-label={`Delete ${m.finishLevel} model`}
            >
              <Trash2 className="h-2.5 w-2.5" />
              Remove {m.finishLevel}
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {editModel && <CostModelModal model={editModel} onClose={() => setEditModel(null)} />}

      {addingFinish && missingFinishes.length > 0 && (
        <CreateCostModelModal
          projectType={selectedType}
          projectLabel={projectTypes[selectedType] ?? selectedType}
          missingFinishes={missingFinishes}
          onClose={() => setAddingFinish(false)}
        />
      )}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={o => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete cost model?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete <strong>{deleteConfirm.name}</strong>. The estimator will fall back to other models if available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  deleteMutation.mutate({ id: deleteConfirm.id }, {
                    onSuccess: () => {
                      setIsDeleting(false);
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Deleted" });
                      setDeleteConfirm(null);
                    },
                    onError: (err: unknown) => {
                      setIsDeleting(false);
                      if (err instanceof ApiError && err.status === 409) {
                        const count = (err.data as { details?: { usedInEstimates?: number } })?.details?.usedInEstimates ?? 0;
                        setDeleteConfirm(null);
                        setDeleteWarning({ item: deleteConfirm, count });
                        return;
                      }
                      toast({ title: "Failed to delete", variant: "destructive" });
                    },
                  });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deleteWarning && (
        <AlertDialog open onOpenChange={o => !o && setDeleteWarning(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-amber-700">
                Used in {deleteWarning.count} estimate{deleteWarning.count === 1 ? "" : "s"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteWarning.item.name}</strong> was used in {deleteWarning.count} saved estimate{deleteWarning.count === 1 ? "" : "s"}.
                Deleting it may affect historical breakdowns.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteWarning(null)}>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  customFetch(`/api/estimator/cost-models/${deleteWarning.item.id}?force=true`, { method: "DELETE" })
                    .then(() => {
                      setIsDeleting(false);
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Deleted" });
                      setDeleteWarning(null);
                    })
                    .catch(() => { setIsDeleting(false); toast({ title: "Failed to delete", variant: "destructive" }); });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete anyway"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AccordionSection>
  );
}

// ── Add-ons Section (left panel) ──────────────────────────────────────────────

function AddonsSection({
  addons,
  projectTypes,
  search = "",
}: {
  addons: AddonRecord[];
  projectTypes: Record<string, string>;
  /** Lowercased, trimmed search query shared across the Pricing Manager. */
  search?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deleteMutation = useDeleteAddon();

  const [editAddon, setEditAddon] = useState<AddonRecord | "new" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AddonRecord | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ item: AddonRecord; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredAddons = useMemo(() => {
    if (!search) return addons;
    return addons.filter(a => {
      const typeLabels = (a.applicableTypes ?? "")
        .split(",")
        .map(t => (projectTypes[t.trim()] ?? t.trim()).toLowerCase());
      return (
        a.name.toLowerCase().includes(search) ||
        a.addonKey.toLowerCase().includes(search) ||
        (a.description ?? "").toLowerCase().includes(search) ||
        typeLabels.some(t => t.includes(search))
      );
    });
  }, [addons, projectTypes, search]);

  return (
    <AccordionSection
      title="Add-ons & Upgrades"
      icon={Tag}
      keepOpenWhen={!!search && filteredAddons.length > 0}
      badge={
        addons.length > 0
          ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{addons.length}</Badge>
          : undefined
      }
    >
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button size="sm" style={{ background: BLACK, color: "white" }} className="gap-1.5 text-xs h-7"
            onClick={() => setEditAddon("new")}>
            <Plus className="h-3 w-3" /> New Add-on
          </Button>
        </div>

        {addons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <Tag className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No add-ons configured yet.</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add HVAC, permits, custom line items, and more.</p>
          </div>
        ) : filteredAddons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No add-ons match "{search}".</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredAddons.map(a => (
              <div key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 hover:bg-muted/20 group transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{a.name}</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px] capitalize shrink-0",
                      a.costType === "per_sqft" ? "border-blue-200 text-blue-600" : "border-green-200 text-green-600",
                    )}>
                      {a.costType === "per_sqft" ? "per sqft" : "flat"}
                    </Badge>
                  </div>
                  {a.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.description}</p>
                  )}
                  {a.applicableTypes && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Only: {a.applicableTypes.split(",").map(t => projectTypes[t.trim()] ?? t.trim()).join(", ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums">
                    {a.costType === "per_sqft"
                      ? `$${parseFloat(a.amount).toFixed(2)}/sqft`
                      : fmtCAD.format(parseFloat(a.amount))}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditAddon(a)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteConfirm(a)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editAddon !== null && <AddonModal addon={editAddon} onClose={() => setEditAddon(null)} />}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={o => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete add-on?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete <strong>{deleteConfirm.name}</strong>. Existing estimates using this add-on are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  deleteMutation.mutate({ id: deleteConfirm.id }, {
                    onSuccess: () => {
                      setIsDeleting(false);
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Add-on deleted" });
                      setDeleteConfirm(null);
                    },
                    onError: (err: unknown) => {
                      setIsDeleting(false);
                      if (err instanceof ApiError && err.status === 409) {
                        const count = (err.data as { details?: { usedInEstimates?: number } })?.details?.usedInEstimates ?? 0;
                        setDeleteConfirm(null);
                        setDeleteWarning({ item: deleteConfirm, count });
                        return;
                      }
                      toast({ title: "Failed to delete", variant: "destructive" });
                    },
                  });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {deleteWarning && (
        <AlertDialog open onOpenChange={o => !o && setDeleteWarning(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-amber-700">
                Used in {deleteWarning.count} estimate{deleteWarning.count === 1 ? "" : "s"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteWarning.item.name}</strong> has been used in {deleteWarning.count} saved estimate{deleteWarning.count === 1 ? "" : "s"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteWarning(null)}>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  customFetch(`/api/estimator/addons/${deleteWarning.item.id}?force=true`, { method: "DELETE" })
                    .then(() => {
                      setIsDeleting(false);
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Add-on deleted" });
                      setDeleteWarning(null);
                    })
                    .catch(() => { setIsDeleting(false); toast({ title: "Failed to delete", variant: "destructive" }); });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete anyway"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AccordionSection>
  );
}

// ── Project Types Section (left panel) ───────────────────────────────────────

function ProjectTypesSection({
  projectTypes,
  companyId,
  search = "",
}: {
  projectTypes: Record<string, string>;
  companyId: number;
  /** Lowercased, trimmed search query shared across the Pricing Manager. */
  search?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "", label: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDefault = useCallback(
    (k: string) => Object.prototype.hasOwnProperty.call(DEFAULT_PROJECT_TYPE_LABELS, k),
    [],
  );

  const updateMutation = useMutation({
    mutationFn: async (payload: { key: string; label: string }) => {
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(projectTypes)) {
        if (!isDefault(k)) custom[k] = v;
      }
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: { ...custom, [payload.key]: payload.label } } }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: editKey ? "Label updated" : "Label created" });
      setAddOpen(false); setEditKey(null); setForm({ key: "", label: "" }); setErrors({});
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(projectTypes)) {
        if (!isDefault(k)) custom[k] = v;
      }
      delete custom[key];
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: custom } }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: "Label deleted" });
      setDeleteKey(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  function validate() {
    const e: Record<string, string> = {};
    const k = form.key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!k) e.key = "A valid key is required (letters, numbers, underscores)";
    else if (k.length > 40) e.key = "Key must be under 40 characters";
    if (!form.label.trim()) e.label = "Display name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const key = editKey ?? form.key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    updateMutation.mutate({ key, label: form.label.trim().slice(0, 100) });
  }

  const sorted = useMemo(
    () => Object.entries(projectTypes).sort((a, b) => a[1].localeCompare(b[1])),
    [projectTypes],
  );
  const customCount = sorted.filter(([k]) => !isDefault(k)).length;

  const filteredSorted = useMemo(() => {
    if (!search) return sorted;
    return sorted.filter(([key, label]) => key.toLowerCase().includes(search) || label.toLowerCase().includes(search));
  }, [sorted, search]);

  return (
    <AccordionSection
      title="Project Type Labels"
      icon={Settings2}
      defaultOpen={false}
      keepOpenWhen={!!search && filteredSorted.length > 0}
      badge={
        customCount > 0
          ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{customCount} custom</Badge>
          : undefined
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {search
              ? `${filteredSorted.length} of ${sorted.length} type${sorted.length !== 1 ? "s" : ""} match`
              : `${sorted.length} type${sorted.length !== 1 ? "s" : ""} configured`}
          </p>
          <Button size="sm" style={{ background: BLACK, color: "white" }} className="gap-1.5 text-xs h-7"
            onClick={() => { setForm({ key: "", label: "" }); setEditKey(null); setAddOpen(true); }}>
            <Plus className="h-3 w-3" /> New Type
          </Button>
        </div>

        {search && filteredSorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No project types match "{search}".</p>
        ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Key</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Display Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Source</th>
                <th className="px-3 py-2 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredSorted.map(([key, label]) => (
                <tr key={key} className="group hover:bg-muted/10">
                  <td className="px-3 py-2">
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{key}</code>
                  </td>
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{isDefault(key) ? "Default" : "Custom"}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={isDefault(key)}
                        title={isDefault(key) ? "Defaults cannot be edited" : "Edit"}
                        onClick={() => { setForm({ key, label }); setEditKey(key); setAddOpen(true); }}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                        disabled={isDefault(key)} title={isDefault(key) ? "Defaults cannot be deleted" : "Delete"}
                        onClick={() => setDeleteKey(key)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {addOpen && (
        <Dialog open onOpenChange={o => !o && setAddOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                {editKey ? "Edit Label" : "New Project Type"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editKey ? "Change the display name for this type." : "Add a custom project type label."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Key</Label>
                <Input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                  placeholder="e.g. pole_barn" className={cn("text-sm font-mono", errors.key && "border-red-400")}
                  disabled={!!editKey} />
                {errors.key && <p className="text-[11px] text-red-500">{errors.key}</p>}
                <p className="text-[10px] text-muted-foreground">Snake_case key. Cannot be changed after creation.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display Name</Label>
                <Input value={form.label} maxLength={100} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Pole Barn" className={cn("text-sm", errors.label && "border-red-400")} />
                {errors.label && <p className="text-[11px] text-red-500">{errors.label}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button size="sm" style={{ background: BLACK, color: "white" }} disabled={updateMutation.isPending} onClick={handleSave}>
                {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {editKey ? "Save Changes" : "Create Label"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {deleteKey && (
        <AlertDialog open onOpenChange={o => !o && setDeleteKey(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete custom label?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove <strong>{projectTypes[deleteKey]}</strong>. Cost models for this type will remain in the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => deleteMutation.mutate(deleteKey)}>
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AccordionSection>
  );
}

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

function LivePreviewCard({
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

// ── Loading Skeletons ─────────────────────────────────────────────────────────

function PricingSkeletons() {
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

// ── Main Export ───────────────────────────────────────────────────────────────

export function PricingSettingsBody() {
  const { data, isLoading, isError } = useListCostModels();
  const { data: me } = useGetMe();

  const models: CostModelRecord[]          = data?.models       ?? [];
  const addons: AddonRecord[]              = data?.addons        ?? [];
  const projectTypes: Record<string, string> = data?.projectTypes ?? DEFAULT_PROJECT_TYPE_LABELS;
  const companyId = me?.activeCompanyId ?? 0;

  // ── Shared preview state ──────────────────────────────────────────────────
  const firstTypeWithModels = useMemo(() => {
    const typesWithModels = [...new Set(models.map(m => m.projectType))];
    return typesWithModels[0] ?? Object.keys(projectTypes)[0] ?? "residential_new_build";
  }, [models, projectTypes]);

  const [selectedType, setSelectedType]   = useState<string>(firstTypeWithModels);
  const [previewFinish, setPreviewFinish] = useState<FinishLevel>("standard");
  const [previewSqft, setPreviewSqft]     = useState(1500);

  // Sync selectedType after initial data load
  useEffect(() => {
    setSelectedType(prev => {
      // Only update if the current selection has no models at all
      const hasAnyModel = models.some(m => m.projectType === prev);
      return hasAnyModel ? prev : firstTypeWithModels;
    });
  }, [firstTypeWithModels, models]);

  // ── Search across cost models, add-ons, and project type labels ─────────────
  const [searchInput, setSearchInput] = useState("");
  const search = searchInput.trim().toLowerCase();

  // When the search starts matching a different project type, jump the cost-model
  // panel to the first match so results are visible without manually re-selecting.
  useEffect(() => {
    if (!search) return;
    const matchingKeys = Object.keys(projectTypes).filter(
      k => (projectTypes[k] ?? k).toLowerCase().includes(search) || k.toLowerCase().includes(search),
    );
    if (matchingKeys.length > 0 && !matchingKeys.includes(selectedType)) {
      setSelectedType(matchingKeys[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Sync flash ───────────────────────────────────────────────────────────
  // Shows a brief visual indicator on the preview card when the server data updates.
  const [syncFlash, setSyncFlash] = useState(false);
  const prevDataSignature = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data) return;
    const sig = `${models.length}:${models.map(m => m.updatedAt).join(",")}:${addons.length}`;
    if (prevDataSignature.current !== null && prevDataSignature.current !== sig) {
      setSyncFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSyncFlash(false), 1500);
    }
    prevDataSignature.current = sig;
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [data, models, addons]);

  if (isLoading) return <PricingSkeletons />;

  if (isError) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-red-500">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">Failed to load pricing data. Please refresh.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          These rates are specific to your company. The AI only identifies project parameters — it does not change these rates.
          Editing a rate will affect all new estimates immediately.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search cost models, add-ons, project types…"
          className="pl-9 pr-9 text-sm h-9"
          aria-label="Search Pricing Manager"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Split-screen layout: config on left, live preview sticky on right */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px] items-start">
        {/* ── Left: scrollable configuration panel ── */}
        <div className="space-y-3 min-w-0">
          <CostModelsSection
            models={models}
            projectTypes={projectTypes}
            selectedType={selectedType}
            search={search}
            onTypeChange={setSelectedType}
            previewFinish={previewFinish}
            onFinishChange={setPreviewFinish}
          />

          <AddonsSection
            addons={addons}
            projectTypes={projectTypes}
            search={search}
          />

          <ProjectTypesSection
            projectTypes={projectTypes}
            companyId={companyId}
            search={search}
          />
        </div>

        {/* ── Right: sticky live preview ── */}
        <div className="hidden xl:block">
          <div className="sticky top-4">
            <LivePreviewCard
              models={models}
              addons={addons}
              projectTypes={projectTypes}
              selectedType={selectedType}
              previewFinish={previewFinish}
              onFinishChange={setPreviewFinish}
              previewSqft={previewSqft}
              onSqftChange={setPreviewSqft}
              syncFlash={syncFlash}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
