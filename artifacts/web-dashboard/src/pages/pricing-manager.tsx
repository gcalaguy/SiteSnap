import { useState } from "react";
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
  LayoutGrid,
  FileText,
  Receipt,
  Search,
  X,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#111111";

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

function CostModelsTab({
  models,
  projectTypes,
}: {
  models: CostModelRecord[];
  projectTypes: Record<string, string>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteCostModel();
  const createMutation = useCreateCostModel();

  const [editModel, setEditModel] = useState<CostModelRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CostModelRecord | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ item: CostModelRecord; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const grouped = models.reduce<Record<string, CostModelRecord[]>>((acc, m) => {
    if (!acc[m.projectType]) acc[m.projectType] = [];
    acc[m.projectType]!.push(m);
    return acc;
  }, {});

  const allTypes = Object.keys(projectTypes);

  const [addingType, setAddingType] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(Object.keys(projectTypes)));
  const [searchQuery, setSearchQuery] = useState("");

  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (m: CostModelRecord) => {
    if (!query) return true;
    const typeLabel = (projectTypes[m.projectType] ?? m.projectType).toLowerCase();
    const haystack = [
      typeLabel,
      m.finishLevel.toLowerCase(),
      m.name.toLowerCase(),
      (m.notes ?? "").toLowerCase(),
      m.baseCostPerSqft,
      m.laborCostPerSqft,
      m.materialCostPerSqft,
      m.overheadPct,
      m.contingencyPct,
    ].join(" ");
    return haystack.includes(query);
  };

  const filteredTypes = allTypes.filter(type => {
    const rows = grouped[type] ?? [];
    return rows.some(matchesSearch);
  });

  const totalVisible = filteredTypes.reduce((sum, t) =>
    sum + (grouped[t] ?? []).filter(matchesSearch).length, 0
  );

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
    const label = projectTypes[addingType] ?? addingType;
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
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search cost models by type, finish, name, rate, or notes..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {totalVisible === 0 && query && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No cost models match "<span className="font-medium text-foreground">{searchQuery}</span>".
        </div>
      )}

      {filteredTypes.map(type => {
        const rows = (grouped[type] ?? []).filter(matchesSearch);
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
                  {projectTypes[type] ?? type}
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
                      {m.sourceType !== "manual" && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] shrink-0 gap-1",
                            m.sourceType === "quote"
                              ? "border-blue-200 text-blue-600"
                              : "border-green-200 text-green-600"
                          )}
                        >
                          {m.sourceType === "quote" ? (
                            <FileText className="h-3 w-3" />
                          ) : (
                            <Receipt className="h-3 w-3" />
                          )}
                          {m.sourceType}
                        </Badge>
                      )}
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
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  deleteMutation.mutate(
                    { id: deleteConfirm.id },
                    {
                      onSuccess: () => {
                        setIsDeleting(false);
                        void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
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
                    },
                  );
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
              <AlertDialogTitle className="text-amber-700">Warning: used in {deleteWarning.count} estimate{deleteWarning.count === 1 ? "" : "s"}</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteWarning.item.name}</strong> has been used in {deleteWarning.count} saved estimate{deleteWarning.count === 1 ? "" : "s"}. Deleting it may cause confusion when viewing old estimate breakdowns.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteWarning(null)}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  customFetch(`/api/estimator/cost-models/${deleteWarning.item.id}?force=true`, { method: "DELETE" })
                    .then(() => {
                      setIsDeleting(false);
                      void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Deleted" });
                      setDeleteWarning(null);
                    })
                    .catch(() => {
                      setIsDeleting(false);
                      toast({ title: "Failed to delete", variant: "destructive" });
                    });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete anyway"}
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
                {projectTypes[addingType] ?? addingType}
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

