import { useState, useCallback, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Loader2, Package, AlertTriangle, CheckCircle2, XCircle, Pencil, Trash2 } from "lucide-react";
import {
  BORDER, SURFACE2, MUTED, TEXT, GOLD_BUTTON, MATERIAL_CATEGORY_LABELS, UNIT_LABELS,
  debounce, stockBadge, Pill, SearchBox, StatTile, EmptyBlock, SkeletonCard,
  type MaterialRow,
} from "@/components/inventory/shared";
import { useMaterialsList, useDeleteMaterial, useSaveMaterial } from "@/hooks/inventory/useMaterials";

const CATEGORIES = [
  "all", "lumber", "concrete", "gravel", "safety_gear",
  "hardware", "plumbing", "electrical", "other",
];

// Off-screen cards skip layout/paint until scrolled into view; the reserved
// height keeps the grid's scrollbar stable while that content is unmounted.
const CARD_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 170px" };

interface MaterialCardProps {
  material: MaterialRow;
  onEdit: (m: MaterialRow) => void;
  onDelete: (id: number) => void;
  onGeneratePO: (m: MaterialRow) => void;
}

const MaterialCard = memo(function MaterialCard({ material: m, onEdit, onDelete, onGeneratePO }: MaterialCardProps) {
  const badge = stockBadge(m.stockStatus);
  const qty = parseFloat(m.quantityOnHand);
  const threshold = m.reorderThreshold ? parseFloat(m.reorderThreshold) : null;
  return (
    <div
      className="rounded-2xl bg-white p-4 group relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
      style={{ border: `1px solid ${BORDER}`, ...CARD_CONTAINMENT_STYLE }}
    >
      {/* Stoplight badge */}
      <div className="mb-3">
        <Pill label={badge.label} color={badge.color} bg={badge.bg} border={badge.border} />
      </div>

      <p className="text-sm font-semibold mb-1 truncate" style={{ color: TEXT }}>{m.name}</p>
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        {MATERIAL_CATEGORY_LABELS[m.category] ?? m.category}
        {m.location ? ` · ${m.location}` : ""}
      </p>

      {/* Quantity */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-black" style={{ color: TEXT }}>{qty % 1 === 0 ? qty : qty.toFixed(1)}</p>
          <p className="text-[11px]" style={{ color: MUTED }}>{UNIT_LABELS[m.unit] ?? m.unit} on hand</p>
        </div>
        {threshold !== null && (
          <div className="text-right">
            <p className="text-[10px]" style={{ color: MUTED }}>Reorder at</p>
            <p className="text-xs font-bold" style={{ color: TEXT }}>{threshold} {UNIT_LABELS[m.unit]}</p>
          </div>
        )}
      </div>

      {/* PO Action */}
      {m.stockStatus === "out_of_stock" && (
        <button
          className="mt-3 w-full text-center text-[11px] font-semibold rounded-lg px-2 py-1.5 transition-colors"
          style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca" }}
          onClick={() => onGeneratePO(m)}
        >
          Auto-generate Purchase Order
        </button>
      )}
      {m.stockStatus === "low_stock" && (
        <button
          className="mt-3 w-full text-center text-[11px] font-semibold rounded-lg px-2 py-1.5 transition-colors"
          style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}
          onClick={() => onGeneratePO(m)}
        >
          Generate Reorder PO
        </button>
      )}

      {/* Action menu */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded-md"
          style={{ background: "transparent" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SURFACE2; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          onClick={() => onEdit(m)}
        >
          <Pencil size={12} style={{ color: MUTED }} />
        </button>
        <button
          className="p-1 rounded-md hover:bg-red-50"
          onClick={() => onDelete(m.id)}
        >
          <Trash2 size={12} className="text-red-400" />
        </button>
      </div>
    </div>
  );
});

export function MaterialsTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addModal, setAddModal] = useState(false);
  const [editMaterial, setEditMaterial] = useState<MaterialRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [poModal, setPoModal] = useState<MaterialRow | null>(null);

  const debounceFn = useCallback(debounce((v: string) => setDebouncedSearch(v), 300), []);
  useEffect(() => debounceFn(search), [search, debounceFn]);

  const { data, isLoading } = useMaterialsList(categoryFilter, debouncedSearch);
  const deleteMaterial = useDeleteMaterial(() => setDeleteId(null));

  const materials = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In Stock", status: "in_stock", icon: CheckCircle2, color: "#16a34a" },
          { label: "Low Stock", status: "low_stock", icon: AlertTriangle, color: "#d97706" },
          { label: "Out of Stock", status: "out_of_stock", icon: XCircle, color: "#dc2626" },
        ].map(({ label, status, icon, color }) => {
          const count = materials.filter((m) => m.stockStatus === status).length;
          return (
            <StatTile key={status} label={label} value={count} icon={icon} color={color} loading={isLoading} />
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchBox
          className="flex-1 min-w-[200px]"
          value={search}
          onChange={setSearch}
          placeholder="Search materials…"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === "all" ? "All Categories" : MATERIAL_CATEGORY_LABELS[c] ?? c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className={GOLD_BUTTON} onClick={() => setAddModal(true)}>
          <Plus size={14} className="mr-1" /> Add Material
        </Button>
      </div>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : materials.length === 0 ? (
        <EmptyBlock icon={Package} title="No materials found" sub="Add bulk commodities to track stock levels" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {materials.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onEdit={setEditMaterial}
              onDelete={setDeleteId}
              onGeneratePO={setPoModal}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Material Modal */}
      <MaterialModal
        open={addModal || editMaterial !== null}
        existing={editMaterial}
        onClose={() => { setAddModal(false); setEditMaterial(null); }}
        onSaved={() => { setAddModal(false); setEditMaterial(null); }}
      />

      {/* PO Modal */}
      {poModal && (
        <PurchaseOrderModal
          material={poModal}
          onClose={() => setPoModal(null)}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this material and its stock record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteMaterial.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MaterialModal({
  open, existing, onClose, onSaved,
}: {
  open: boolean; existing: MaterialRow | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    category: existing?.category ?? "lumber",
    unit: existing?.unit ?? "each",
    quantityOnHand: existing?.quantityOnHand ?? "0",
    reorderThreshold: existing?.reorderThreshold ?? "",
    reorderQty: existing?.reorderQty ?? "",
    unitCost: existing?.unitCost ?? "",
    location: existing?.location ?? "",
    notes: existing?.notes ?? "",
  });

  const saveMaterial = useSaveMaterial(existing?.id, onSaved);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name, category: existing.category, unit: existing.unit,
        quantityOnHand: existing.quantityOnHand, reorderThreshold: existing.reorderThreshold ?? "",
        reorderQty: existing.reorderQty ?? "", unitCost: existing.unitCost ?? "",
        location: existing.location ?? "", notes: existing.notes ?? "",
      });
    } else {
      setForm({ name: "", category: "lumber", unit: "each", quantityOnHand: "0", reorderThreshold: "", reorderQty: "", unitCost: "", location: "", notes: "" });
    }
  }, [existing]);

  function handleSave() {
    if (!form.name.trim()) return;
    saveMaterial.mutate({
      name: form.name, category: form.category, unit: form.unit,
      quantityOnHand: parseFloat(form.quantityOnHand || "0"),
      reorderThreshold: form.reorderThreshold ? parseFloat(form.reorderThreshold) : undefined,
      reorderQty: form.reorderQty ? parseFloat(form.reorderQty) : undefined,
      unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
    });
  }

  const FORM_CATEGORIES = ["lumber", "concrete", "gravel", "safety_gear", "hardware", "plumbing", "electrical", "other"];
  const UNITS = ["bags", "cubic_yards", "board_feet", "each", "lbs", "gallons", "boxes", "rolls", "sheets"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Material" : "Add Material"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 2x4 Lumber" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{MATERIAL_CATEGORY_LABELS[c] ?? c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABELS[u] ?? u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Qty on Hand</Label>
              <Input type="number" min="0" value={form.quantityOnHand} onChange={(e) => setForm((f) => ({ ...f, quantityOnHand: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Reorder at</Label>
              <Input type="number" min="0" value={form.reorderThreshold} onChange={(e) => setForm((f) => ({ ...f, reorderThreshold: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Unit Cost ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs">Storage Location</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Main Yard" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className={GOLD_BUTTON} onClick={handleSave} disabled={saveMaterial.isPending || !form.name.trim()}>
            {saveMaterial.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {existing ? "Update" : "Add Material"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseOrderModal({ material, onClose }: { material: MaterialRow; onClose: () => void }) {
  const reorderQty = material.reorderQty ? parseFloat(material.reorderQty) : 10;
  const unitCost = material.unitCost ? parseFloat(material.unitCost) : 0;
  const total = reorderQty * unitCost;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Purchase Order Draft</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-lg p-3" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
            <p className="font-semibold" style={{ color: TEXT }}>{material.name}</p>
            <p className="text-xs" style={{ color: MUTED }}>{MATERIAL_CATEGORY_LABELS[material.category] ?? material.category}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span style={{ color: MUTED }}>Current Stock</span>
              <span className="font-medium" style={{ color: TEXT }}>{material.quantityOnHand} {UNIT_LABELS[material.unit]}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: MUTED }}>Order Qty</span>
              <span className="font-medium" style={{ color: TEXT }}>{reorderQty} {UNIT_LABELS[material.unit]}</span>
            </div>
            {unitCost > 0 && (
              <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
                <span style={{ color: MUTED }}>Estimated Total</span>
                <span className="font-bold" style={{ color: TEXT }}>${total.toFixed(2)}</span>
              </div>
            )}
          </div>
          <p className="text-xs" style={{ color: MUTED }}>
            Review and send this PO to your preferred supplier. Quantities can be adjusted before sending.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            className={GOLD_BUTTON}
            onClick={() => {
              const text = `PURCHASE ORDER\n\nItem: ${material.name}\nQty: ${reorderQty} ${UNIT_LABELS[material.unit]}${unitCost > 0 ? `\nUnit Cost: $${unitCost.toFixed(2)}\nTotal: $${total.toFixed(2)}` : ""}\n\nPlease fulfill at earliest availability.`;
              navigator.clipboard.writeText(text).catch(() => {});
              onClose();
            }}
          >
            Copy PO Text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
