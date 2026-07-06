import { useState, useMemo, useCallback, memo } from "react";
import {
  format, addDays, startOfWeek, parseISO, isSameDay, addWeeks, subWeeks,
  eachDayOfInterval, isWithinInterval,
} from "date-fns";
import { useListProjects, type Project, type UserWithCompany } from "@workspace/api-client-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Plus, Loader2, Truck, MapPin } from "lucide-react";
import {
  GOLD, GOLD_BUTTON, BORDER, SURFACE2, SURFACE3, TEXT, MUTED, SCHEDULE_COLORS,
  EmptyBlock, AddAssetModal, type AssetScheduleRow, type InventoryAsset,
} from "@/components/inventory/shared";
import { useAssetsByCategory } from "@/hooks/inventory/useInventoryAssets";
import { useAssetSchedules, useDeleteSchedule, useSaveAssetSchedule } from "@/hooks/inventory/useAssetSchedules";
import { useActiveCompanyMembers } from "@/hooks/inventory/useCompanyMembers";

// Off-screen rows skip layout/paint until scrolled into view; the reserved
// height keeps the board's scrollbar stable while that content is unmounted.
const ROW_CONTAINMENT_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "0 45px" };

interface AssetRowProps {
  asset: InventoryAsset;
  days: Date[];
  getScheduleForCell: (assetId: number, day: Date) => AssetScheduleRow | undefined;
  onOpenSchedule: (payload: { open: boolean; assetId: number; assetName: string; date?: Date; existing?: AssetScheduleRow }) => void;
  onDeleteSchedule: (id: number) => void;
}

