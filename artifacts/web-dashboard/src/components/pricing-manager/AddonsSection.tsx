import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAddon,
  useUpdateAddon,
  useDeleteAddon,
  getListCostModelsQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { AddonRecord } from "@workspace/api-client-react";
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
import { Edit3, Trash2, Plus, Loader2, Tag, Search } from "lucide-react";
import { BLACK, fmtCAD, numericField, AccordionSection } from "@/components/pricing-manager/shared";
import { useForceDeleteAddon } from "@/hooks/pricing-manager/useAddons";

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

// ── Add-ons Section (left panel) ──────────────────────────────────────────────

export function AddonsSection({
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

  const forceDelete = useForceDeleteAddon(() => setDeleteWarning(null));
  const isDeleting = deleteMutation.isPending || forceDelete.isPending;

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
                  deleteMutation.mutate({ id: deleteConfirm.id }, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: getListCostModelsQueryKey() });
                      toast({ title: "Add-on deleted" });
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
                <strong>{deleteWarning.item.name}</strong> has been used in {deleteWarning.count} saved estimate{deleteWarning.count === 1 ? "" : "s"}.
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
