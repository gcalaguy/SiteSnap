import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Truck, Wrench, Package, Search, CheckCircle2,
} from "lucide-react";
import { useCreateAsset, type AssetCategory } from "@/hooks/inventory/useInventoryAssets";

// ─── Constants & Helpers ──────────────────────────────────────────────────────
// Shared visual language with the Projects screen (pages/projects.tsx):
// crisp 1px borders over heavy shadows, gold accent, glowing status-dot pills.

export const GOLD = "#D4AF37";
export const SURFACE = "#FFFFFF";
export const SURFACE2 = "#F8F8F8";
export const SURFACE3 = "#F0F0F0";
export const BORDER = "#E5E5E5";
export const TEXT = "#111111";
export const MUTED = "#888888";

export const GOLD_BUTTON = "bg-[#D4AF37] text-white hover:bg-[#b5922e]";

export const SCHEDULE_COLORS = [
  "#D4AF37", "#3B82F6", "#10B981", "#8B5CF6",
  "#F59E0B", "#EF4444", "#06B6D4", "#EC4899",
];

export const CATEGORY_LABELS: Record<string, string> = {
  fleet: "Fleet",
  heavy_equipment: "Heavy Equipment",
  small_tool: "Small Tools",
};

export const ASSET_TYPE_ICONS: Record<string, typeof Truck> = {
  truck: Truck, excavator: Wrench, bobcat: Wrench, crane: Wrench,
  lift: Wrench, compactor: Wrench, generator: Wrench, saw: Wrench,
  laser: Wrench, drill: Wrench, welder: Wrench, other: Package,
};

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  lumber: "Lumber", concrete: "Concrete", gravel: "Gravel",
  safety_gear: "Safety Gear", hardware: "Hardware", plumbing: "Plumbing",
  electrical: "Electrical", other: "Other",
};

export const UNIT_LABELS: Record<string, string> = {
  bags: "bags", cubic_yards: "cu yd", board_feet: "bd ft",
  each: "ea", lbs: "lbs", gallons: "gal",
  boxes: "boxes", rolls: "rolls", sheets: "sheets",
};

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function stockBadge(status: string) {
  if (status === "in_stock") return { label: "In Stock", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" };
  if (status === "low_stock") return { label: "Low Stock", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };
  return { label: "Out of Stock", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" };
}

export function getInitials(first?: string | null, last?: string | null): string {
  return `${(first ?? "")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase() || "?";
}

// ─── Types ────────────────────────────────────────────────────────────────────
// These domains have no OpenAPI-generated contract type (inventory endpoints
// are not yet part of the generated client), so they're defined locally.

export type InventoryAsset = {
  id: number; companyId: number; name: string; category: string;
  assetType: string; make: string | null; model: string | null;
  year: string | null; serialNumber: string | null; status: string;
  photoUrl: string | null; dailyCost: string | null;
  lastKnownLat: string | null; lastKnownLng: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
};

export type AssetScheduleRow = {
  id: number; assetId: number; assetName: string | null;
  assetCategory: string | null; assetType: string | null;
  projectId: number | null; projectName: string | null;
  assignedToUserId: number | null; userFirstName: string | null; userLastName: string | null;
  startDate: string; endDate: string; notes: string | null;
  color: string; status: string;
};

export type MaterialRow = {
  id: number; name: string; category: string; unit: string;
  quantityOnHand: string; reorderThreshold: string | null;
  reorderQty: string | null; unitCost: string | null;
  location: string | null; notes: string | null;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
};

export type CheckoutRow = {
  id: number; assetId: number; assetName: string | null; assetType: string | null;
  assetPhotoUrl: string | null; projectId: number | null; projectName: string | null;
  checkedOutToUserId: number | null; userFirstName: string | null; userLastName: string | null;
  checkedOutToContactId: number | null; contactName: string | null;
  checkedOutToName: string | null; status: string;
  checkedOutAt: string; expectedReturnDate: string | null;
};

// ─── Shared Presentational Pieces ─────────────────────────────────────────────

export function Pill({ label, color, bg, border, icon: Icon }: { label: string; color: string; bg: string; border: string; icon?: typeof CheckCircle2 }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {Icon ? <Icon size={9} /> : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 5px 1px ${color}99` }} />
      )}
      {label}
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${className}`}
      style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}
    >
      <Search size={13} style={{ color: MUTED, flexShrink: 0 }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-none outline-none text-xs flex-1"
        style={{ color: TEXT }}
      />
    </div>
  );
}

export function StatTile({ label, value, icon: Icon, color = GOLD, loading }: { label: string; value: React.ReactNode; icon: React.ElementType; color?: string; loading?: boolean }) {
  return (
    <div className="rounded-xl p-4 bg-white" style={{ border: `2px solid ${color}30`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color }}>{label}</span>
        <Icon size={15} style={{ color }} />
      </div>
      <p className="text-2xl font-extrabold" style={{ color: TEXT }}>{loading ? "—" : value}</p>
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${BORDER}`, background: SURFACE2 }}>
      <div className="rounded-full p-3 mb-3 inline-flex" style={{ background: `${GOLD}14` }}>
        <Icon size={26} style={{ color: GOLD }} />
      </div>
      <p className="text-sm font-extrabold" style={{ color: TEXT }}>{title}</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white p-4 animate-pulse" style={{ border: `1px solid ${BORDER}` }}>
      <div className="h-4 w-2/3 rounded mb-3" style={{ background: SURFACE3 }} />
      <div className="h-8 w-1/3 rounded mb-2" style={{ background: SURFACE3 }} />
      <div className="h-3 w-1/2 rounded" style={{ background: SURFACE3 }} />
    </div>
  );
}

// ─── Shared Modal (used by both the Dispatch and Tools tabs) ─────────────────

export function AddAssetModal({
  open, category, onClose, onSaved,
}: {
  open: boolean; category: AssetCategory;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "", assetType: "other", make: "", model: "", year: "", serialNumber: "", notes: "",
  });

  const createAsset = useCreateAsset(() => {
    setForm({ name: "", assetType: "other", make: "", model: "", year: "", serialNumber: "", notes: "" });
    onSaved();
  });

  const ASSET_TYPES = category === "small_tool"
    ? ["generator", "saw", "laser", "drill", "welder", "other"]
    : ["truck", "excavator", "bobcat", "crane", "lift", "compactor", "other"];

  function handleSave() {
    if (!form.name.trim()) return;
    createAsset.mutate({ ...form, category, status: "available" });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {CATEGORY_LABELS[category]} Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ford F-250 #1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.assetType} onValueChange={(v) => setForm((f) => ({ ...f, assetType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2022" maxLength={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Make</Label>
              <Input value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} placeholder="Ford" />
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="F-250" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Serial / VIN</Label>
            <Input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className={GOLD_BUTTON} onClick={handleSave} disabled={createAsset.isPending || !form.name.trim()}>
            {createAsset.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Add Asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
