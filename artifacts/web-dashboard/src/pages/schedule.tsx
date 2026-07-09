import { useMemo, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import {
  format, addDays, startOfWeek, parseISO,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus,
  Users, Building2, GanttChartSquare, LayoutGrid,
  Wrench, Clock,
} from "lucide-react";
import { GanttView } from "@/components/schedule/GanttView";
import { TeamView } from "@/components/schedule/TeamView";
import { EventsView } from "@/components/schedule/EventsView";
import { EquipmentView } from "@/components/schedule/EquipmentView";
import { AssignWorkerDialog } from "@/components/schedule/AssignWorkerDialog";
import { EventDialog } from "@/components/schedule/EventDialog";
import { EquipmentDialog } from "@/components/schedule/EquipmentDialog";
import { useGanttQuery, useTeamWeekQuery, useAssignmentMutations } from "@/hooks/schedule/useScheduleAssignments";
import {
  type ViewMode, type ZoomLevel, type ScheduleEvent, type Equipment,
  getGanttRange,
} from "@/components/schedule/shared";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: ViewMode; label: string; icon: typeof GanttChartSquare }> = [
  { id: "gantt", label: "Gantt", icon: GanttChartSquare },
  { id: "team", label: "Team Grid", icon: LayoutGrid },
  { id: "events", label: "Events", icon: Clock },
  { id: "equipment", label: "Equipment", icon: Wrench },
];