const AssetRow = memo(function AssetRow({ asset, days, getScheduleForCell, onOpenSchedule, onDeleteSchedule }: AssetRowProps) {
  return (
    <div className="flex last:border-b-0 group" style={{ borderBottom: `1px solid ${SURFACE3}`, ...ROW_CONTAINMENT_STYLE }}>
      {/* Asset name column */}
      <div className="w-48 flex-shrink-0 px-4 py-2.5 flex items-center gap-2" style={{ borderRight: `1px solid ${BORDER}` }}>
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}33` }}
        >
          <Truck size={13} style={{ color: GOLD }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: TEXT }}>{asset.name}</p>
          <p className="text-[10px] capitalize" style={{ color: MUTED }}>{asset.assetType}</p>
        </div>
      </div>

      {/* Day cells */}
      {days.map((day) => {
        const schedule = getScheduleForCell(asset.id, day);
        const isFirst = schedule && isSameDay(parseISO(schedule.startDate), day);
        return (
          <div
            key={day.toISOString()}
            className="flex-1 p-1 last:border-r-0 cursor-pointer"
            style={{ borderRight: `1px solid ${SURFACE3}` }}
            onClick={() => {
              if (schedule) {
                onOpenSchedule({ open: true, assetId: asset.id, assetName: asset.name, date: day, existing: schedule });
              } else {
                onOpenSchedule({ open: true, assetId: asset.id, assetName: asset.name, date: day });
              }
            }}
          >
            {schedule ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="h-8 rounded-md flex items-center px-2 overflow-hidden"
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
                        onClick={(e) => { e.stopPropagation(); onOpenSchedule({ open: true, assetId: asset.id, assetName: asset.name, existing: schedule }); }}
                      >
                        Edit
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        className="text-xs text-red-500 hover:underline"
                        onClick={(e) => { e.stopPropagation(); onDeleteSchedule(schedule.id); }}
                      >
                        Remove
                      </button>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div
                className="h-8 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ border: `1px dashed ${BORDER}` }}
              >
                <Plus size={10} style={{ color: MUTED }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export function DispatchTab() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [scheduleModal, setScheduleModal] = useState<{
    open: boolean; assetId: number; assetName: string; date?: Date; existing?: AssetScheduleRow;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [addAssetModal, setAddAssetModal] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }), [weekStart]);

  const startISO = format(weekStart, "yyyy-MM-dd");
  const endISO = format(weekEnd, "yyyy-MM-dd");

  const { data: assetsData, isLoading: loadingAssets } = useAssetsByCategory("fleet");
  const { data: heavyData } = useAssetsByCategory("heavy_equipment");
  const { data: schedulesData, isLoading: loadingSchedules } = useAssetSchedules(startISO, endISO);

  const { data: projectsData } = useListProjects();
  const { members: membersData } = useActiveCompanyMembers();

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
    () => (projectsData ?? []).filter((p) => p.status === "active" || p.status === "planning"),
    [projectsData],
  );

  const deleteSchedule = useDeleteSchedule(() => setDeleteId(null));

  const getScheduleForCell = useCallback((assetId: number, day: Date): AssetScheduleRow | undefined => {
    const schedules = schedulesByAsset.get(assetId) ?? [];
    return schedules.find((s) => {
      const start = parseISO(s.startDate);
      const end = parseISO(s.endDate);
      return isWithinInterval(day, { start, end });
    });
  }, [schedulesByAsset]);

  const isLoading = loadingAssets || loadingSchedules;

  return (
    <div className="space-y-4">
      {/* Location Overview Widget */}
      <div className="rounded-2xl overflow-hidden bg-white" style={{ border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
          <div className="flex items-center gap-2">
            <MapPin size={15} style={{ color: GOLD }} />
            <span className="text-sm font-semibold" style={{ color: TEXT }}>Active Project Locations</span>
          </div>
          <span className="text-xs" style={{ color: MUTED }}>{activeProjects.length} sites</span>
        </div>
        {activeProjects.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: MUTED }}>
            No active projects. <a className="underline" href="/projects" style={{ color: GOLD }}>Add a project</a> to see locations here.
          </div>
        ) : (
          <div className="flex gap-2 p-3 overflow-x-auto">
            {activeProjects.slice(0, 8).map((p, i) => (
              <div
                key={p.id}
                className="flex-shrink-0 flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ border: `1px solid ${BORDER}`, background: SURFACE2, minWidth: 160 }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: SCHEDULE_COLORS[i % SCHEDULE_COLORS.length] }}
                />
                <div>
                  <p className="text-xs font-medium truncate max-w-[120px]" style={{ color: TEXT }}>{p.name}</p>
                  <p className="text-[10px] capitalize" style={{ color: MUTED }}>{p.status.replace("_", " ")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm font-semibold min-w-[180px] text-center" style={{ color: TEXT }}>
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
        <Button size="sm" className={GOLD_BUTTON} onClick={() => setAddAssetModal(true)}>
          <Plus size={14} className="mr-1" /> Add Asset
        </Button>
      </div>

      {/* Timeline Grid */}
      <div className="rounded-2xl overflow-hidden bg-white" style={{ border: `1px solid ${BORDER}` }}>
        {/* Day headers */}
        <div className="flex" style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
          <div className="w-48 flex-shrink-0 px-4 py-2.5" style={{ borderRight: `1px solid ${BORDER}` }}>
            <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: MUTED }}>Asset</span>
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 px-2 py-2.5 text-center last:border-r-0"
              style={{ borderRight: `1px solid ${SURFACE3}` }}
            >
              <p className="text-[10px] font-extrabold uppercase" style={{ color: MUTED }}>{format(day, "EEE")}</p>
              <p
                className="text-sm font-bold mt-0.5"
                style={{ color: isSameDay(day, new Date()) ? GOLD : TEXT }}
              >
                {format(day, "d")}
              </p>
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex animate-pulse" style={{ borderBottom: `1px solid ${SURFACE3}` }}>
              <div className="w-48 flex-shrink-0 px-4 py-3" style={{ borderRight: `1px solid ${BORDER}` }}>
                <div className="h-3.5 w-32 rounded mb-1" style={{ background: SURFACE3 }} />
                <div className="h-2.5 w-20 rounded" style={{ background: SURFACE3 }} />
              </div>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="flex-1 p-1.5 last:border-r-0" style={{ borderRight: `1px solid ${SURFACE3}` }}>
                  <div className="h-7 rounded" />
                </div>
              ))}
            </div>
          ))
        ) : boardAssets.length === 0 ? (
          <div className="py-16">
            <EmptyBlock icon={Truck} title="No fleet or heavy equipment added yet" sub={'Click "Add Asset" to get started'} />
          </div>
        ) : (
          boardAssets.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              days={days}
              getScheduleForCell={getScheduleForCell}
              onOpenSchedule={setScheduleModal}
              onDeleteSchedule={setDeleteId}
            />
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
          members={membersData}
          onClose={() => setScheduleModal(null)}
          onSaved={() => setScheduleModal(null)}
        />
      )}

      {/* Add Asset Modal */}
      <AddAssetModal
        open={addAssetModal}
        category="fleet"
        onClose={() => setAddAssetModal(false)}
        onSaved={() => setAddAssetModal(false)}
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

function ScheduleAssetModal({
  open, assetId, assetName, defaultDate, existing, projects, members, onClose, onSaved,
}: {
  open: boolean; assetId: number; assetName: string; defaultDate?: Date;
  existing?: AssetScheduleRow; projects: Project[]; members: UserWithCompany[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    projectId: existing?.projectId ? String(existing.projectId) : "",
    assignedToUserId: existing?.assignedToUserId ? String(existing.assignedToUserId) : "",
    startDate: existing?.startDate ?? (defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
    endDate: existing?.endDate ?? (defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
    notes: existing?.notes ?? "",
    color: existing?.color ?? GOLD,
  });

  const saveSchedule = useSaveAssetSchedule(existing?.id, onSaved);

  function handleSave() {
    saveSchedule.mutate({
      assetId,
      projectId: form.projectId ? parseInt(form.projectId) : undefined,
      assignedToUserId: form.assignedToUserId ? parseInt(form.assignedToUserId) : undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      notes: form.notes || undefined,
      color: form.color,
    });
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
          <Button className={GOLD_BUTTON} onClick={handleSave} disabled={saveSchedule.isPending}>
            {saveSchedule.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {existing ? "Update" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
