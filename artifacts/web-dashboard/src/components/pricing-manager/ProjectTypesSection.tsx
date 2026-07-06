import { useCallback, useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Edit3, Trash2, Plus, Loader2, Settings2 } from "lucide-react";
import { BLACK, DEFAULT_PROJECT_TYPE_LABELS, AccordionSection } from "@/components/pricing-manager/shared";
import { useUpdateProjectTypeLabel, useDeleteProjectTypeLabel } from "@/hooks/pricing-manager/useProjectTypeLabels";

// ── Project Types Section (left panel) ───────────────────────────────────────

export function ProjectTypesSection({
  projectTypes,
  companyId,
  search = "",
}: {
  projectTypes: Record<string, string>;
  companyId: number;
  /** Lowercased, trimmed search query shared across the Pricing Manager. */
  search?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [form, setForm] = useState({ key: "", label: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDefault = useCallback(
    (k: string) => Object.prototype.hasOwnProperty.call(DEFAULT_PROJECT_TYPE_LABELS, k),
    [],
  );

  const updateMutation = useUpdateProjectTypeLabel(companyId, projectTypes, isDefault, () => {
    setAddOpen(false); setEditKey(null); setForm({ key: "", label: "" }); setErrors({});
  });

  const deleteMutation = useDeleteProjectTypeLabel(companyId, projectTypes, isDefault, () => {
    setDeleteKey(null);
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
    updateMutation.mutate({ key, label: form.label.trim().slice(0, 100), isEdit: !!editKey });
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