export default function Schedule() {
  const { data: me } = useGetMe();

  const [view, setView] = useState<ViewMode>("gantt");
  const [zoom, setZoom] = useState<ZoomLevel>("1m");
  const [ganttNav, setGanttNav] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [teamWeek, setTeamWeek] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [eventsWeek, setEventsWeek] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Assign Worker dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [dialogProjectId, setDialogProjectId] = useState<string | undefined>(undefined);

  // Event dialog state
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);

  // Equipment dialog state
  const [showEquipmentDialog, setShowEquipmentDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  function ganttPrev() {
    if (zoom === "2w") setGanttNav(d => addDays(d, -14));
    else if (zoom === "1m") setGanttNav(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setGanttNav(d => new Date(d.getFullYear(), d.getMonth() - 3, 1));
  }
  function ganttNext() {
    if (zoom === "2w") setGanttNav(d => addDays(d, 14));
    else if (zoom === "1m") setGanttNav(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setGanttNav(d => new Date(d.getFullYear(), d.getMonth() + 3, 1));
  }
  function ganttToday() {
    const n = new Date();
    setGanttNav(zoom === "2w" ? startOfWeek(n, { weekStartsOn: 1 }) : new Date(n.getFullYear(), n.getMonth(), 1));
  }

  const ganttRange = useMemo(() => getGanttRange(ganttNav, zoom), [ganttNav, zoom]);

  // ── Queries (kept at page level: drive both the summary tiles and the
  //    Assign Worker dialog's dropdown data, in addition to their views) ──
  const ganttQuery = useGanttQuery(ganttRange, isOwnerOrForeman && view === "gantt");
  const weekOf = format(teamWeek, "yyyy-MM-dd");
  const teamQuery = useTeamWeekQuery(weekOf, isOwnerOrForeman && view === "team");

  const { createMut, deleteMut, patchMut } = useAssignmentMutations(() => setShowDialog(false));

  function openAssignDialog(projectId?: string) {
    setDialogProjectId(projectId);
    setShowDialog(true);
  }

  const ganttProjects = ganttQuery.data?.projects ?? [];
  const ganttAssignments = ganttQuery.data?.assignments ?? [];
  const ganttMembers = ganttQuery.data?.members ?? [];
  const teamProjects = teamQuery.data?.projects ?? [];
  const teamMembers = teamQuery.data?.members ?? [];
  const teamSubcontractors = teamQuery.data?.subcontractors ?? [];
  const ganttSubcontractors = ganttQuery.data?.subcontractors ?? [];

  // ── Summaries ─────────────────────────────────────────────────────────────
  const { scheduledWorkers, activeProjects, unscheduled } = useMemo(() => {
    const allAssignments = view === "gantt" ? ganttAssignments : (teamQuery.data?.assignments ?? []);
    const allMembers = view === "gantt" ? ganttMembers : (teamQuery.data?.members ?? []);
    const wIds = new Set(allAssignments.map(a => a.userId).filter(Boolean));
    const pIds = new Set(allAssignments.map(a => a.projectId));
    return { scheduledWorkers: wIds.size, activeProjects: pIds.size, unscheduled: allMembers.length - wIds.size };
  }, [view, ganttAssignments, ganttMembers, teamQuery.data]);

  const summaryStats: Array<{ label: string; value: number; icon: typeof Users; targetView: ViewMode }> = [
    { label: "Workers scheduled", value: scheduledWorkers, icon: Users, targetView: "team" },
    { label: "Active projects", value: activeProjects, icon: Building2, targetView: "gantt" },
    { label: "Unscheduled", value: Math.max(0, unscheduled), icon: CalendarDays, targetView: "team" },
  ];

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isOwnerOrForeman) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Schedule is for owners and foremans only.</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3 min-h-[calc(100vh-7rem)]">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {view === "gantt" ? "Project timelines and worker assignments at a glance."
                : view === "team" ? "Weekly worker availability across all projects."
                : view === "events" ? "Meetings, site visits, and equipment bookings."
                : "Manage your company equipment fleet."}
            </p>
          </div>
          {view === "events" && isOwnerOrForeman && (
            <Button size="sm" onClick={() => { setEditingEvent(null); setShowEventDialog(true); }} className="shrink-0">
              <Plus className="h-3.5 w-3.5" /> New Event
            </Button>
          )}
          {view === "equipment" && isOwnerOrForeman && (
            <Button size="sm" onClick={() => { setEditingEquipment(null); setShowEquipmentDialog(true); }} className="shrink-0">
              <Plus className="h-3.5 w-3.5" /> Add Equipment
            </Button>
          )}
          {(view === "gantt" || view === "team") && (
            <Button size="sm" onClick={() => openAssignDialog()} className="shrink-0">
              <Plus className="h-3.5 w-3.5" /> Assign Worker
            </Button>
          )}
        </div>

        {/* ── Compact summary strip ── */}
        <div className="flex items-center gap-5">
          {summaryStats.map(({ label, value, icon: Icon, targetView }, i) => {
            const isActive = view === targetView;
            return (
              <button
                key={label}
                onClick={() => setView(targetView)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 text-sm transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive && "text-primary")} />
                <span className="font-semibold text-foreground">{value}</span>
                <span>{label}</span>
                {i < summaryStats.length - 1 && <span className="ml-3.5 h-3.5 w-px bg-border" aria-hidden />}
              </button>
            );
          })}
        </div>

        {/* ── View tabs + nav controls ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border">
          {/* Lightweight view tabs */}
          <div className="flex items-center gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
                  view === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                {view === id && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden />
                )}
              </button>
            ))}
          </div>

          {/* Navigation (only for time-based views) */}
          {(view === "gantt" || view === "team" || view === "events") && (
            <div className="flex items-center gap-2 pb-2">
              {view === "gantt" && (
                <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 mr-1">
                  {(["2w", "1m", "3m"] as ZoomLevel[]).map(z => (
                    <button
                      key={z}
                      onClick={() => { setZoom(z); ganttToday(); }}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-semibold transition-colors",
                        zoom === z ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {z === "2w" ? "2 Wks" : z === "1m" ? "1 Mo" : "3 Mo"}
                    </button>
                  ))}
                </div>
              )}

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={
                view === "gantt" ? ganttPrev
                : view === "events" ? () => setEventsWeek(w => addDays(w, -7))
                : () => setTeamWeek(w => addDays(w, -7))
              }>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="text-xs font-medium min-w-[164px] text-center text-muted-foreground">
                {view === "gantt"
                  ? `${format(ganttRange.start, "MMM d")} – ${format(ganttRange.end, "MMM d, yyyy")}`
                  : view === "events"
                    ? `${format(eventsWeek, "MMM d")} – ${format(addDays(eventsWeek, 6), "MMM d, yyyy")}`
                    : teamQuery.data
                      ? `${format(parseISO(teamQuery.data.weekStart), "MMM d")} – ${format(parseISO(teamQuery.data.weekEnd), "MMM d, yyyy")}`
                      : "Loading…"}
              </div>

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={
                view === "gantt" ? ganttNext
                : view === "events" ? () => setEventsWeek(w => addDays(w, 7))
                : () => setTeamWeek(w => addDays(w, 7))
              }>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={
                view === "gantt" ? ganttToday
                : view === "events" ? () => setEventsWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
                : () => setTeamWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }>
                Today
              </Button>
            </div>
          )}
        </div>

        {/* ── Schedule grid — primary focus of the page ── */}
        <div className="flex-1 min-h-[560px]">
          {view === "gantt" && (
            <GanttView
              data={ganttQuery.data}
              isLoading={ganttQuery.isLoading}
              zoom={zoom}
              ganttNav={ganttNav}
              onOpenAssignDialog={openAssignDialog}
              onDeleteAssignment={(id) => deleteMut.mutate(id)}
              onPatchAssignment={(payload) => patchMut.mutate(payload)}
            />
          )}

          {view === "team" && (
            <TeamView
              data={teamQuery.data}
              isLoading={teamQuery.isLoading}
              teamWeek={teamWeek}
              onOpenAssignDialog={() => openAssignDialog()}
              onDeleteAssignment={(id) => deleteMut.mutate(id)}
              onPatchAssignment={(payload) => patchMut.mutate(payload)}
            />
          )}

          {view === "events" && (
            <EventsView
              eventsWeek={eventsWeek}
              isOwnerOrForeman={isOwnerOrForeman}
              onEditEvent={(evt) => { setEditingEvent(evt); setShowEventDialog(true); }}
            />
          )}

          {view === "equipment" && (
            <EquipmentView
              isOwnerOrForeman={isOwnerOrForeman}
              onEditEquipment={(eq) => { setEditingEquipment(eq); setShowEquipmentDialog(true); }}
            />
          )}
        </div>

        {/* ── Assign Worker Dialog ── */}
        <AssignWorkerDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          initialProjectId={dialogProjectId}
          members={view === "gantt" ? ganttMembers : teamMembers}
          subcontractors={view === "gantt" ? ganttSubcontractors : teamSubcontractors}
          projects={view === "gantt" ? ganttProjects : teamProjects}
          onSubmit={(body) => createMut.mutate(body)}
          isSubmitting={createMut.isPending}
        />

        {/* ── New/Edit Event Dialog ── */}
        <EventDialog
          open={showEventDialog}
          onOpenChange={setShowEventDialog}
          editingEvent={editingEvent}
        />

        {/* ── Equipment Dialog ── */}
        <EquipmentDialog
          open={showEquipmentDialog}
          onOpenChange={setShowEquipmentDialog}
          editingEquipment={editingEquipment}
        />

      </div>
    </TooltipProvider>
  );
}
