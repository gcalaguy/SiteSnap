import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCostModel,
  useUpdateCostModel,
  useDeleteCostModel,
  getListCostModelsQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { CostModelRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Edit3,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  BLACK,
  FINISH_LEVELS,
  FINISH_BADGE_CLASS,
  FINISH_CARD_CLASS,
  FINISH_CARD_SELECTED,
  numericField,
  guardNumericInput,
  AccordionSection,
  type FinishLevel,
} from "@/components/pricing-manager/shared";
import { useForceDeleteCostModel } from "@/hooks/pricing-manager/useCostModels";

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

// ── Cost Models Section (left panel) ─────────────────────────────────────────

export function CostModelsSection({
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

  const forceDelete = useForceDeleteCostModel(() => setDeleteWarning(null));

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
  const isDeleting = deleteMutation.isPending || forceDelete.isPending;

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
                  deleteMutation.mutate({ id: deleteConfirm.id }, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Deleted" });
                      setDeleteConfirm(null);
                    },
                    onError: (err: unknown) => {
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
                onClick={() => forceDelete.mutate(deleteWarning.item.id)}
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
