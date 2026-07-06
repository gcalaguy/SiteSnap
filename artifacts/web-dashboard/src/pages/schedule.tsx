import { useMemo, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import {
  format, addDays, startOfWeek, parseISO,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
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
  GOLD, BLACK, type ViewMode, type ZoomLevel, type ScheduleEvent, type Equipment,
  getGanttRange,
} from "@/components/schedule/shared";

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
      <div className="space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
            <p className="text-muted-foreground mt-0.5">
              {view === "gantt" ? "Project timelines and worker assignments at a glance."
                : view === "team" ? "Weekly worker availability across all projects."
                : view === "events" ? "Meetings, site visits, and equipment bookings."
                : "Manage your company equipment fleet."}
            </p>
          </div>
          {view === "events" && isOwnerOrForeman && (
            <Button onClick={() => { setEditingEvent(null); setShowEventDialog(true); }} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> New Event
            </Button>
          )}
          {view === "equipment" && isOwnerOrForeman && (
            <Button onClick={() => { setEditingEquipment(null); setShowEquipmentDialog(true); }} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> Add Equipment
            </Button>
          )}
          {(view === "gantt" || view === "team") && (
            <Button onClick={() => openAssignDialog()} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> Assign Worker
            </Button>
          )}
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Workers Scheduled",   value: scheduledWorkers,         icon: Users,       targetView: "team"  as ViewMode },
            { label: "Active Projects",     value: activeProjects,           icon: Building2,   targetView: "gantt" as ViewMode },
            { label: "Unscheduled Members", value: Math.max(0, unscheduled), icon: CalendarDays, targetView: "team" as ViewMode },
          ].map(({ label, value, icon: Icon, targetView }) => {
            const isActive = view === targetView;
            return (
              <button
                key={label}
                onClick={() => setView(targetView)}
                className="rounded-xl p-4 text-left w-full transition-all hover:opacity-90 active:scale-[0.98]"
                style={{
                  background: BLACK,
                  boxShadow: isActive ? `0 0 0 1px ${GOLD}66, 0 4px 16px rgba(0,0,0,0.28)` : "0 4px 16px rgba(0,0,0,0.18)",
                  border: `1px solid ${isActive ? GOLD : "transparent"}`,
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
                  <Icon size={15} style={{ color: GOLD }} />
                </div>
                <p className="text-2xl font-bold text-white">{value}</p>
              </button>
            );
          })}
        </div>

        {/* ── View toggle + nav controls ── */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "#111111" }}>
                {([
                  { id: "gantt",     label: "Gantt",     Icon: GanttChartSquare },
                  { id: "team",      label: "Team Grid", Icon: LayoutGrid },
                  { id: "events",    label: "Events",    Icon: Clock },
                  { id: "equipment", label: "Equipment", Icon: Wrench },
                ] as const).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all text-[#111111] font-semibold bg-[#f2f1ed]"
                    style={view === id ? { background: "#C9A84C" } : {}}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>

              {/* Navigation (only for time-based views) */}
              {(view === "gantt" || view === "team" || view === "events") && (
                <div className="flex items-center gap-2">
                  {view === "gantt" && (
                    <div className="flex items-center gap-1 rounded-lg p-1 mr-2" style={{ background: "#111111" }}>
                      {(["2w", "1m", "3m"] as ZoomLevel[]).map(z => (
                        <button
                          key={z}
                          onClick={() => { setZoom(z); ganttToday(); }}
                          className="px-2.5 py-1 rounded-md text-xs transition-all text-[#111111] bg-[#f2efe6] font-bold"
                          style={zoom === z ? { background: "#C9A84C" } : {}}
                        >
                          {z === "2w" ? "2 Wks" : z === "1m" ? "1 Mo" : "3 Mo"}
                        </button>
                      ))}
                    </div>
                  )}

                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={
                    view === "gantt" ? ganttPrev
                    : view === "events" ? () => setEventsWeek(w => addDays(w, -7))
                    : () => setTeamWeek(w => addDays(w, -7))
                  }>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="text-sm font-semibold min-w-[180px] text-center">
                    {view === "gantt"
                      ? `${format(ganttRange.start, "MMM d")} – ${format(ganttRange.end, "MMM d, yyyy")}`
                      : view === "events"
                        ? `${format(eventsWeek, "MMM d")} – ${format(addDays(eventsWeek, 6), "MMM d, yyyy")}`
                        : teamQuery.data
                          ? `${format(parseISO(teamQuery.data.weekStart), "MMM d")} – ${format(parseISO(teamQuery.data.weekEnd), "MMM d, yyyy")}`
                          : "Loading…"}
                  </div>

                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={
                    view === "gantt" ? ganttNext
                    : view === "events" ? () => setEventsWeek(w => addDays(w, 7))
                    : () => setTeamWeek(w => addDays(w, 7))
                  }>
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="sm" className="text-xs h-8 px-3" onClick={
                    view === "gantt" ? ganttToday
                    : view === "events" ? () => setEventsWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
                    : () => setTeamWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
                  }>
                    Today
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── GANTT VIEW ── */}
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

        {/* ── TEAM GRID VIEW ── */}
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

        {/* ── EVENTS VIEW ── */}
        {view === "events" && (
          <EventsView
            eventsWeek={eventsWeek}
            isOwnerOrForeman={isOwnerOrForeman}
            onEditEvent={(evt) => { setEditingEvent(evt); setShowEventDialog(true); }}
          />
        )}

        {/* ── EQUIPMENT VIEW ── */}
        {view === "equipment" && (
          <EquipmentView
            isOwnerOrForeman={isOwnerOrForeman}
            onEditEquipment={(eq) => { setEditingEquipment(eq); setShowEquipmentDialog(true); }}
          />
        )}

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
