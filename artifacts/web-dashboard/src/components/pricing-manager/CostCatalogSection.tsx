import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCostCatalogItem,
  useUpdateCostCatalogItem,
  useDeleteCostCatalogItem,
  useBulkImportCostCatalog,
  getListCostCatalogQueryKey,
} from "@workspace/api-client-react";
import type { CostCatalogItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Loader2, BookOpen, Search, Upload, Download } from "lucide-react";
import {
  BLACK,
  numericField,
  guardNumericInput,
  AccordionSection,
  COST_CATALOG_UNIT_TYPES,
  UNIT_TYPE_LABELS,
  type CostCatalogUnitType,
  parseCostCatalogCsv,
  downloadCostCatalogTemplate,
  type ParsedCatalogRow,
} from "@/components/pricing-manager/shared";

const DEFAULT_CATEGORIES = ["Framing", "Plumbing", "Electrical", "Concrete", "Finishes", "Drywall", "Roofing", "Painting", "Tile", "General"];

// ── Quick Add Modal ──────────────────────────────────────────────────────────

type ItemForm = {
  category: string;
  itemName: string;
  description: string;
  unitType: CostCatalogUnitType;
  costPrice: string;
  unitPrice: string;
  defaultMarkupPercent: string;
};

function blankForm(category: string): ItemForm {
  return { category, itemName: "", description: "", unitType: "unit", costPrice: "", unitPrice: "", defaultMarkupPercent: "15" };
}

