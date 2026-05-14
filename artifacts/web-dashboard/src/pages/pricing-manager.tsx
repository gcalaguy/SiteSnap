import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
} from "@workspace/api-client-react";
import type { CostModelRecord, AddonRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  DollarSign,
  Edit3,
  Trash2,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Tag,
  LayoutGrid,
} from "lucide-react";

const GOLD = "#C9A84C";
const BLACK = "#111111";

const PROJECT_TYPE_LABELS: Record<string, string> = {
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
const FINISH_LEVEL_COLORS: Record<string, string> = {
  basic:    "bg-gray-100 text-gray-700 border-gray-200",
  standard: "bg-blue-50 text-blue-700 border-blue-200",
  premium:  "bg-purple-50 text-purple-700 border-purple-200",
  luxury:   "bg-amber-50 text-amber-700 border-amber-200",
};

function numericField(v: string) {
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0;
}

// ── Cost Model Edit Modal ─────────────────────────────────────────────────────

type CostModelForm = {
  baseCostPerSqft: string;
  laborCostPerSqft: string;
  materialCostPerSqft: string;
  overheadPct: string;
  contingencyPct: string;
  notes: string;
};

function CostModelModal({
  model,
  onClose,
}: {
  model: CostModelRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateCostModel();

  const [form, setForm] = useState<CostModelForm>({
    baseCostPerSqft:    model.baseCostPerSqft,
    laborCostPerSqft:   model.laborCostPerSqft,
    materialCostPerSqft: model.materialCostPerSqft,
    overheadPct:        model.overheadPct,
    contingencyPct:     model.contingencyPct,
    notes:              model.notes ?? "",
  });

  const [errors, setErrors] = useState<Partial<CostModelForm>>({});

  function validate() {
    const e: Partial<CostModelForm> = {};
    const numFields: (keyof CostModelForm)[] = [
      "baseCostPerSqft", "laborCostPerSqft", "materialCostPerSqft",
      "overheadPct", "contingencyPct",
    ];
    for (const f of numFields) {
      if (!numericField(form[f])) e[f] = "Must be a valid number ≥ 0";
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
          void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
          toast({ title: "Cost model updated" });
          onClose();
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  }

  const field = (
    key: keyof CostModelForm,
    label: string,
    suffix?: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
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
          <DialogDescription className="text-xs">
            {model.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            {field("baseCostPerSqft",    "Base $/sqft",     "$/sqft")}
            {field("laborCostPerSqft",   "Labour $/sqft",   "$/sqft")}
            {field("materialCostPerSqft","Material $/sqft",  "$/sqft")}
            {field("overheadPct",        "Overhead %",      "%")}
            {field("contingencyPct",     "Contingency %",   "%")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Builder-grade finishes, standard fixtures"
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            style={{ background: BLACK, color: "white" }}
            disabled={updateMutation.isPending}
            onClick={handleSave}
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cost Models Tab ───────────────────────────────────────────────────────────

function CostModelsTab({ models }: { models: CostModelRecord[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteCostModel();
  const createMutation = useCreateCostModel();

  const [editModel, setEditModel] = useState<CostModelRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CostModelRecord | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = models.reduce<Record<string, CostModelRecord[]>>((acc, m) => {
    if (!acc[m.projectType]) acc[m.projectType] = [];
    acc[m.projectType]!.push(m);
    return acc;
  }, {});

  const allTypes = Object.keys(PROJECT_TYPE_LABELS);

  const missingFinishLevels = (type: string): string[] => {
    const existing = (grouped[type] ?? []).map(m => m.finishLevel);
    return FINISH_LEVELS.filter(fl => !existing.includes(fl));
  };

  const [newModelForm, setNewModelForm] = useState({
    finishLevel: "standard" as string,
    baseCostPerSqft: "",
    laborCostPerSqft: "",
    materialCostPerSqft: "",
    overheadPct: "10",
    contingencyPct: "10",
    notes: "",
  });
  const [newModelErrors, setNewModelErrors] = useState<Record<string, string>>({});

  function toggleCollapse(type: string) {
    setCollapsed(s => {
      const n = new Set(s);
      n.has(type) ? n.delete(type) : n.add(type);
      return n;
    });
  }

  function handleAdd(projectType: string) {
    const missing = missingFinishLevels(projectType);
    setNewModelForm(f => ({ ...f, finishLevel: missing[0] ?? "standard" }));
    setAddingType(projectType);
  }

  function validateNewModel() {
    const e: Record<string, string> = {};
    const numFields = [
      "baseCostPerSqft", "laborCostPerSqft", "materialCostPerSqft",
      "overheadPct", "contingencyPct",
    ] as const;
    for (const f of numFields) {
      if (!numericField(newModelForm[f])) e[f] = "Must be a valid number ≥ 0";
    }
    setNewModelErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAddSave() {
    if (!addingType) return;
    if (!validateNewModel()) return;
    const label = PROJECT_TYPE_LABELS[addingType] ?? addingType;
    const fl = newModelForm.finishLevel;
    createMutation.mutate(
      {
        data: {
          projectType: addingType,
          finishLevel: fl as "basic" | "standard" | "premium" | "luxury",
          name: `${label} — ${fl.charAt(0).toUpperCase() + fl.slice(1)}`,
          baseCostPerSqft: newModelForm.baseCostPerSqft,
          laborCostPerSqft: newModelForm.laborCostPerSqft,
          materialCostPerSqft: newModelForm.materialCostPerSqft,
          overheadPct: newModelForm.overheadPct,
          contingencyPct: newModelForm.contingencyPct,
          notes: newModelForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
          toast({ title: "Cost model created" });
          setAddingType(null);
        },
        onError: () => toast({ title: "Failed to create", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-3">
      {allTypes.map(type => {
        const rows = grouped[type] ?? [];
        const isOpen = !collapsed.has(type);
        const missing = missingFinishLevels(type);

        return (
          <div key={type} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => toggleCollapse(type)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {isOpen
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-semibold text-sm">
                  {PROJECT_TYPE_LABELS[type] ?? type}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {rows.length} / {FINISH_LEVELS.length}
                </Badge>
              </div>
              {missing.length > 0 && (
                <span className="text-[10px] text-amber-600 font-medium">
                  Missing: {missing.join(", ")}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="divide-y divide-border/40">
                {rows.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground italic">No models seeded for this type.</p>
                )}
                {FINISH_LEVELS.map(fl => {
                  const m = rows.find(r => r.finishLevel === fl);
                  if (!m) return null;
                  return (
                    <div key={fl} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/10 group">
                      <Badge className={cn("text-[10px] capitalize border w-20 justify-center shrink-0", FINISH_LEVEL_COLORS[fl])}>
                        {fl}
                      </Badge>
                      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Base: </span>
                          <span className="font-semibold">${m.baseCostPerSqft}/sqft</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Labour: </span>
                          <span className="font-semibold">${m.laborCostPerSqft}/sqft</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Material: </span>
                          <span className="font-semibold">${m.materialCostPerSqft}/sqft</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Overhead: </span>
                          <span className="font-semibold">{m.overheadPct}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Contingency: </span>
                          <span className="font-semibold">{m.contingencyPct}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditModel(m)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteConfirm(m)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {missing.length > 0 && (
                  <div className="px-4 py-2.5 flex items-center justify-between bg-amber-50/50">
                    <span className="text-xs text-amber-700">
                      Missing finish level{missing.length > 1 ? "s" : ""}: {missing.map(fl => fl.charAt(0).toUpperCase() + fl.slice(1)).join(", ")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => handleAdd(type)}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editModel && (
        <CostModelModal
          model={editModel}
          onClose={() => setEditModel(null)}
        />
      )}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={o => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete cost model?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{deleteConfirm.name}</strong>. The estimator will fall back to other models if available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() =>
                  deleteMutation.mutate(
                    { id: deleteConfirm.id },
                    {
                      onSuccess: () => {
                        void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                        toast({ title: "Deleted" });
                        setDeleteConfirm(null);
                      },
                      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
                    },
                  )
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {addingType && (
        <Dialog open onOpenChange={o => !o && setAddingType(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Add Cost Model
              </DialogTitle>
              <DialogDescription className="text-xs">
                {PROJECT_TYPE_LABELS[addingType] ?? addingType}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Finish Level</Label>
                <Select
                  value={newModelForm.finishLevel}
                  onValueChange={v => setNewModelForm(f => ({ ...f, finishLevel: v }))}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {missingFinishLevels(addingType).map(fl => (
                      <SelectItem key={fl} value={fl} className="capitalize">{fl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["baseCostPerSqft", "Base $/sqft", "$/sqft"],
                  ["laborCostPerSqft", "Labour $/sqft", "$/sqft"],
                  ["materialCostPerSqft", "Material $/sqft", "$/sqft"],
                  ["overheadPct", "Overhead %", "%"],
                  ["contingencyPct", "Contingency %", "%"],
                ] as [keyof typeof newModelForm, string, string][]).map(([key, label, suffix]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <div className="relative">
                      <Input
                        value={newModelForm[key]}
                        onChange={e => setNewModelForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder="0.00"
                        className={cn("pr-10 text-sm", newModelErrors[key] && "border-red-400 focus-visible:ring-red-400")}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
                    </div>
                    {newModelErrors[key] && <p className="text-[11px] text-red-500">{newModelErrors[key]}</p>}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={newModelForm.notes}
                  onChange={e => setNewModelForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Builder-grade finishes"
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddingType(null)}>Cancel</Button>
              <Button
                size="sm"
                style={{ background: BLACK, color: "white" }}
                disabled={createMutation.isPending}
                onClick={handleAddSave}
              >
                {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Add-ons Tab ───────────────────────────────────────────────────────────────

type AddonForm = {
  name: string;
  addonKey: string;
  description: string;
  costType: string;
  amount: string;
  applicableTypes: string;
};

const BLANK_ADDON: AddonForm = {
  name: "",
  addonKey: "",
  description: "",
  costType: "flat",
  amount: "",
  applicableTypes: "",
};

function AddonModal({
  addon,
  onClose,
}: {
  addon: AddonRecord | "new";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateAddon();
  const updateMutation = useUpdateAddon();

  const isNew = addon === "new";
  const [form, setForm] = useState<AddonForm>(
    isNew
      ? BLANK_ADDON
      : {
          name: (addon as AddonRecord).name,
          addonKey: (addon as AddonRecord).addonKey,
          description: (addon as AddonRecord).description ?? "",
          costType: (addon as AddonRecord).costType,
          amount: (addon as AddonRecord).amount,
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
      name: form.name.trim(),
      addonKey: form.addonKey.trim(),
      description: form.description || undefined,
      costType: form.costType as "flat" | "per_sqft",
      amount: form.amount,
      applicableTypes: form.applicableTypes || undefined,
    };
    if (isNew) {
      createMutation.mutate(
        { data: body },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
            toast({ title: "Add-on created" });
            onClose();
          },
          onError: () => toast({ title: "Failed to create", variant: "destructive" }),
        },
      );
    } else {
      updateMutation.mutate(
        { id: (addon as AddonRecord).id, data: body },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
            toast({ title: "Add-on updated" });
            onClose();
          },
          onError: () => toast({ title: "Failed to save", variant: "destructive" }),
        },
      );
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
                value={form.name}
                onChange={e => {
                  const n = e.target.value;
                  setForm(f => ({
                    ...f,
                    name: n,
                    addonKey: isNew
                      ? n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
                      : f.addonKey,
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
              <Select
                value={form.costType}
                onValueChange={v => setForm(f => ({ ...f, costType: v }))}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat Rate</SelectItem>
                  <SelectItem value="per_sqft">Per Sqft</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Amount ({form.costType === "per_sqft" ? "$/sqft" : "$ flat"})
              </Label>
              <Input
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
                value={form.description}
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
            <p className="text-[10px] text-muted-foreground">Comma-separated project type keys. Leave blank to apply to all types.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            style={{ background: BLACK, color: "white" }}
            disabled={isPending}
            onClick={handleSave}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {isNew ? "Create Add-on" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddonsTab({ addons }: { addons: AddonRecord[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteAddon();

  const [editAddon, setEditAddon] = useState<AddonRecord | "new" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AddonRecord | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {addons.length} add-on{addons.length !== 1 ? "s" : ""} configured
        </p>
        <Button
          size="sm"
          style={{ background: BLACK, color: "white" }}
          className="gap-1.5 text-xs h-8"
          onClick={() => setEditAddon("new")}
        >
          <Plus className="h-3.5 w-3.5" />
          New Add-on
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {addons.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No add-ons configured yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Key</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {addons.map(a => (
                <tr key={a.id} className="hover:bg-muted/10 group">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{a.name}</div>
                    {a.description && (
                      <div className="text-[11px] text-muted-foreground">{a.description}</div>
                    )}
                    {a.applicableTypes && (
                      <div className="text-[10px] text-amber-600 mt-0.5">
                        Only: {a.applicableTypes.split(",").map(t => PROJECT_TYPE_LABELS[t.trim()] ?? t.trim()).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {a.addonKey}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {a.costType === "per_sqft" ? "per sqft" : "flat"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-sm">
                    {a.costType === "per_sqft"
                      ? `$${parseFloat(a.amount).toFixed(2)}/sqft`
                      : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(parseFloat(a.amount))
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditAddon(a)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteConfirm(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editAddon !== null && (
        <AddonModal addon={editAddon} onClose={() => setEditAddon(null)} />
      )}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={o => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete add-on?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{deleteConfirm.name}</strong>.
                Existing estimates that used this add-on are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() =>
                  deleteMutation.mutate(
                    { id: deleteConfirm.id },
                    {
                      onSuccess: () => {
                        void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                        toast({ title: "Add-on deleted" });
                        setDeleteConfirm(null);
                      },
                      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
                    },
                  )
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PricingSettingsBody() {
  const [activeTab, setActiveTab] = useState<"models" | "addons">("models");
  const { data, isLoading, isError } = useListCostModels();
  const models: CostModelRecord[] = data?.models ?? [];
  const addons: AddonRecord[] = data?.addons ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          These rates are shared across all company users. The AI only identifies project parameters — it does not change these rates.
          Editing a rate will affect all new estimates immediately.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "models", label: "Cost Models", icon: LayoutGrid },
          { key: "addons", label: "Add-ons & Upgrades", icon: Tag },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading pricing data…</span>
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center py-16 gap-2 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">Failed to load pricing data.</span>
        </div>
      ) : activeTab === "models" ? (
        <CostModelsTab models={models} />
      ) : (
        <AddonsTab addons={addons} />
      )}
    </div>
  );
}

export default function PricingManagerPage() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
  if (me && me.role !== "owner") {
    navigate("/dashboard");
    return null;
  }
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-6 w-6" style={{ color: GOLD }} />
          Pricing Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize the $/sqft rates, overhead, and contingency used by the Smart Estimator.
          Changes apply immediately to all new estimates.
        </p>
      </div>
      <PricingSettingsBody />
    </div>
  );
}
