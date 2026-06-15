import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe, useListProjects, useListCompanyMembers, customFetch } from "@workspace/api-client-react";
import {
  format, addDays, startOfWeek, parseISO, isSameDay, addWeeks, subWeeks,
  eachDayOfInterval, isWithinInterval,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, Plus, Loader2, Truck, Wrench,
  Package, AlertTriangle, CheckCircle2, XCircle,
  MapPin, Calendar, RotateCcw, Pencil, Trash2, ArrowRightLeft,
  Search, Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";

const SCHEDULE_COLORS = [
  "#D4AF37", "#3B82F6", "#10B981", "#8B5CF6",
  "#F59E0B", "#EF4444", "#06B6D4", "#EC4899",
];

const CATEGORY_LABELS: Record<string, string> = {
  fleet: "Fleet",
  heavy_equipment: "Heavy Equipment",
  small_tool: "Small Tools",
};

const ASSET_TYPE_ICONS: Record<string, typeof Truck> = {
  truck: Truck, excavator: Wrench, bobcat: Wrench, crane: Wrench,
  lift: Wrench, compactor: Wrench, generator: Wrench, saw: Wrench,
  laser: Wrench, drill: Wrench, welder: Wrench, other: Package,
};

const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  lumber: "Lumber", concrete: "Concrete", gravel: "Gravel",
  safety_gear: "Safety Gear", hardware: "Hardware", plumbing: "Plumbing",
  electrical: "Electrical", other: "Other",
};