function AddonsTab({ addons, projectTypes }: { addons: AddonRecord[]; projectTypes: Record<string, string> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteAddon();

  const [editAddon, setEditAddon] = useState<AddonRecord | "new" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AddonRecord | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ item: AddonRecord; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const query = searchQuery.trim().toLowerCase();
  const filteredAddons = addons.filter(a => {
    if (!query) return true;
    const haystack = [
      a.name.toLowerCase(),
      a.addonKey.toLowerCase(),
      (a.description ?? "").toLowerCase(),
      a.costType.toLowerCase(),
      a.amount,
      (a.applicableTypes ?? "").toLowerCase().split(",").map(t => (projectTypes[t.trim()] ?? t.trim()).toLowerCase()).join(" "),
    ].join(" ");
    return haystack.includes(query);
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search add-ons by name, key, type, amount, or description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
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

      {filteredAddons.length === 0 && query && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No add-ons match "<span className="font-medium text-foreground">{searchQuery}</span>".
        </div>
      )}

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
              {filteredAddons.map(a => (
                <tr key={a.id} className="hover:bg-muted/10 group">
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{a.name}</div>
                    {a.description && (
                      <div className="text-[11px] text-muted-foreground">{a.description}</div>
                    )}
                    {a.applicableTypes && (
                      <div className="text-[10px] text-amber-600 mt-0.5">
                        Only: {a.applicableTypes.split(",").map(t => projectTypes[t.trim()] ?? t.trim()).join(", ")}
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
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  deleteMutation.mutate(
                    { id: deleteConfirm.id },
                    {
                      onSuccess: () => {
                        setIsDeleting(false);
                        void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
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
                    },
                  );
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
              <AlertDialogTitle className="text-amber-700">Warning: used in {deleteWarning.count} estimate{deleteWarning.count === 1 ? "" : "s"}</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteWarning.item.name}</strong> has been used in {deleteWarning.count} saved estimate{deleteWarning.count === 1 ? "" : "s"}. Deleting it may cause confusion when viewing old estimate breakdowns.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteWarning(null)}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleting(true);
                  customFetch(`/api/estimator/addons/${deleteWarning.item.id}?force=true`, { method: "DELETE" })
                    .then(() => {
                      setIsDeleting(false);
                      void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Add-on deleted" });
                      setDeleteWarning(null);
                    })
                    .catch(() => {
                      setIsDeleting(false);
                      toast({ title: "Failed to delete", variant: "destructive" });
                    });
                }}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete anyway"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ── Project Types Tab ─────────────────────────────────────────────────────────

function ProjectTypesTab({
  projectTypes,
  companyId,
  onSaved,
}: {
  projectTypes: Record<string, string>;
  companyId: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const [form, setForm] = useState({ key: "", label: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDefault = (k: string) => Object.prototype.hasOwnProperty.call(DEFAULT_PROJECT_TYPE_LABELS, k);

  const updateMutation = useMutation({
    mutationFn: async (payload: { key: string; label: string }) => {
      const current: Record<string, string> = {};
      for (const [k, v] of Object.entries(projectTypes)) {
        if (!isDefault(k)) current[k] = v;
      }
      const next = { ...current, [payload.key]: payload.label };
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: next } }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: editKey ? "Label updated" : "Label created" });
      onSaved();
      setAddOpen(false);
      setEditKey(null);
      setForm({ key: "", label: "" });
      setErrors({});
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const current: Record<string, string> = {};
      for (const [k, v] of Object.entries(projectTypes)) {
        if (!isDefault(k)) current[k] = v;
      }
      delete current[key];
      return customFetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatorConfig: { projectTypeLabels: current } }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(companyId) });
      toast({ title: "Label deleted" });
      onSaved();
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
    updateMutation.mutate({ key, label: form.label.trim() });
  }

  const sorted = Object.entries(projectTypes).sort((a, b) => a[1].localeCompare(b[1]));

  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.trim().toLowerCase();
  const filteredSorted = sorted.filter(([key, label]) => {
    if (!query) return true;
    const haystack = [key.toLowerCase(), label.toLowerCase()].join(" ");
    return haystack.includes(query);
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search project types by name or key..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredSorted.length} project type{filteredSorted.length !== 1 ? "s" : ""}
          {query && <span className="ml-1 text-xs">({sorted.length} total)</span>}
        </p>
        <Button
          size="sm"
          style={{ background: BLACK, color: "white" }}
          className="gap-1.5 text-xs h-8"
          onClick={() => { setForm({ key: "", label: "" }); setEditKey(null); setAddOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Type
        </Button>
      </div>

      {filteredSorted.length === 0 && query && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No project types match "<span className="font-medium text-foreground">{searchQuery}</span>".
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Key</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Display Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Source</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredSorted.map(([key, label]) => (
              <tr key={key} className="group">
                <td className="px-4 py-3">
                  <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{key}</code>
                </td>
                <td className="px-4 py-3 font-medium text-sm">{label}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px]">
                    {isDefault(key) ? "Default" : "Custom"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setForm({ key, label }); setEditKey(key); setAddOpen(true); }}
                      disabled={isDefault(key)}
                      title={isDefault(key) ? "Defaults cannot be edited" : "Edit"}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteKey(key)}
                      disabled={isDefault(key)}
                      title={isDefault(key) ? "Defaults cannot be deleted" : "Delete"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <Dialog open onOpenChange={o => !o && setAddOpen(false)}>
          <DialogContent className="max-w-md">
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
                <Input
                  value={form.key}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                  placeholder="e.g. pole_barn"
                  className={cn("text-sm font-mono", errors.key && "border-red-400")}
                  disabled={!!editKey}
                />
                {errors.key && <p className="text-[11px] text-red-500">{errors.key}</p>}
                <p className="text-[10px] text-muted-foreground">
                  Snake_case key used by the estimator and add-ons. Cannot be changed after creation.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Pole Barn"
                  className={cn("text-sm", errors.label && "border-red-400")}
                />
                {errors.label && <p className="text-[11px] text-red-500">{errors.label}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                style={{ background: BLACK, color: "white" }}
                disabled={updateMutation.isPending}
                onClick={handleSave}
              >
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
                Remove <strong>{projectTypes[deleteKey]}</strong> from the list. Cost models for this type will remain in the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => deleteMutation.mutate(deleteKey)}
              >
                {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
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
  const [activeTab, setActiveTab] = useState<"models" | "types" | "addons">("models");
  const { data, isLoading, isError } = useListCostModels();
  const models: CostModelRecord[] = data?.models ?? [];
  const addons: AddonRecord[] = data?.addons ?? [];
  const projectTypes: Record<string, string> = data?.projectTypes ?? DEFAULT_PROJECT_TYPE_LABELS;
  const { data: me } = useGetMe();
  const companyId = me?.activeCompanyId;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          These rates are specific to your company. The AI only identifies project parameters — it does not change these rates.
          Editing a rate will affect all new estimates immediately.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "models", label: "Cost Models", icon: LayoutGrid },
          { key: "types",  label: "Project Types", icon: Tag },
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
        <CostModelsTab models={models} projectTypes={projectTypes} />
      ) : activeTab === "types" ? (
        <ProjectTypesTab
          projectTypes={projectTypes}
          companyId={companyId ?? 0}
          onSaved={() => {}}
        />
      ) : (
        <AddonsTab addons={addons} projectTypes={projectTypes} />
      )}
    </div>
  );
}