function QuickAddModal({
  categories,
  defaultCategory,
  onClose,
}: {
  categories: string[];
  defaultCategory: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMutation = useCreateCostCatalogItem();
  const [form, setForm] = useState<ItemForm>(blankForm(defaultCategory));
  const [errors, setErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});

  function validate() {
    const e: Partial<Record<keyof ItemForm, string>> = {};
    if (!form.category.trim()) e.category = "Category is required";
    if (!form.itemName.trim()) e.itemName = "Item name is required";
    if (!numericField(form.costPrice)) e.costPrice = "Must be a valid number ≥ 0";
    if (!numericField(form.unitPrice)) e.unitPrice = "Must be a valid number ≥ 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    createMutation.mutate({
      data: {
        category: form.category.trim().slice(0, 100),
        itemName: form.itemName.trim().slice(0, 200),
        description: form.description.trim().slice(0, 1000) || undefined,
        unitType: form.unitType,
        costPrice: form.costPrice,
        unitPrice: form.unitPrice,
        defaultMarkupPercent: form.defaultMarkupPercent || "15",
      },
    }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() });
        toast({ title: "Item added" });
        onClose();
      },
      onError: () => toast({ title: "Failed to create", variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Add Catalog Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Item Name</Label>
              <Input
                value={form.itemName} maxLength={200}
                onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))}
                placeholder="e.g. Wall Framing (2x4/2x6)"
                className={cn("text-sm", errors.itemName && "border-red-400")}
              />
              {errors.itemName && <p className="text-[11px] text-red-500">{errors.itemName}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input
                value={form.category} maxLength={100}
                list="cost-catalog-categories"
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Framing"
                className={cn("text-sm", errors.category && "border-red-400")}
              />
              <datalist id="cost-catalog-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
              {errors.category && <p className="text-[11px] text-red-500">{errors.category}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit of Measure</Label>
              <Select value={form.unitType} onValueChange={v => setForm(f => ({ ...f, unitType: v as CostCatalogUnitType }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_CATALOG_UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{UNIT_TYPE_LABELS[u]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cost Price ($)</Label>
              <Input
                type="number" min={0}
                value={form.costPrice}
                onChange={e => setForm(f => ({ ...f, costPrice: guardNumericInput(e.target.value) }))}
                placeholder="0.00"
                className={cn("text-sm", errors.costPrice && "border-red-400")}
              />
              {errors.costPrice && <p className="text-[11px] text-red-500">{errors.costPrice}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit Price ($)</Label>
              <Input
                type="number" min={0}
                value={form.unitPrice}
                onChange={e => setForm(f => ({ ...f, unitPrice: guardNumericInput(e.target.value) }))}
                placeholder="0.00"
                className={cn("text-sm", errors.unitPrice && "border-red-400")}
              />
              {errors.unitPrice && <p className="text-[11px] text-red-500">{errors.unitPrice}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default Markup %</Label>
              <Input
                type="number" min={0} max={500}
                value={form.defaultMarkupPercent}
                onChange={e => setForm(f => ({ ...f, defaultMarkupPercent: guardNumericInput(e.target.value, 500) }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                value={form.description} maxLength={1000} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
                className="text-sm"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" style={{ background: BLACK, color: "white" }} disabled={createMutation.isPending} onClick={handleSave}>
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CSV Import Modal ─────────────────────────────────────────────────────────

function CsvImportModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const bulkImport = useBulkImportCostCatalog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedCatalogRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const validRows = rows.filter(r => !r.error);
  const invalidCount = rows.length - validRows.length;

  async function handleFile(file: File) {
    const text = await file.text();
    setFileName(file.name);
    setRows(parseCostCatalogCsv(text));
  }

  function handleImport() {
    if (validRows.length === 0) return;
    bulkImport.mutate({
      data: {
        items: validRows.map(r => ({
          category: r.category,
          itemName: r.itemName,
          description: r.description || undefined,
          unitType: r.unitType,
          costPrice: r.costPrice,
          unitPrice: r.unitPrice,
          defaultMarkupPercent: r.defaultMarkupPercent,
        })),
      },
    }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() });
        toast({ title: `Imported ${validRows.length} item${validRows.length === 1 ? "" : "s"}` });
        onClose();
      },
      onError: () => toast({ title: "Import failed", variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-full">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Import Price List (CSV)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Choose CSV
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={downloadCostCatalogTemplate}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Columns: category, itemName, description, unitType (sqft/linft/hour/flat/unit), costPrice, unitPrice, defaultMarkupPercent
          </p>
          {rows.length > 0 && (
            <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Category</th>
                    <th className="text-left px-2 py-1.5 font-medium">Item</th>
                    <th className="text-left px-2 py-1.5 font-medium">Unit</th>
                    <th className="text-right px-2 py-1.5 font-medium">Unit Price</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn("border-t border-border/60", r.error && "bg-red-50")}>
                      <td className="px-2 py-1.5">{r.category || "—"}</td>
                      <td className="px-2 py-1.5">{r.itemName || "—"}</td>
                      <td className="px-2 py-1.5">{r.unitType}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.unitPrice}</td>
                      <td className="px-2 py-1.5">
                        {r.error
                          ? <span className="text-red-600">{r.error}</span>
                          : <span className="text-green-600">Ready</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {validRows.length} ready to import{invalidCount > 0 ? `, ${invalidCount} skipped due to errors` : ""}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm" style={{ background: BLACK, color: "white" }}
            disabled={validRows.length === 0 || bulkImport.isPending}
            onClick={handleImport}
          >
            {bulkImport.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Import {validRows.length > 0 ? validRows.length : ""} Item{validRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Editable Row ─────────────────────────────────────────────────────────────

function CatalogRow({ item, onDelete }: { item: CostCatalogItem; onDelete: (item: CostCatalogItem) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMutation = useUpdateCostCatalogItem();

  const [unitPrice, setUnitPrice] = useState(item.unitPrice);
  const [costPrice, setCostPrice] = useState(item.costPrice);
  const [markup, setMarkup] = useState(item.defaultMarkupPercent);

  function commit(field: "unitPrice" | "costPrice" | "defaultMarkupPercent", value: string, original: string) {
    if (value === original || !numericField(value)) return;
    updateMutation.mutate({ id: item.id, data: { [field]: value } }, {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() }),
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  }

  function commitUnitType(value: CostCatalogUnitType) {
    if (value === item.unitType) return;
    updateMutation.mutate({ id: item.id, data: { unitType: value } }, {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() }),
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  }

  return (
    <tr className="border-t border-border/60 hover:bg-muted/20 group">
      <td className="px-3 py-2 min-w-0">
        <div className="text-sm font-medium truncate">{item.itemName}</div>
        {item.description && <div className="text-[11px] text-muted-foreground truncate">{item.description}</div>}
      </td>
      <td className="px-2 py-2">
        <Select value={item.unitType} onValueChange={v => commitUnitType(v as CostCatalogUnitType)}>
          <SelectTrigger className="h-7 text-xs border-0 bg-transparent hover:bg-muted/40 focus:ring-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COST_CATALOG_UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{UNIT_TYPE_LABELS[u]}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-2">
        <input
          type="number" min={0} value={costPrice}
          onChange={e => setCostPrice(e.target.value)}
          onBlur={() => commit("costPrice", costPrice, item.costPrice)}
          className="w-20 bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary text-sm text-right tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number" min={0} value={unitPrice}
          onChange={e => setUnitPrice(e.target.value)}
          onBlur={() => commit("unitPrice", unitPrice, item.unitPrice)}
          className="w-20 bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary text-sm text-right font-medium tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-0.5 justify-end">
          <input
            type="number" min={0} max={500} value={markup}
            onChange={e => setMarkup(e.target.value)}
            onBlur={() => commit("defaultMarkupPercent", markup, item.defaultMarkupPercent)}
            className="w-14 bg-transparent border-0 border-b border-transparent group-hover:border-border focus:border-primary text-sm text-right tabular-nums outline-none"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </td>
      <td className="px-2 py-2">
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(item)}
          aria-label="Delete item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// ── Cost Catalog Section (left panel) ─────────────────────────────────────────

export function CostCatalogSection({
  items,
  search = "",
}: {
  items: CostCatalogItem[];
  /** Lowercased, trimmed search query shared across the Pricing Manager. */
  search?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deleteMutation = useDeleteCostCatalogItem();

  const [activeCategory, setActiveCategory] = useState("All");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CostCatalogItem | null>(null);

  const categories = useMemo(() => {
    const fromItems = [...new Set(items.map(i => i.category))];
    return [...new Set([...DEFAULT_CATEGORIES.filter(c => fromItems.includes(c)), ...fromItems])].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeCategory !== "All") list = list.filter(i => i.category === activeCategory);
    if (search) {
      list = list.filter(i =>
        i.itemName.toLowerCase().includes(search) ||
        i.category.toLowerCase().includes(search) ||
        (i.description ?? "").toLowerCase().includes(search),
      );
    }
    return list;
  }, [items, activeCategory, search]);

  return (
    <AccordionSection
      title="Cost Catalog"
      icon={BookOpen}
      keepOpenWhen={!!search && filteredItems.length > 0}
      badge={
        items.length > 0
          ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{items.length}</Badge>
          : undefined
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="All" className="text-xs">All</TabsTrigger>
              {categories.map(c => <TabsTrigger key={c} value={c} className="text-xs">{c}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setShowCsvImport(true)}>
              <Upload className="h-3 w-3" /> Import CSV
            </Button>
            <Button size="sm" style={{ background: BLACK, color: "white" }} className="gap-1.5 text-xs h-7"
              onClick={() => setShowQuickAdd(true)}>
              <Plus className="h-3 w-3" /> Quick Add
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No catalog items yet.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No items match{search ? ` "${search}"` : " this category"}.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-[11px] text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-left px-2 py-2 font-medium">Unit</th>
                  <th className="text-right px-2 py-2 font-medium">Unit Cost</th>
                  <th className="text-right px-2 py-2 font-medium">Unit Price</th>
                  <th className="text-right px-2 py-2 font-medium">Markup</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <CatalogRow key={item.id} item={item} onDelete={setDeleteConfirm} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showQuickAdd && (
        <QuickAddModal
          categories={categories}
          defaultCategory={activeCategory !== "All" ? activeCategory : (categories[0] ?? "General")}
          onClose={() => setShowQuickAdd(false)}
        />
      )}

      {showCsvImport && <CsvImportModal onClose={() => setShowCsvImport(false)} />}

      {deleteConfirm && (
        <AlertDialog open onOpenChange={o => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete catalog item?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete <strong>{deleteConfirm.itemName}</strong> from the cost catalog.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate({ id: deleteConfirm.id }, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: getListCostCatalogQueryKey() });
                      toast({ title: "Item deleted" });
                      setDeleteConfirm(null);
                    },
                    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
                  });
                }}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AccordionSection>
  );
}