const UNIT_LABELS: Record<string, string> = {
  bags: "bags", cubic_yards: "cu yd", board_feet: "bd ft",
  each: "ea", lbs: "lbs", gallons: "gal",
  boxes: "boxes", rolls: "rolls", sheets: "sheets",
};

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function stockBadge(status: string) {
  if (status === "in_stock") return { label: "In Stock", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" };
  if (status === "low_stock") return { label: "Low Stock", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };
  return { label: "Out of Stock", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" };
}

function getInitials(first?: string | null, last?: string | null): string {
  return `${(first ?? "")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase() || "?";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryAsset = {
  id: number; companyId: number; name: string; category: string;
  assetType: string; make: string | null; model: string | null;
  year: string | null; serialNumber: string | null; status: string;
  photoUrl: string | null; dailyCost: string | null;
  lastKnownLat: string | null; lastKnownLng: string | null;
  notes: string | null; createdAt: string; updatedAt: string;
};

type AssetScheduleRow = {
  id: number; assetId: number; assetName: string | null;
  assetCategory: string | null; assetType: string | null;
  projectId: number | null; projectName: string | null;
  assignedToUserId: number | null; userFirstName: string | null; userLastName: string | null;
  startDate: string; endDate: string; notes: string | null;
  color: string; status: string;
};

type MaterialRow = {
  id: number; name: string; category: string; unit: string;
  quantityOnHand: string; reorderThreshold: string | null;
  reorderQty: string | null; unitCost: string | null;
  location: string | null; notes: string | null;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
};

type CheckoutRow = {
  id: number; assetId: number; assetName: string | null; assetType: string | null;
  assetPhotoUrl: string | null; projectId: number | null; projectName: string | null;
  checkedOutToUserId: number | null; userFirstName: string | null; userLastName: string | null;
  checkedOutToContactId: number | null; contactName: string | null;
  checkedOutToName: string | null; status: string;
  checkedOutAt: string; expectedReturnDate: string | null;
};

type Project = { id: number; name: string; status: string };
type Member = { id: number; firstName: string; lastName: string; role: string };

// ─── Skeleton Components ──────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse">
      <div className="h-4 w-2/3 bg-gray-100 rounded mb-3" />
      <div className="h-8 w-1/3 bg-gray-100 rounded mb-2" />
      <div className="h-3 w-1/2 bg-gray-100 rounded" />
    </div>
  );
}

// ─── Tab 1: Dispatch Board ────────────────────────────────────────────────────

function DispatchBoard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [scheduleModal, setScheduleModal] = useState<{
    open: boolean; assetId: number; assetName: string; date?: Date; existing?: AssetScheduleRow;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [addAssetModal, setAddAssetModal] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const startISO = format(weekStart, "yyyy-MM-dd");
  const endISO = format(weekEnd, "yyyy-MM-dd");

  const { data: assetsData, isLoading: loadingAssets } = useQuery<{ data: InventoryAsset[] }>({
    queryKey: ["/inventory/assets", "dispatch"],
    queryFn: () => customFetch(`/api/inventory/assets?category=fleet&limit=100`) as any,
    staleTime: 30_000,
  });

  const { data: heavyData } = useQuery<{ data: InventoryAsset[] }>({
    queryKey: ["/inventory/assets", "heavy"],
    queryFn: () => customFetch(`/api/inventory/assets?category=heavy_equipment&limit=100`) as any,
    staleTime: 30_000,
  });

  const { data: schedulesData, isLoading: loadingSchedules } = useQuery<AssetScheduleRow[]>({
    queryKey: ["/inventory/schedules", startISO, endISO],
    queryFn: () => customFetch(`/api/inventory/schedules?startDate=${startISO}&endDate=${endISO}`) as any,
    staleTime: 15_000,
  });

  const { data: projectsData } = useListProjects();
  const { data: membersData } = useListCompanyMembers(me?.activeCompanyId ?? 0, {
    query: { enabled: !!me?.activeCompanyId, staleTime: 60_000 } as any,
  });

  const boardAssets = useMemo(() => [
    ...(assetsData?.data ?? []),
    ...(heavyData?.data ?? []),
  ], [assetsData, heavyData]);

  const schedulesByAsset = useMemo(() => {
    const map = new Map<number, AssetScheduleRow[]>();
    for (const s of schedulesData ?? []) {
      if (!map.has(s.assetId)) map.set(s.assetId, []);
      map.get(s.assetId)!.push(s);
    }
    return map;
  }, [schedulesData]);

  // Active projects for location pins
  const activeProjects = useMemo(
    () => (projectsData as any as Project[] | undefined ?? []).filter((p) => p.status === "active" || p.status === "planning"),
    [projectsData],
  );

  const deleteSchedule = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/inventory/schedules"] });
      toast({ title: "Schedule removed" });
      setDeleteId(null);
    },
  });

  function getScheduleForCell(assetId: number, day: Date): AssetScheduleRow | undefined {
    const schedules = schedulesByAsset.get(assetId) ?? [];
    return schedules.find((s) => {
      const start = parseISO(s.startDate);
      const end = parseISO(s.endDate);
      return isWithinInterval(day, { start, end });
    });
  }

  const isLoading = loadingAssets || loadingSchedules;

  return (
    <div className="space-y-4">
      {/* Location Overview Widget */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <MapPin size={15} style={{ color: GOLD }} />
            <span className="text-sm font-semibold text-gray-700">Active Project Locations</span>
          </div>
          <span className="text-xs text-gray-400">{activeProjects.length} sites</span>
        </div>
        {activeProjects.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No active projects. <a className="underline" href="/projects">Add a project</a> to see locations here.
          </div>
        ) : (
          <div className="flex gap-2 p-3 overflow-x-auto">
            {activeProjects.slice(0, 8).map((p, i) => (
              <div
                key={p.id}
                className="flex-shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: "#f0f0f0", background: "#fafafa", minWidth: 160 }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: SCHEDULE_COLORS[i % SCHEDULE_COLORS.length] }}
                />
                <div>
                  <p className="text-xs font-medium text-gray-800 truncate max-w-[120px]">{p.name}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{p.status.replace("_", " ")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
        <Button size="sm" style={{ background: GOLD, color: BLACK }} onClick={() => setAddAssetModal(true)}>
          <Plus size={14} className="mr-1" /> Add Asset
        </Button>
      </div>

      {/* Timeline Grid */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b border-gray-100" style={{ background: "#fafafa" }}>
          <div className="w-48 flex-shrink-0 px-4 py-2.5 border-r border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Asset</span>
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 px-2 py-2.5 text-center border-r border-gray-50 last:border-r-0"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase">{format(day, "EEE")}</p>
              <p
                className="text-sm font-bold mt-0.5"
                style={{ color: isSameDay(day, new Date()) ? GOLD : "#374151" }}
              >
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex border-b border-gray-50 animate-pulse">
              <div className="w-48 flex-shrink-0 px-4 py-3 border-r border-gray-100">
                <div className="h-3.5 w-32 bg-gray-100 rounded mb-1" />
                <div className="h-2.5 w-20 bg-gray-100 rounded" />
              </div>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="flex-1 p-1.5 border-r border-gray-50 last:border-r-0">
                  <div className="h-7 rounded" />
                </div>
              ))}
            </div>
          ))
        ) : boardAssets.length === 0 ? (
          <div className="py-16 text-center">
            <Truck size={32} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400 font-medium">No fleet or heavy equipment added yet</p>
            <p className="text-xs text-gray-300 mt-1">Click "Add Asset" to get started</p>
          </div>
        ) : (
          boardAssets.map((asset) => (
            <div key={asset.id} className="flex border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 group">
              {/* Asset name column */}
              <div className="w-48 flex-shrink-0 px-4 py-2.5 border-r border-gray-100 flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}33` }}
                >
                  <Truck size={13} style={{ color: GOLD }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{asset.name}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{asset.assetType}</p>
                </div>
              </div>

              {/* Day cells */}
              {days.map((day) => {
                const schedule = getScheduleForCell(asset.id, day);
                const isFirst = schedule && isSameDay(parseISO(schedule.startDate), day);
                return (
                  <div
                    key={day.toISOString()}
                    className="flex-1 p-1 border-r border-gray-50 last:border-r-0 cursor-pointer"
                    onClick={() => {
                      if (schedule) {
                        setScheduleModal({ open: true, assetId: asset.id, assetName: asset.name, date: day, existing: schedule });
                      } else {
                        setScheduleModal({ open: true, assetId: asset.id, assetName: asset.name, date: day });
                      }
                    }}
                  >
                    {schedule ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="h-8 rounded flex items-center px-2 overflow-hidden"
                              style={{
                                background: `${schedule.color}22`,
                                border: `1px solid ${schedule.color}55`,
                              }}
                            >
                              {isFirst && (
                                <span
                                  className="text-[10px] font-semibold truncate"
                                  style={{ color: schedule.color }}
                                >
                                  {schedule.projectName ?? "Assigned"}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">{schedule.projectName ?? "Unassigned"}</p>
                            {schedule.userFirstName && (
                              <p className="text-xs text-gray-400">
                                {schedule.userFirstName} {schedule.userLastName}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {format(parseISO(schedule.startDate), "MMM d")} –{" "}
                              {format(parseISO(schedule.endDate), "MMM d")}
                            </p>
                            <div className="flex gap-1 mt-2">
                              <button
                                className="text-xs text-blue-500 hover:underline"
                                onClick={(e) => { e.stopPropagation(); setScheduleModal({ open: true, assetId: asset.id, assetName: asset.name, existing: schedule }); }}
                              >
                                Edit
                              </button>
                              <span className="text-gray-300">·</span>
                              <button
                                className="text-xs text-red-500 hover:underline"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(schedule.id); }}
                              >
                                Remove
                              </button>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <div className="h-8 rounded border border-dashed border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={10} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Schedule Modal */}
      {scheduleModal && (
        <ScheduleAssetModal
          open={scheduleModal.open}
          assetId={scheduleModal.assetId}
          assetName={scheduleModal.assetName}
          defaultDate={scheduleModal.date}
          existing={scheduleModal.existing}
          projects={activeProjects}
          members={(membersData ?? []) as any as Member[]}
          onClose={() => setScheduleModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["/inventory/schedules"] });
            setScheduleModal(null);
          }}
        />
      )}

      {/* Add Asset Modal */}
      <AddAssetModal
        open={addAssetModal}
        category="fleet"
        onClose={() => setAddAssetModal(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/inventory/assets"] });
          setAddAssetModal(false);
        }}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Schedule Block?</AlertDialogTitle>
            <AlertDialogDescription>This will unassign the asset from this date range.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteSchedule.mutate(deleteId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 2: Materials Board ───────────────────────────────────────────────────

function MaterialsBoard() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addModal, setAddModal] = useState(false);
  const [editMaterial, setEditMaterial] = useState<MaterialRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [poModal, setPoModal] = useState<MaterialRow | null>(null);

  const debounceFn = useCallback(debounce((v: string) => setDebouncedSearch(v), 300), []);
  useEffect(() => debounceFn(search), [search, debounceFn]);

  const categoryParam = categoryFilter === "all" ? "" : `&category=${categoryFilter}`;
  const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : "";

  const { data, isLoading } = useQuery<{ data: MaterialRow[]; total: number }>({
    queryKey: ["/inventory/materials", categoryFilter, debouncedSearch],
    queryFn: () => customFetch(`/api/inventory/materials?limit=200${categoryParam}${searchParam}`) as any,
    staleTime: 20_000,
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/inventory/materials"] });
      toast({ title: "Material removed" });
      setDeleteId(null);
    },
  });

  const materials = data?.data ?? [];

  const CATEGORIES = [
    "all", "lumber", "concrete", "gravel", "safety_gear",
    "hardware", "plumbing", "electrical", "other",
  ];

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In Stock", status: "in_stock", icon: CheckCircle2, color: "#16a34a", bg: "#f0fdf4" },
          { label: "Low Stock", status: "low_stock", icon: AlertTriangle, color: "#d97706", bg: "#fffbeb" },
          { label: "Out of Stock", status: "out_of_stock", icon: XCircle, color: "#dc2626", bg: "#fef2f2" },
        ].map(({ label, status, icon: Icon, color, bg }) => {
          const count = materials.filter((m) => m.stockStatus === status).length;
          return (
            <div key={status} className="rounded-xl border p-4 flex items-center gap-3" style={{ background: bg, borderColor: `${color}30` }}>
              <Icon size={20} style={{ color }} />
              <div>
                <p className="text-2xl font-bold" style={{ color }}>{isLoading ? "—" : count}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="Search materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        <Button size="sm" style={{ background: GOLD, color: BLACK }} onClick={() => setAddModal(true)}>
          <Plus size={14} className="mr-1" /> Add Material
        </Button>
      </div>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="py-16 text-center rounded-xl border border-dashed border-gray-200">
          <Package size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">No materials found</p>
          <p className="text-xs text-gray-300 mt-1">Add bulk commodities to track stock levels</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {materials.map((m) => {
            const badge = stockBadge(m.stockStatus);
            const qty = parseFloat(m.quantityOnHand);
            const threshold = m.reorderThreshold ? parseFloat(m.reorderThreshold) : null;
            return (
              <div
                key={m.id}
                className="rounded-xl border bg-white p-4 group relative transition-shadow hover:shadow-md"
                style={{ borderColor: badge.border }}
              >
                {/* Stoplight badge */}
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold mb-3"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full inline-block"
                    style={{ background: badge.color }}
                  />
                  {badge.label}
                </div>

                <p className="text-sm font-semibold text-gray-800 mb-1 truncate">{m.name}</p>
                <p className="text-xs text-gray-400 mb-3">
                  {MATERIAL_CATEGORY_LABELS[m.category] ?? m.category}
                  {m.location ? ` · ${m.location}` : ""}
                </p>

                {/* Quantity */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-black text-gray-900">{qty % 1 === 0 ? qty : qty.toFixed(1)}</p>
                    <p className="text-[11px] text-gray-400">{UNIT_LABELS[m.unit] ?? m.unit} on hand</p>
                  </div>
                  {threshold !== null && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Reorder at</p>
                      <p className="text-xs font-bold text-gray-600">{threshold} {UNIT_LABELS[m.unit]}</p>
                    </div>
                  )}
                </div>

                {/* PO Action */}
                {m.stockStatus === "out_of_stock" && (
                  <button
                    className="mt-3 w-full text-center text-[11px] font-semibold rounded-lg px-2 py-1.5 transition-colors"
                    style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca" }}
                    onClick={() => setPoModal(m)}
                  >
                    Auto-generate Purchase Order
                  </button>
                )}
                {m.stockStatus === "low_stock" && (
                  <button
                    className="mt-3 w-full text-center text-[11px] font-semibold rounded-lg px-2 py-1.5 transition-colors"
                    style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}
                    onClick={() => setPoModal(m)}
                  >
                    Generate Reorder PO
                  </button>
                )}

                {/* Action menu */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-1 rounded hover:bg-gray-100"
                    onClick={() => setEditMaterial(m)}
                  >
                    <Pencil size={12} className="text-gray-400" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-red-50"
                    onClick={() => setDeleteId(m.id)}
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Material Modal */}
      <MaterialModal
        open={addModal || editMaterial !== null}
        existing={editMaterial}
        onClose={() => { setAddModal(false); setEditMaterial(null); }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/inventory/materials"] });
          qc.invalidateQueries({ queryKey: ["/inventory/summary"] });
          setAddModal(false);
          setEditMaterial(null);
        }}
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

// ─── Tab 3: Tools Grid ────────────────────────────────────────────────────────

function ToolsGrid() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [checkoutModal, setCheckoutModal] = useState<InventoryAsset | null>(null);
  const [addToolModal, setAddToolModal] = useState(false);
  const [returnId, setReturnId] = useState<{ checkoutId: number; assetName: string } | null>(null);

  const debounceFn = useCallback(debounce((v: string) => setDebouncedSearch(v), 300), []);
  useEffect(() => debounceFn(search), [search, debounceFn]);

  const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : "";

  const { data: toolsData, isLoading: loadingTools } = useQuery<{ data: InventoryAsset[] }>({
    queryKey: ["/inventory/assets", "tools", debouncedSearch],
    queryFn: () => customFetch(`/api/inventory/assets?category=small_tool&limit=200${searchParam}`) as any,
    staleTime: 20_000,
  });

  const { data: checkoutsData, isLoading: loadingCheckouts } = useQuery<CheckoutRow[]>({
    queryKey: ["/inventory/tool-checkouts"],
    queryFn: () => customFetch("/api/inventory/tool-checkouts?status=checked_out") as any,
    staleTime: 15_000,
  });

  const { data: membersData } = useListCompanyMembers(me?.activeCompanyId ?? 0, {
    query: { enabled: !!me?.activeCompanyId, staleTime: 60_000 } as any,
  });

  const { data: projectsData } = useListProjects();

  const returnTool = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inventory/tool-checkouts/${id}/return`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/inventory/tool-checkouts"] });
      qc.invalidateQueries({ queryKey: ["/inventory/assets"] });
      qc.invalidateQueries({ queryKey: ["/inventory/summary"] });
      toast({ title: "Tool returned to yard" });
      setReturnId(null);
    },
  });

  const tools = toolsData?.data ?? [];
  const checkouts = checkoutsData ?? [];

  // Map assetId → checkout record for quick lookup
  const checkoutsByAsset = useMemo(() => {
    const map = new Map<number, CheckoutRow>();
    for (const c of checkouts) map.set(c.assetId, c);
    return map;
  }, [checkouts]);

  const inYard = tools.filter((t) => !checkoutsByAsset.has(t.id)).length;
  const checkedOut = tools.filter((t) => checkoutsByAsset.has(t.id)).length;

  const isLoading = loadingTools || loadingCheckouts;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <CheckCircle2 size={20} style={{ color: "#16a34a" }} />
          <div>
            <p className="text-2xl font-bold" style={{ color: "#16a34a" }}>{isLoading ? "—" : inYard}</p>
            <p className="text-xs text-gray-500">In Yard</p>
          </div>
        </div>
        <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
          <ArrowRightLeft size={20} style={{ color: "#d97706" }} />
          <div>
            <p className="text-2xl font-bold" style={{ color: "#d97706" }}>{isLoading ? "—" : checkedOut}</p>
            <p className="text-xs text-gray-500">Checked Out</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" style={{ background: GOLD, color: BLACK }} onClick={() => setAddToolModal(true)}>
          <Plus size={14} className="mr-1" /> Add Tool
        </Button>
      </div>

      {/* Tool Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : tools.length === 0 ? (
        <div className="py-16 text-center rounded-xl border border-dashed border-gray-200">
          <Wrench size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">No small tools added yet</p>
          <p className="text-xs text-gray-300 mt-1">Track lasers, saws, generators and other high-theft items</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {tools.map((tool) => {
            const checkout = checkoutsByAsset.get(tool.id);
            const isOut = !!checkout;
            const holderName = checkout
              ? checkout.userFirstName
                ? `${checkout.userFirstName} ${checkout.userLastName ?? ""}`.trim()
                : checkout.checkedOutToName ?? checkout.contactName ?? "Unknown"
              : null;
            const holderInitials = checkout
              ? getInitials(checkout.userFirstName, checkout.userLastName)
              : null;

            const AssetIcon = ASSET_TYPE_ICONS[tool.assetType] ?? Package;

            return (
              <div
                key={tool.id}
                className="rounded-xl border bg-white p-4 flex flex-col items-center text-center transition-shadow hover:shadow-md group relative"
                style={{ borderColor: isOut ? "#fde68a" : "#f0f0f0" }}
              >
                {/* Tool Icon or Photo */}
                <div
                  className="h-14 w-14 rounded-xl flex items-center justify-center mb-3"
                  style={{
                    background: isOut ? "#fffbeb" : `${GOLD}12`,
                    border: `1px solid ${isOut ? "#fde68a" : `${GOLD}25`}`,
                  }}
                >
                  {tool.photoUrl ? (
                    <img src={tool.photoUrl} alt={tool.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <AssetIcon size={22} style={{ color: isOut ? "#d97706" : GOLD }} />
                  )}
                </div>

                <p className="text-xs font-bold text-gray-800 truncate w-full mb-0.5">{tool.name}</p>
                <p className="text-[10px] text-gray-400 capitalize mb-3">{tool.assetType}</p>

                {/* Status */}
                {isOut ? (
                  <div className="flex flex-col items-center gap-1 w-full">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: "#d97706" }}
                    >
                      {holderInitials}
                    </div>
                    <p className="text-[10px] font-semibold text-gray-700 truncate max-w-full">{holderName}</p>
                    {checkout?.projectName && (
                      <p className="text-[9px] text-gray-400 truncate max-w-full">{checkout.projectName}</p>
                    )}
                    <button
                      className="mt-1 text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors"
                      style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}
                      onClick={() => setReturnId({ checkoutId: checkout!.id, assetName: tool.name })}
                    >
                      <RotateCcw size={9} className="inline mr-0.5" />
                      Return
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 w-full">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5"
                      style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
                    >
                      <CheckCircle2 size={9} />
                      In Yard
                    </span>
                    <button
                      className="mt-1 text-[10px] font-semibold rounded-full px-3 py-1 transition-colors"
                      style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}44` }}
                      onClick={() => setCheckoutModal(tool)}
                    >
                      Check Out
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutModal && (
        <CheckoutToolModal
          tool={checkoutModal}
          members={(membersData ?? []) as any as Member[]}
          projects={(projectsData as any as Project[] | undefined ?? [])}
          onClose={() => setCheckoutModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["/inventory/tool-checkouts"] });
            qc.invalidateQueries({ queryKey: ["/inventory/assets"] });
            qc.invalidateQueries({ queryKey: ["/inventory/summary"] });
            setCheckoutModal(null);
          }}
        />
      )}

      {/* Add Tool Modal */}
      <AddAssetModal
        open={addToolModal}
        category="small_tool"
        onClose={() => setAddToolModal(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/inventory/assets"] });
          setAddToolModal(false);
        }}
      />

      {/* Return Confirm */}
      <AlertDialog open={returnId !== null} onOpenChange={() => setReturnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return {returnId?.assetName}?</AlertDialogTitle>
            <AlertDialogDescription>Mark this tool as returned to the yard.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              style={{ background: GOLD, color: BLACK }}
              onClick={() => returnId && returnTool.mutate(returnId.checkoutId)}
            >
              {returnTool.isPending ? <Loader2 size={14} className="animate-spin" /> : "Confirm Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Shared Modals ────────────────────────────────────────────────────────────

function AddAssetModal({
  open, category, onClose, onSaved,
}: {
  open: boolean; category: "fleet" | "heavy_equipment" | "small_tool";
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", assetType: "other", make: "", model: "", year: "", serialNumber: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const ASSET_TYPES = category === "small_tool"
    ? ["generator", "saw", "laser", "drill", "welder", "other"]
    : ["truck", "excavator", "bobcat", "crane", "lift", "compactor", "other"];

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await customFetch("/api/inventory/assets", {
        method: "POST",
        body: JSON.stringify({ ...form, category, status: "available" }),
      });
      toast({ title: "Asset added" });
      setForm({ name: "", assetType: "other", make: "", model: "", year: "", serialNumber: "", notes: "" });
      onSaved();
    } catch {
      toast({ title: "Failed to save asset", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
          <Button style={{ background: GOLD, color: BLACK }} onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Add Asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleAssetModal({
  open, assetId, assetName, defaultDate, existing, projects, members, onClose, onSaved,
}: {
  open: boolean; assetId: number; assetName: string; defaultDate?: Date;
  existing?: AssetScheduleRow; projects: Project[]; members: Member[];
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    projectId: existing?.projectId ? String(existing.projectId) : "",
    assignedToUserId: existing?.assignedToUserId ? String(existing.assignedToUserId) : "",
    startDate: existing?.startDate ?? (defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
    endDate: existing?.endDate ?? (defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
    notes: existing?.notes ?? "",
    color: existing?.color ?? GOLD,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        assetId,
        projectId: form.projectId ? parseInt(form.projectId) : undefined,
        assignedToUserId: form.assignedToUserId ? parseInt(form.assignedToUserId) : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes || undefined,
        color: form.color,
      };
      if (existing) {
        await customFetch(`/api/inventory/schedules/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Schedule updated" });
      } else {
        await customFetch("/api/inventory/schedules", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Asset scheduled" });
      }
      onSaved();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Schedule" : "Schedule Asset"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="px-3 py-2 rounded-lg" style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
            <p className="text-sm font-semibold" style={{ color: GOLD }}>{assetName}</p>
          </div>
          <div>
            <Label className="text-xs">Assign to Project</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assign to Crew Member</Label>
            <Select value={form.assignedToUserId} onValueChange={(v) => setForm((f) => ({ ...f, assignedToUserId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select person…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No assignment</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.firstName} {m.lastName} ({m.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-2 mt-1">
              {SCHEDULE_COLORS.map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: form.color === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ background: GOLD, color: BLACK }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {existing ? "Update" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaterialModal({
  open, existing, onClose, onSaved,
}: {
  open: boolean; existing: MaterialRow | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
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
  const [saving, setSaving] = useState(false);

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

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name, category: form.category, unit: form.unit,
        quantityOnHand: parseFloat(form.quantityOnHand || "0"),
        reorderThreshold: form.reorderThreshold ? parseFloat(form.reorderThreshold) : undefined,
        reorderQty: form.reorderQty ? parseFloat(form.reorderQty) : undefined,
        unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined,
        location: form.location || undefined,
        notes: form.notes || undefined,
      };
      if (existing) {
        await customFetch(`/api/inventory/materials/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Material updated" });
      } else {
        await customFetch("/api/inventory/materials", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Material added" });
      }
      onSaved();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const CATEGORIES = ["lumber", "concrete", "gravel", "safety_gear", "hardware", "plumbing", "electrical", "other"];
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
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{MATERIAL_CATEGORY_LABELS[c] ?? c}</SelectItem>)}
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
          <Button style={{ background: GOLD, color: BLACK }} onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
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
          <div className="rounded-lg p-3" style={{ background: "#fafafa", border: "1px solid #f0f0f0" }}>
            <p className="font-semibold text-gray-800">{material.name}</p>
            <p className="text-gray-400 text-xs">{MATERIAL_CATEGORY_LABELS[material.category] ?? material.category}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Current Stock</span>
              <span className="font-medium">{material.quantityOnHand} {UNIT_LABELS[material.unit]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Order Qty</span>
              <span className="font-medium">{reorderQty} {UNIT_LABELS[material.unit]}</span>
            </div>
            {unitCost > 0 && (
              <div className="flex justify-between border-t pt-1.5 mt-1.5">
                <span className="text-gray-500">Estimated Total</span>
                <span className="font-bold">${total.toFixed(2)}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Review and send this PO to your preferred supplier. Quantities can be adjusted before sending.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            style={{ background: GOLD, color: BLACK }}
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

function CheckoutToolModal({
  tool, members, projects, onClose, onSaved,
}: {
  tool: InventoryAsset; members: Member[]; projects: Project[];
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    assignTo: "user",
    userId: "",
    freeformName: "",
    projectId: "",
    expectedReturnDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (form.assignTo === "user" && !form.userId && !form.freeformName.trim()) {
      toast({ title: "Please select or enter who is checking this out", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        assetId: tool.id,
        notes: form.notes || undefined,
        projectId: form.projectId ? parseInt(form.projectId) : undefined,
        expectedReturnDate: form.expectedReturnDate || undefined,
      };
      if (form.userId) body.checkedOutToUserId = parseInt(form.userId);
      else body.checkedOutToName = form.freeformName.trim();

      await customFetch("/api/inventory/tool-checkouts", { method: "POST", body: JSON.stringify(body) });
      toast({ title: `${tool.name} checked out` });
      onSaved();
    } catch {
      toast({ title: "Failed to check out", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check Out Tool</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg px-3 py-2" style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}33` }}>
            <p className="text-sm font-semibold" style={{ color: GOLD }}>{tool.name}</p>
            <p className="text-xs text-gray-400 capitalize">{tool.assetType}</p>
          </div>
          <div>
            <Label className="text-xs">Assign to Team Member</Label>
            <Select value={form.userId} onValueChange={(v) => setForm((f) => ({ ...f, userId: v, freeformName: "" }))}>
              <SelectTrigger><SelectValue placeholder="Select crew member…" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.firstName} {m.lastName} — {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Or enter name (for subs / visitors)</Label>
            <Input
              value={form.freeformName}
              onChange={(e) => setForm((f) => ({ ...f, freeformName: e.target.value, userId: "" }))}
              placeholder="e.g. John Smith (sub)"
            />
          </div>
          <div>
            <Label className="text-xs">Project</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Expected Return Date</Label>
            <Input type="date" value={form.expectedReturnDate} onChange={(e) => setForm((f) => ({ ...f, expectedReturnDate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ background: GOLD, color: BLACK }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Check Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "dispatch", label: "Fleet Dispatch Board", icon: Calendar },
  { key: "materials", label: "Materials Board", icon: Layers },
  { key: "tools", label: "Tool Rental Counter", icon: Wrench },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dispatch");
  const { data: summary } = useQuery({
    queryKey: ["/inventory/summary"],
    queryFn: () => customFetch("/api/inventory/summary") as any,
    staleTime: 60_000,
  });
  const s = summary as any;

  return (
    <div className="min-h-screen" style={{ background: "#F8F8F8" }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Inventory & Assets</h1>
            <p className="text-sm text-gray-400 mt-0.5">Fleet · Equipment · Materials · Tools</p>
          </div>
          {/* KPI Strip */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: "Total Assets", value: s?.totalAssets ?? "—", color: GOLD },
              { label: "Material Alerts", value: s?.materialAlerts ?? "—", color: s?.materialAlerts > 0 ? "#dc2626" : "#16a34a" },
              { label: "Checked Out", value: s?.activeCheckouts ?? "—", color: "#d97706" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border bg-white px-4 py-2.5" style={{ borderColor: "#f0f0f0" }}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-xl font-black" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1" style={{ width: "fit-content" }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === key ? BLACK : "transparent",
                color: activeTab === key ? "#fff" : "#666",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "dispatch" && <DispatchBoard />}
        {activeTab === "materials" && <MaterialsBoard />}
        {activeTab === "tools" && <ToolsGrid />}
      </div>
    </div>
  );
}
