import { useState, useMemo, useCallback, useRef } from "react";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format, addDays, addMonths, startOfWeek, parseISO,
  startOfDay, eachDayOfInterval, eachWeekOfInterval,
  isSameDay, isWeekend,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, Loader2,
  Users, Building2, GanttChartSquare, LayoutGrid, X,
  Wrench, Clock, Trash2, Edit2, MapPin, AlertTriangle, Video, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOLD = "#C9A84C";
const BLACK = "#111111";
const NOTES_MAX = 1_000;

// ─── Types ────────────────────────────────────────────────────────────────────
type Member = { id: number; firstName: string; lastName: string; role: string; email: string };
type Subcontractor = { id: number; name: string; type: string; complianceStatus: string; coiExpiration: string | null; workersCompClearanceExpiration: string | null };
type GProject = { id: number; name: string; status: string; startDate: string | null; endDate: string | null };
type GAssignment = {
  id: number; projectId: number; userId: number | null;
  contactId: number | null;
  startDate: string; endDate: string; notes: string | null;
  projectName: string | null;
  userFirstName: string | null; userLastName: string | null; userRole: string | null;
  contactName: string | null; contactType: string | null; contactCompliance: string | null;
};
type GanttData = { assignments: GAssignment[]; projects: GProject[]; members: Member[]; subcontractors: Subcontractor[] };
type WeekData = {
  weekStart: string; weekEnd: string;
  assignments: GAssignment[]; members: Member[]; projects: GProject[]; subcontractors: Subcontractor[];
};
type ViewMode = "gantt" | "team" | "events" | "equipment";
type ZoomLevel = "2w" | "1m" | "3m";
type ScheduleEvent = {
  id: number; companyId: number; projectId: number | null; type: string; title: string;
  startTime: string; endTime: string; location: string | null; notes: string | null;
  meetingPlatform: string | null; meetingLink: string | null;
  status: string; projectName: string | null; createdByFirstName: string | null; createdByLastName: string | null;
  assignees: Array<{ id: number; eventId: number; resourceType: string; resourceId: number }>;
};
type Equipment = { id: number; companyId: number; name: string; type: string; status: string; notes: string | null; createdAt: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const USER_COLORS = [
  { bg: "#D4AF37", text: "#fff" }, { bg: "#3B82F6", text: "#fff" },
  { bg: "#10B981", text: "#fff" }, { bg: "#8B5CF6", text: "#fff" },
  { bg: "#F59E0B", text: "#1a1a1a" }, { bg: "#EF4444", text: "#fff" },
  { bg: "#06B6D4", text: "#fff" }, { bg: "#EC4899", text: "#fff" },
  { bg: "#14B8A6", text: "#fff" }, { bg: "#6366F1", text: "#fff" },
];
const PROJECT_COLORS_BG = [
  "#D4AF37","#3B82F6","#10B981","#8B5CF6","#F59E0B",
  "#EF4444","#06B6D4","#EC4899","#14B8A6","#6366F1",
];
const COL_WIDTH_PX: Record<ZoomLevel, number> = { "2w": 54, "1m": 38, "3m": 82 };
const MS_DAY = 86_400_000;
const BAR_H = 26;
const BAR_GAP = 4;
const ROW_PAD = 10;
const LABEL_W = 224;

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  planning:    { label: "Active",      cls: "bg-green-100 text-green-700 border-green-200" },
  in_progress: { label: "In Progress", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  completed:   { label: "Completed",   cls: "bg-green-100 text-green-700 border-green-200" },
  on_hold:     { label: "On Hold",     cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getUserColor = (uid: number) => USER_COLORS[uid % USER_COLORS.length];
const getProjectBg = (pid: number) => PROJECT_COLORS_BG[pid % PROJECT_COLORS_BG.length];
const initials = (f: string, l: string) => `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();

type TrackItem = { id: number; startMs: number; endMs: number };
function assignTracks<T extends TrackItem>(items: T[]): Array<T & { track: number }> {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs);
  const ends: number[] = [];
  return sorted.map(item => {
    const t = ends.findIndex(e => e <= item.startMs);
    if (t === -1) { ends.push(item.endMs); return { ...item, track: ends.length - 1 }; }
    ends[t] = item.endMs;
    return { ...item, track: t };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Schedule() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const [view, setView] = useState<ViewMode>("gantt");
  const [zoom, setZoom] = useState<ZoomLevel>("1m");
  const [ganttNav, setGanttNav] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [teamWeek, setTeamWeek] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Crew assignment dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [dlgUserId, setDlgUserId] = useState("");
  const [dlgContactId, setDlgContactId] = useState("");
  const [dlgProjectId, setDlgProjectId] = useState("");
  const [dlgStart, setDlgStart] = useState("");
  const [dlgEnd, setDlgEnd] = useState("");
  const [dlgNotes, setDlgNotes] = useState("");

  // Events view state
  const [eventsWeek, setEventsWeek] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [evtTitle, setEvtTitle] = useState("");
  const [evtType, setEvtType] = useState("meeting");
  const [evtProjectId, setEvtProjectId] = useState("");
  const [evtDate, setEvtDate] = useState("");
  const [evtStartTime, setEvtStartTime] = useState("09:00");
  const [evtEndTime, setEvtEndTime] = useState("10:00");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtNotes, setEvtNotes] = useState("");
  const [evtMeetingPlatform, setEvtMeetingPlatform] = useState("");
  const [evtMeetingLink, setEvtMeetingLink] = useState("");
  const [evtConflicts, setEvtConflicts] = useState<any[]>([]);
  const [evtRecipientEmails, setEvtRecipientEmails] = useState<string[]>([]);
  const [evtEmailInput, setEvtEmailInput] = useState("");
  const [editEvtId, setEditEvtId] = useState<number | null>(null);

  // Equipment view state
  const [showEquipmentDialog, setShowEquipmentDialog] = useState(false);
  const [editEquipId, setEditEquipId] = useState<number | null>(null);
  const [eqName, setEqName] = useState("");
  const [eqType, setEqType] = useState("other");
  const [eqStatus, setEqStatus] = useState("available");
  const [eqNotes, setEqNotes] = useState("");

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  // ── Gantt range ──────────────────────────────────────────────────────────
  const ganttRange = useMemo(() => {
    if (zoom === "2w") {
      const start = startOfWeek(ganttNav, { weekStartsOn: 1 });
      return { start, end: addDays(start, 13) };
    }
    if (zoom === "1m") {
      const start = new Date(ganttNav.getFullYear(), ganttNav.getMonth(), 1);
      const end = new Date(ganttNav.getFullYear(), ganttNav.getMonth() + 1, 0);
      return { start, end };
    }
    // 3m
    const start = new Date(ganttNav.getFullYear(), ganttNav.getMonth(), 1);
    const end = addDays(addMonths(start, 3), -1);
    return { start, end };
  }, [ganttNav, zoom]);

  function ganttPrev() {
    if (zoom === "2w") setGanttNav(d => addDays(d, -14));
    else if (zoom === "1m") setGanttNav(d => addMonths(d, -1));
    else setGanttNav(d => addMonths(d, -3));
  }
  function ganttNext() {
    if (zoom === "2w") setGanttNav(d => addDays(d, 14));
    else if (zoom === "1m") setGanttNav(d => addMonths(d, 1));
    else setGanttNav(d => addMonths(d, 3));
  }
  function ganttToday() {
    const n = new Date();
    setGanttNav(zoom === "2w" ? startOfWeek(n, { weekStartsOn: 1 }) : new Date(n.getFullYear(), n.getMonth(), 1));
  }

  // ── Computed columns & geometry ──────────────────────────────────────────
  const { columns, colWidth, viewStartMs, viewEndMs, timelineW } = useMemo(() => {
    const colWidth = COL_WIDTH_PX[zoom];
    let columns: Array<{ key: string; label: string; sub: string; weekend: boolean; today: boolean; startMs: number }>;

    if (zoom === "2w" || zoom === "1m") {
      columns = eachDayOfInterval({ start: ganttRange.start, end: ganttRange.end }).map(d => ({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "d"),
        sub: format(d, "EEEEE"),
        weekend: isWeekend(d),
        today: isSameDay(d, new Date()),
        startMs: startOfDay(d).getTime(),
      }));
    } else {
      columns = eachWeekOfInterval({ start: ganttRange.start, end: ganttRange.end }, { weekStartsOn: 1 }).map(w => ({
        key: format(w, "yyyy-MM-dd"),
        label: format(w, "MMM d"),
        sub: "",
        weekend: false,
        today: false,
        startMs: startOfDay(w).getTime(),
      }));
    }

    const viewStartMs = startOfDay(ganttRange.start).getTime();
    const viewEndMs = addDays(startOfDay(ganttRange.end), 1).getTime();
    const timelineW = columns.length * colWidth;
    return { columns, colWidth, viewStartMs, viewEndMs, timelineW };
  }, [ganttRange, zoom]);

  const todayLinePx = useMemo(() => {
    const ms = startOfDay(new Date()).getTime();
    if (ms < viewStartMs || ms >= viewEndMs) return null;
    return ((ms - viewStartMs) / (viewEndMs - viewStartMs)) * timelineW;
  }, [viewStartMs, viewEndMs, timelineW]);

  const barGeometry = useCallback((s: string, e: string) => {
    const sMs = startOfDay(parseISO(s)).getTime();
    const eMs = addDays(startOfDay(parseISO(e)), 1).getTime();
    const clampS = Math.max(sMs, viewStartMs);
    const clampE = Math.min(eMs, viewEndMs);
    if (clampS >= clampE) return null;
    const total = viewEndMs - viewStartMs;
    return {
      leftPx: ((clampS - viewStartMs) / total) * timelineW,
      widthPx: Math.max(((clampE - clampS) / total) * timelineW, 6),
    };
  }, [viewStartMs, viewEndMs, timelineW]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const ganttQuery = useQuery<GanttData>({
    queryKey: ["schedule-gantt", format(ganttRange.start, "yyyy-MM-dd"), format(ganttRange.end, "yyyy-MM-dd")],
    queryFn: () => customFetch(`/api/schedule/gantt?from=${format(ganttRange.start, "yyyy-MM-dd")}&to=${format(ganttRange.end, "yyyy-MM-dd")}`),
    enabled: isOwnerOrForeman && view === "gantt",
  });

  const weekOf = format(teamWeek, "yyyy-MM-dd");
  const teamQuery = useQuery<WeekData>({
    queryKey: ["schedule", weekOf],
    queryFn: () => customFetch(`/api/schedule?weekOf=${weekOf}`),
    enabled: isOwnerOrForeman && view === "team",
  });

  const equipmentQuery = useQuery<Equipment[]>({
    queryKey: ["equipment"],
    queryFn: () => customFetch("/api/equipment"),
    enabled: view === "equipment",
  });


  const eventsFrom = format(eventsWeek, "yyyy-MM-dd");
  const eventsTo = format(addDays(eventsWeek, 6), "yyyy-MM-dd");
  const eventsQuery = useQuery<ScheduleEvent[]>({
    queryKey: ["schedule-events", eventsFrom],
    queryFn: () => customFetch(`/api/schedule/events?from=${eventsFrom}T00:00:00&to=${eventsTo}T23:59:59`),
    enabled: isOwnerOrForeman && view === "events",
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-gantt"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      setShowDialog(false);
      toast({ title: "Worker assigned" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-gantt"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to remove", variant: "destructive" }),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, startDate, endDate }: { id: number; startDate: string; endDate: string }) =>
      customFetch(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify({ startDate, endDate }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-gantt"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Assignment updated" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to update", variant: "destructive" }),
  });

  // ── Equipment mutations ───────────────────────────────────────────────────
  const createEquipMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/equipment", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); setShowEquipmentDialog(false); toast({ title: "Equipment added" }); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });
  const updateEquipMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & object) => customFetch(`/api/equipment/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); setShowEquipmentDialog(false); toast({ title: "Equipment updated" }); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });
  const deleteEquipMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["equipment"] }); toast({ title: "Equipment removed" }); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  // ── Schedule event mutations ──────────────────────────────────────────────
  const createEventMut = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule/events", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-events"] }); setShowEventDialog(false); toast({ title: "Event created" }); },
    onError: async (err: any) => {
      if (err?.status === 409) {
        const data = (await err.json?.()) ?? {};
        setEvtConflicts(data.conflicts ?? []);
        toast({ title: "Conflict detected — review below", variant: "destructive" });
      } else {
        toast({ title: err?.message ?? "Failed", variant: "destructive" });
      }
    },
  });
  const updateEventMut = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & object) =>
      customFetch(`/api/schedule/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-events"] });
      setShowEventDialog(false);
      toast({ title: "Event updated" });
    },
    onError: async (err: any) => {
      if (err?.status === 409) {
        const data = (await err.json?.()) ?? {};
        setEvtConflicts(data.conflicts ?? []);
        toast({ title: "Conflict detected — review below", variant: "destructive" });
      } else {
        toast({ title: err?.message ?? "Failed", variant: "destructive" });
      }
    },
  });
  const deleteEventMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/events/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-events"] }); toast({ title: "Event removed" }); },
    onError: (err: any) => toast({ title: err?.message ?? "Failed", variant: "destructive" }),
  });

  function openEquipDialog(eq?: Equipment) {
    if (eq) {
      setEditEquipId(eq.id); setEqName(eq.name); setEqType(eq.type); setEqStatus(eq.status); setEqNotes(eq.notes ?? "");
    } else {
      setEditEquipId(null); setEqName(""); setEqType("other"); setEqStatus("available"); setEqNotes("");
    }
    setShowEquipmentDialog(true);
  }

  function openEventDialog() {
    setEditEvtId(null);
    setEvtTitle(""); setEvtType("meeting"); setEvtProjectId(""); setEvtConflicts([]);
    setEvtDate(format(new Date(), "yyyy-MM-dd")); setEvtStartTime("09:00"); setEvtEndTime("10:00");
    setEvtLocation(""); setEvtNotes(""); setEvtMeetingPlatform(""); setEvtMeetingLink("");
    setEvtRecipientEmails([]); setEvtEmailInput("");
    setShowEventDialog(true);
  }

  function openEditEventDialog(evt: ScheduleEvent) {
    setEditEvtId(evt.id);
    setEvtTitle(evt.title);
    setEvtType(evt.type);
    setEvtProjectId(evt.projectId ? String(evt.projectId) : "");
    setEvtConflicts([]);
    setEvtDate(format(parseISO(evt.startTime), "yyyy-MM-dd"));
    setEvtStartTime(format(parseISO(evt.startTime), "HH:mm"));
    setEvtEndTime(format(parseISO(evt.endTime), "HH:mm"));
    setEvtLocation(evt.location ?? "");
    setEvtNotes(evt.notes ?? "");
    setEvtMeetingPlatform(evt.meetingPlatform ?? "");
    setEvtMeetingLink(evt.meetingLink ?? "");
    setEvtRecipientEmails([]);
    setEvtEmailInput("");
    setShowEventDialog(true);
  }

  function addEvtEmail(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setEvtRecipientEmails(prev => prev.includes(email) ? prev : [...prev, email]);
    setEvtEmailInput("");
  }

  function handleEvtEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addEvtEmail(evtEmailInput);
    } else if (e.key === "Backspace" && !evtEmailInput) {
      setEvtRecipientEmails(prev => prev.slice(0, -1));
    }
  }

  async function pickContacts() {
    if (!("contacts" in navigator && "ContactsManager" in window)) {
      toast({ title: "Contact picker not supported in this browser", variant: "destructive" });
      return;
    }
    try {
      const picked = await (navigator as any).contacts.select(["email"], { multiple: true });
      const newEmails: string[] = picked.flatMap((c: any) => (c.email ?? []) as string[])
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      setEvtRecipientEmails(prev => [...new Set([...prev, ...newEmails])]);
    } catch {
      // user cancelled — do nothing
    }
  }

  // ── Drag state (Gantt) ────────────────────────────────────────────────────
  type DragInfo = { id: number; kind: "move" | "resize"; startClientX: number; origStartMs: number; origEndMs: number };
  const dragRef = useRef<DragInfo | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: number; leftPx: number; widthPx: number; startDate: string; endDate: string } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // ── Drag state (Team grid) ────────────────────────────────────────────────
  const teamDragRef = useRef<{ id: number; fromDay: string; startDate: string; endDate: string } | null>(null);
  const [teamDragOver, setTeamDragOver] = useState<string | null>(null);

  function handleBarPointerDown(e: React.PointerEvent, bar: GAssignment, kind: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: bar.id, kind,
      startClientX: e.clientX,
      origStartMs: startOfDay(parseISO(bar.startDate)).getTime(),
      origEndMs: startOfDay(parseISO(bar.endDate)).getTime(),
    };
    setIsDragActive(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dr = dragRef.current;
    const deltaX = e.clientX - dr.startClientX;
    const totalMs = viewEndMs - viewStartMs;
    const rawDeltaMs = (deltaX / timelineW) * totalMs;
    const daysPerSnap = zoom === "3m" ? 7 : 1;
    const deltaDays = Math.round(rawDeltaMs / (MS_DAY * daysPerSnap)) * daysPerSnap;

    let newStartMs = dr.kind === "move" ? dr.origStartMs + deltaDays * MS_DAY : dr.origStartMs;
    let newEndMs = dr.origEndMs + deltaDays * MS_DAY;
    if (dr.kind === "resize") newEndMs = Math.max(newEndMs, dr.origStartMs);

    const clampS = Math.max(newStartMs, viewStartMs);
    const clampE = Math.min(newEndMs + MS_DAY, viewEndMs);
    if (clampS >= clampE) return;

    const total = viewEndMs - viewStartMs;
    setDragPreview({
      id: dr.id,
      leftPx: ((clampS - viewStartMs) / total) * timelineW,
      widthPx: Math.max(((clampE - clampS) / total) * timelineW, 6),
      startDate: format(new Date(newStartMs), "yyyy-MM-dd"),
      endDate: format(new Date(newEndMs), "yyyy-MM-dd"),
    });
  }

  function handlePointerUp() {
    if (dragRef.current && dragPreview && dragPreview.id === dragRef.current.id) {
      patchMut.mutate({ id: dragPreview.id, startDate: dragPreview.startDate, endDate: dragPreview.endDate });
    }
    dragRef.current = null;
    setDragPreview(null);
    setIsDragActive(false);
  }

  function openDialog(projectId?: string) {
    setDlgUserId(""); setDlgContactId(""); setDlgProjectId(projectId ?? "");
    setDlgStart(format(new Date(), "yyyy-MM-dd"));
    setDlgEnd(format(addDays(new Date(), 6), "yyyy-MM-dd"));
    setDlgNotes(""); setShowDialog(true);
  }

  const selectedSubcontractor = dlgContactId
    ? (view === "gantt" ? ganttQuery.data?.subcontractors ?? [] : (teamQuery.data?.subcontractors ?? []))
        .find(s => String(s.id) === dlgContactId)
    : null;

  const complianceWarning = selectedSubcontractor && (selectedSubcontractor.complianceStatus === "non_compliant" || selectedSubcontractor.complianceStatus === "warning") ? selectedSubcontractor : null;

  // ── Gantt row data ────────────────────────────────────────────────────────
  const ganttProjects = ganttQuery.data?.projects ?? [];
  const ganttAssignments = ganttQuery.data?.assignments ?? [];
  const ganttMembers = ganttQuery.data?.members ?? [];

  const ganttRows = useMemo(() => {
    return ganttProjects.map(project => {
      const bars = ganttAssignments
        .filter(a => a.projectId === project.id)
        .map(a => ({
          ...a,
          startMs: startOfDay(parseISO(a.startDate)).getTime(),
          endMs: addDays(startOfDay(parseISO(a.endDate)), 1).getTime(),
        }));
      const tracked = assignTracks(bars);
      const numTracks = tracked.length === 0 ? 1 : Math.max(...tracked.map(b => b.track)) + 1;
      const rowH = Math.max(48, numTracks * (BAR_H + BAR_GAP) + ROW_PAD * 2);
      return { project, bars: tracked, numTracks, rowH };
    });
  }, [ganttProjects, ganttAssignments]);

  // ── Summaries ─────────────────────────────────────────────────────────────
  const { scheduledWorkers, activeProjects, unscheduled } = useMemo(() => {
    const allAssignments = view === "gantt" ? ganttAssignments : (teamQuery.data?.assignments ?? []);
    const allMembers = view === "gantt" ? ganttMembers : (teamQuery.data?.members ?? []);
    const wIds = new Set(allAssignments.map(a => a.userId).filter(Boolean));
    const pIds = new Set(allAssignments.map(a => a.projectId));
    return { scheduledWorkers: wIds.size, activeProjects: pIds.size, unscheduled: allMembers.length - wIds.size };
  }, [view, ganttAssignments, ganttMembers, teamQuery.data]);

  // ── Team view helpers ─────────────────────────────────────────────────────
  const teamWeekDays = useMemo(() => {
    const start = teamQuery.data ? parseISO(teamQuery.data.weekStart) : teamWeek;
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [teamQuery.data, teamWeek]);

  function getTeamCellAssignments(userId: number, day: Date) {
    if (!teamQuery.data) return [];
    const dayStr = format(day, "yyyy-MM-dd");
    return teamQuery.data.assignments.filter(a => a.userId === userId && dayStr >= a.startDate && dayStr <= a.endDate);
  }

  function getSubcontractorCellAssignments(contactId: number, day: Date) {
    if (!teamQuery.data) return [];
    const dayStr = format(day, "yyyy-MM-dd");
    return teamQuery.data.assignments.filter(a => a.contactId === contactId && dayStr >= a.startDate && dayStr <= a.endDate);
  }

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isOwnerOrForeman) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Schedule is for owners and foremans only.</p>
      </div>
    );
  }

  const isLoading = view === "gantt" ? ganttQuery.isLoading : teamQuery.isLoading;
  const teamProjects = teamQuery.data?.projects ?? [];

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
            <Button onClick={openEventDialog} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> New Event
            </Button>
          )}
          {view === "equipment" && isOwnerOrForeman && (
            <Button onClick={() => openEquipDialog()} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" /> Add Equipment
            </Button>
          )}
          {(view === "gantt" || view === "team") && (
            <Button onClick={() => openDialog()} className="shrink-0">
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
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading timeline…
              </div>
            ) : ganttProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Building2 className="h-10 w-10 mb-3 opacity-40" />
                <p className="font-medium">No projects yet.</p>
              </div>
            ) : (
              <div className="flex overflow-hidden">
                {/* ── Left label panel (fixed) ── */}
                <div className="shrink-0 border-r bg-muted/20" style={{ width: LABEL_W }}>
                  {/* Header spacer */}
                  <div className="border-b bg-muted/40 flex items-end pb-1 px-3" style={{ height: 56 }}>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</span>
                  </div>
                  {ganttRows.map(({ project, rowH }) => {
                    const st = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
                    return (
                      <div
                        key={project.id}
                        className="border-b flex flex-col justify-center px-3 gap-1 cursor-pointer hover:bg-muted/30 transition-colors"
                        style={{ height: rowH }}
                        onClick={() => openDialog(String(project.id))}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: getProjectBg(project.id) }} />
                          <span className="text-sm font-semibold truncate leading-snug">{project.name}</span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 self-start ${st.cls}`}>
                          {st.label}
                        </Badge>
                      </div>
                    );
                  })}
                  {/* Member legend */}
                  {ganttMembers.length > 0 && (
                    <div className="border-t pt-3 px-3 pb-2 bg-muted/10">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Workers</p>
                      {ganttMembers.map(m => {
                        const c = getUserColor(m.id);
                        return (
                          <div key={m.id} className="flex items-center gap-2 mb-1.5">
                            <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: c.bg }} />
                            <span className="text-xs text-muted-foreground truncate">{m.firstName} {m.lastName}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Right scrollable timeline ── */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ minWidth: 0 }}>
                  <div style={{ width: timelineW, minWidth: "100%" }}>

                    {/* Date header */}
                    <div className="flex border-b bg-muted/40" style={{ height: 56 }}>
                      {columns.map(col => (
                        <div
                          key={col.key}
                          className={`shrink-0 flex flex-col items-center justify-center border-r last:border-r-0 ${col.weekend ? "bg-slate-100/70" : ""} ${col.today ? "bg-orange-50" : ""}`}
                          style={{ width: colWidth }}
                        >
                          {col.sub && (
                            <span className={`text-[9px] font-medium uppercase ${col.today ? "text-primary" : "text-muted-foreground/60"}`}>
                              {col.sub}
                            </span>
                          )}
                          <span className={`text-xs font-semibold ${col.today ? "text-primary" : col.weekend ? "text-muted-foreground/70" : "text-foreground/80"}`}>
                            {col.label}
                          </span>
                          {col.today && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
                        </div>
                      ))}
                    </div>

                    {/* Project rows */}
                    {ganttRows.map(({ project, bars, rowH }) => {
                      const projGeo = project.startDate && project.endDate
                        ? barGeometry(project.startDate, project.endDate)
                        : null;

                      return (
                        <div key={project.id} className="border-b relative" style={{ height: rowH }}>
                          {/* Column bg stripes */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {columns.map(col => (
                              <div
                                key={col.key}
                                className={`shrink-0 h-full border-r last:border-r-0 ${col.weekend ? "bg-slate-50/80" : ""} ${col.today ? "bg-orange-50/60" : ""}`}
                                style={{ width: colWidth }}
                              />
                            ))}
                          </div>

                          {/* Today indicator */}
                          {todayLinePx !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-primary/70 z-10 pointer-events-none"
                              style={{ left: todayLinePx }}
                            />
                          )}

                          {/* Project timeline bar (background) */}
                          {projGeo && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="absolute top-1 h-1.5 rounded-full opacity-30 pointer-events-auto cursor-default"
                                  style={{
                                    left: projGeo.leftPx,
                                    width: projGeo.widthPx,
                                    backgroundColor: getProjectBg(project.id),
                                  }}
                                />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs font-medium">{project.name} timeline</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(project.startDate!), "MMM d")} – {format(parseISO(project.endDate!), "MMM d, yyyy")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Assignment bars */}
                          {bars.map(bar => {
                            const isDragging = dragPreview?.id === bar.id;
                            const geo = isDragging
                              ? { leftPx: dragPreview!.leftPx, widthPx: dragPreview!.widthPx }
                              : barGeometry(bar.startDate, bar.endDate);
                            if (!geo) return null;
                            const colorId = bar.userId ?? bar.contactId ?? 0;
                            const c = getUserColor(colorId);
                            const topPx = ROW_PAD + bar.track * (BAR_H + BAR_GAP) + (projGeo ? 8 : 0);
                            const name = bar.contactName
                              ? `${bar.contactName} (${bar.contactType})`
                              : `${bar.userFirstName ?? ""} ${bar.userLastName ?? ""}`.trim();
                            const displayStart = isDragging ? dragPreview!.startDate : bar.startDate;
                            const displayEnd = isDragging ? dragPreview!.endDate : bar.endDate;
                            return (
                              <Tooltip key={bar.id}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`absolute flex items-center gap-1 px-2 rounded-md text-xs font-medium shadow-sm group z-20 overflow-hidden select-none touch-none ${isDragging ? "cursor-grabbing opacity-95 ring-2 ring-white/60 shadow-lg" : "cursor-grab"}`}
                                    style={{
                                      left: geo.leftPx + 1,
                                      width: geo.widthPx - 2,
                                      top: topPx,
                                      height: BAR_H,
                                      backgroundColor: c.bg,
                                      color: c.text,
                                      transition: isDragging ? "none" : undefined,
                                    }}
                                    onPointerDown={(e) => {
                                      if ((e.target as HTMLElement).closest("[data-nondrag]")) return;
                                      handleBarPointerDown(e, bar, "move");
                                    }}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                  >
                                    {geo.widthPx > 36 && (
                                      <div
                                        className="h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold"
                                        style={{ backgroundColor: `${c.text}22`, color: c.text }}
                                      >
                                        {bar.contactName
                                          ? bar.contactName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                                          : initials(bar.userFirstName ?? "?", bar.userLastName ?? "?")}
                                      </div>
                                    )}
                                    {geo.widthPx > 60 && (
                                      <span className="truncate text-[11px]">{name}</span>
                                    )}
                                    <button
                                      data-nondrag
                                      className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded p-0.5"
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={() => deleteMut.mutate(bar.id)}
                                      title="Remove"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                    {/* Resize handle — right edge */}
                                    <div
                                      data-nondrag
                                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/20 rounded-r-md"
                                      title="Drag to resize"
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        handleBarPointerDown(e, bar, "resize");
                                      }}
                                      onPointerMove={handlePointerMove}
                                      onPointerUp={handlePointerUp}
                                    />
                                  </div>
                                </TooltipTrigger>
                                {!isDragActive && (
                                  <TooltipContent side="top" className="max-w-[220px]">
                                    <p className="font-semibold text-xs">{name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{bar.userRole}</p>
                                    <p className="text-xs mt-1">
                                      {format(parseISO(displayStart), "MMM d")} – {format(parseISO(displayEnd), "MMM d, yyyy")}
                                    </p>
                                    {bar.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{bar.notes}</p>}
                                    <p className="text-[10px] text-muted-foreground mt-1 opacity-70">Drag to move · drag right edge to resize</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            );
                          })}

                          {/* Click to add button overlay */}
                          {bars.length === 0 && (
                            <button
                              className="absolute inset-x-2 inset-y-1 flex items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/40 hover:border-primary/50 hover:text-primary/60 hover:bg-primary/5 transition-all text-xs gap-1 z-20"
                              onClick={() => openDialog(String(project.id))}
                            >
                              <Plus className="h-3 w-3" /> Assign worker
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── TEAM GRID VIEW ── */}
        {view === "team" && (
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading schedule…
              </div>
            ) : (teamQuery.data?.members ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Users className="h-10 w-10 mb-3 opacity-40" />
                <p className="font-medium">No team members yet.</p>
                <p className="text-sm mt-1">Invite workers from the Team page first.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide w-[180px] bg-muted/30 border-r">
                          Worker
                        </th>
                        {teamWeekDays.map(day => {
                          const isToday = isSameDay(day, new Date());
                          return (
                            <th key={day.toISOString()}
                              className={`py-3 px-2 text-center border-r last:border-r-0 min-w-[110px] ${isToday ? "bg-primary/5" : "bg-muted/30"}`}
                            >
                              <div className="text-xs text-muted-foreground uppercase tracking-wide">{format(day, "EEE")}</div>
                              <div className={`text-sm font-semibold mt-0.5 ${isToday ? "text-primary" : ""}`}>{format(day, "MMM d")}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(teamQuery.data?.members ?? []).map((member, idx) => (
                        <tr key={member.id} className={`border-b last:border-b-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="py-2 px-3 border-r align-top">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                                  {initials(member.firstName, member.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate leading-tight">{member.firstName} {member.lastName}</p>
                                <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                              </div>
                            </div>
                          </td>
                          {teamWeekDays.map(day => {
                            const isToday = isSameDay(day, new Date());
                            const isWknd = isWeekend(day);
                            const dayStr = format(day, "yyyy-MM-dd");
                            const cellKey = `${member.id}-${dayStr}`;
                            const isDragTarget = teamDragOver === cellKey;
                            const cellA = getTeamCellAssignments(member.id, day);
                            return (
                              <td key={day.toISOString()}
                                className={`py-1.5 px-1.5 border-r last:border-r-0 align-top min-h-[56px] transition-colors ${isToday ? "bg-primary/5" : isWknd ? "bg-muted/20" : ""} ${isDragTarget ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}
                                onDragOver={(e) => { e.preventDefault(); setTeamDragOver(cellKey); }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTeamDragOver(null); }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setTeamDragOver(null);
                                  if (!teamDragRef.current) return;
                                  const dr = teamDragRef.current;
                                  const fromMs = startOfDay(parseISO(dr.fromDay)).getTime();
                                  const toMs = startOfDay(day).getTime();
                                  const deltaDays = Math.round((toMs - fromMs) / MS_DAY);
                                  if (deltaDays === 0) return;
                                  patchMut.mutate({
                                    id: dr.id,
                                    startDate: format(addDays(parseISO(dr.startDate), deltaDays), "yyyy-MM-dd"),
                                    endDate: format(addDays(parseISO(dr.endDate), deltaDays), "yyyy-MM-dd"),
                                  });
                                  teamDragRef.current = null;
                                }}
                              >
                                <div className="space-y-1">
                                  {cellA.map(a => {
                                    const c = getUserColor(a.projectId);
                                    return (
                                      <Tooltip key={a.id}>
                                        <TooltipTrigger asChild>
                                          <div
                                            className="group relative flex items-center gap-1 rounded px-2 py-1 text-white text-xs font-medium cursor-grab select-none"
                                            style={{ backgroundColor: c.bg, color: c.text }}
                                            draggable
                                            onDragStart={() => {
                                              teamDragRef.current = { id: a.id, fromDay: dayStr, startDate: a.startDate, endDate: a.endDate };
                                            }}
                                            onDragEnd={() => { teamDragRef.current = null; setTeamDragOver(null); }}
                                          >
                                            <span className="truncate leading-tight">{a.projectName}</span>
                                            <button
                                              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-white/20 rounded p-0.5"
                                              onClick={() => deleteMut.mutate(a.id)}
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs font-medium">{a.projectName}</p>
                                          {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                                          <p className="text-[10px] text-muted-foreground mt-1 opacity-70">Drag to another day to reschedule</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                  <button
                                    className="w-full h-5 rounded border border-dashed border-border/50 text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"
                                    onClick={() => openDialog()}
                                    title="Add assignment"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Project legend */}
                {teamProjects.length > 0 && (
                  <div className="border-t px-4 py-3 flex flex-wrap gap-3">
                    {teamProjects.map(p => {
                      const c = getUserColor(p.id);
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.bg }} />
                          <span className="text-xs text-muted-foreground">{p.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* ── Assign Worker Dialog ── */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Worker to Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium block mb-1">Worker *</label>
                <Select value={dlgUserId} onValueChange={(v) => { setDlgUserId(v); setDlgContactId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select a worker…" /></SelectTrigger>
                  <SelectContent>
                    {(view === "gantt" ? ganttMembers : (teamQuery.data?.members ?? [])).map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[9px] bg-muted">{initials(m.firstName, m.lastName)}</AvatarFallback>
                          </Avatar>
                          {m.firstName} {m.lastName}
                          <span className="text-xs text-muted-foreground capitalize ml-1">({m.role})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center text-xs text-muted-foreground font-medium">or</div>
              <div>
                <label className="text-sm font-medium block mb-1">Subcontractor *</label>
                <Select value={dlgContactId} onValueChange={(v) => { setDlgContactId(v); setDlgUserId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select a subcontractor…" /></SelectTrigger>
                  <SelectContent>
                    {(view === "gantt" ? ganttQuery.data?.subcontractors : (teamQuery.data?.subcontractors ?? []))?.map((s: Subcontractor) => {
                      const isBad = s.complianceStatus === "non_compliant";
                      const isWarn = s.complianceStatus === "warning";
                      return (
                        <SelectItem key={s.id} value={String(s.id)} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {s.name}
                            {isBad && <Badge className="ml-2 text-[10px] bg-red-100 text-red-700 border-0">Non-Compliant</Badge>}
                            {isWarn && <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-0">Warning</Badge>}
                            {s.complianceStatus === "compliant" && <Badge className="ml-2 text-[10px] bg-green-100 text-green-700 border-0">Compliant</Badge>}
                          </span>
                        </SelectItem>
                      );
                    }) ?? <div className="p-2 text-xs text-muted-foreground">No subcontractors found. Add one in Contacts.</div>}
                  </SelectContent>
                </Select>
              </div>
              {complianceWarning && (
                <div className={`rounded-md px-3 py-2 text-sm font-medium flex items-start gap-2 ${
                  complianceWarning.complianceStatus === "non_compliant"
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Compliance {complianceWarning.complianceStatus === "non_compliant" ? "Issue" : "Warning"}:</span>{" "}
                    {complianceWarning.complianceStatus === "non_compliant"
                      ? "This subcontractor is missing or has expired compliance documents. You cannot assign them until the COI and WCB are updated."
                      : "This subcontractor has compliance documents expiring within 30 days. Review their COI and WCB before proceeding."}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-1">Project *</label>
                <Select value={dlgProjectId} onValueChange={setDlgProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
                  <SelectContent>
                    {(view === "gantt" ? ganttProjects : teamProjects).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <span className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: getProjectBg(p.id) }} />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Date *</label>
                  <Input type="date" value={dlgStart} onChange={e => setDlgStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Date *</label>
                  <Input type="date" value={dlgEnd} min={dlgStart} onChange={e => setDlgEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Notes (optional)</label>
                <CharCountedTextarea
                  placeholder="e.g. Framing crew, 7am–3pm"
                  value={dlgNotes}
                  onChange={e => setDlgNotes(e.target.value.slice(0, NOTES_MAX))}
                  className="min-h-[60px]"
                  maxLength={NOTES_MAX}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if ((!dlgUserId && !dlgContactId) || !dlgProjectId || !dlgStart || !dlgEnd) return;
                  if (dlgContactId && complianceWarning?.complianceStatus === "non_compliant") return;
                  const body: Record<string, unknown> = { projectId: Number(dlgProjectId), startDate: dlgStart, endDate: dlgEnd, notes: dlgNotes || undefined };
                  if (dlgUserId) body.userId = Number(dlgUserId);
                  if (dlgContactId) body.contactId = Number(dlgContactId);
                  createMut.mutate(body);
                }}
                disabled={(!dlgUserId && !dlgContactId) || !dlgProjectId || !dlgStart || !dlgEnd || createMut.isPending || (complianceWarning?.complianceStatus === "non_compliant") || dlgNotes.length >= NOTES_MAX}
              >
                {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── EVENTS VIEW ── */}
        {view === "events" && (
          <div className="space-y-3">
            {eventsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading events…
              </div>
            ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Clock className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No events this week.</p>
                  <p className="text-sm mt-1">Use "New Event" to schedule a meeting, site visit, or equipment booking.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {eventsQuery.data.map(evt => {
                  const typeConfig: Record<string, { color: string; label: string }> = {
                    meeting: { color: "#3B82F6", label: "Meeting" },
                    equipment_booking: { color: "#F59E0B", label: "Equipment" },
                    site_visit: { color: "#10B981", label: "Site Visit" },
                    inspection: { color: "#8B5CF6", label: "Inspection" },
                    other: { color: "#6B7280", label: "Other" },
                  };
                  const tc = typeConfig[evt.type] ?? typeConfig.other;
                  const start = new Date(evt.startTime);
                  const end = new Date(evt.endTime);
                  return (
                    <Card key={evt.id} className="overflow-hidden">
                      <div className="flex">
                        <div className="w-1 shrink-0" style={{ backgroundColor: tc.color }} />
                        <CardContent className="py-3 px-4 flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tc.color }}>
                                  {tc.label}
                                </span>
                                {evt.projectName && (
                                  <span className="text-xs text-muted-foreground truncate">{evt.projectName}</span>
                                )}
                              </div>
                              <p className="font-semibold text-sm">{evt.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(start, "EEE MMM d, h:mm a")} – {format(end, "h:mm a")}
                                </span>
                                {evt.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {evt.location}
                                  </span>
                                )}
                              </div>
                              {evt.notes && <p className="text-xs text-muted-foreground mt-1 italic">{evt.notes}</p>}
                            </div>
                            {isOwnerOrForeman && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openEditEventDialog(evt)}
                                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                  title="Edit event"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deleteEventMut.mutate(evt.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                  title="Delete event"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EQUIPMENT VIEW ── */}
        {view === "equipment" && (
          <div>
            {equipmentQuery.isLoading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading equipment…
              </div>
            ) : !equipmentQuery.data || equipmentQuery.data.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Wrench className="h-10 w-10 mb-3 opacity-40" />
                  <p className="font-medium">No equipment added yet.</p>
                  <p className="text-sm mt-1">Add equipment to track availability and bookings.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y">
                  {equipmentQuery.data.map(eq => {
                    const statusColor: Record<string, string> = {
                      available: "bg-green-100 text-green-700 border-green-200",
                      in_use: "bg-amber-100 text-amber-700 border-amber-200",
                      maintenance: "bg-red-100 text-red-700 border-red-200",
                      retired: "bg-gray-100 text-gray-500 border-gray-200",
                    };
                    const sc = statusColor[eq.status] ?? statusColor.available;
                    return (
                      <div key={eq.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: BLACK }}>
                          <Wrench className="h-4 w-4" style={{ color: GOLD }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{eq.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{eq.type.replace(/_/g, " ")}</p>
                        </div>
                        <Badge variant="outline" className={`text-xs shrink-0 ${sc}`}>
                          {eq.status.replace(/_/g, " ")}
                        </Badge>
                        {isOwnerOrForeman && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEquipDialog(eq)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteEquipMut.mutate(eq.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── NEW EVENT DIALOG ── */}
        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editEvtId ? "Edit Event" : "New Event"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium block mb-1">Title *</label>
                <Input placeholder="e.g. Site Safety Meeting" value={evtTitle} onChange={e => setEvtTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <Select value={evtType} onValueChange={setEvtType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["meeting", "equipment_booking", "site_visit", "inspection", "other"].map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Date *</label>
                <Input type="date" value={evtDate} onChange={e => setEvtDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Time *</label>
                  <Input type="time" value={evtStartTime} onChange={e => setEvtStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Time *</label>
                  <Input type="time" value={evtEndTime} onChange={e => setEvtEndTime(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Location (optional)</label>
                <Input placeholder="e.g. Site office, 123 Main St" value={evtLocation} onChange={e => setEvtLocation(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Notes (optional)</label>
                <CharCountedTextarea
                  placeholder="Additional details…"
                  value={evtNotes}
                  onChange={e => setEvtNotes(e.target.value.slice(0, NOTES_MAX))}
                  className="min-h-[60px]"
                  maxLength={NOTES_MAX}
                />
              </div>
              {evtType === "meeting" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium block">Online Meeting (optional)</label>
                  <Select value={evtMeetingPlatform || "none"} onValueChange={v => { setEvtMeetingPlatform(v === "none" ? "" : v); setEvtMeetingLink(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="No online meeting" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No online meeting</SelectItem>
                      <SelectItem value="google_meet">
                        <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-green-600" />Google Meet</span>
                      </SelectItem>
                      <SelectItem value="zoom">
                        <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-blue-600" />Zoom</span>
                      </SelectItem>
                      <SelectItem value="teams">
                        <span className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-purple-600" />Microsoft Teams</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {evtMeetingPlatform && (
                    <div>
                      <Input
                        placeholder="Paste meeting link (or leave blank to auto-generate)"
                        value={evtMeetingLink}
                        onChange={e => setEvtMeetingLink(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave blank to auto-generate when OAuth is configured for this platform.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Recipients</label>
                  <button
                    type="button"
                    onClick={pickContacts}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors"
                  >
                    <Users className="h-3 w-3" /> Pick from contacts
                  </button>
                </div>
                {/* Email chip input */}
                <div
                  className="min-h-[40px] flex flex-wrap gap-1.5 items-center p-2 rounded-md border border-input bg-background cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0"
                  onClick={e => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
                >
                  {evtRecipientEmails.map(email => (
                    <span key={email} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-[#111111]" style={{ background: GOLD }}>
                      {email}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setEvtRecipientEmails(prev => prev.filter(x => x !== email)); }}
                        className="hover:opacity-70 transition-opacity ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    placeholder={evtRecipientEmails.length === 0 ? "Type email and press Enter or comma…" : ""}
                    value={evtEmailInput}
                    onChange={e => setEvtEmailInput(e.target.value)}
                    onKeyDown={handleEvtEmailKeyDown}
                    onBlur={() => addEvtEmail(evtEmailInput)}
                    className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {evtRecipientEmails.length === 0
                    ? "Add at least one recipient to send an email invite."
                    : `Invite will be sent to ${evtRecipientEmails.length} recipient${evtRecipientEmails.length !== 1 ? "s" : ""}.`}
                </p>
              </div>
              {evtConflicts.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm text-destructive">
                    <p className="font-medium mb-1">Scheduling conflict detected</p>
                    {evtConflicts.map((c, i) => (
                      <p key={i} className="text-xs">{c.conflicts?.[0]?.title ?? "Conflict"} overlaps this time</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEventDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!evtTitle || !evtDate || !evtStartTime || !evtEndTime) return;
                  setEvtConflicts([]);
                  const payload = {
                    title: evtTitle,
                    type: evtType,
                    projectId: evtProjectId ? Number(evtProjectId) : undefined,
                    startTime: `${evtDate}T${evtStartTime}:00`,
                    endTime: `${evtDate}T${evtEndTime}:00`,
                    location: evtLocation || undefined,
                    notes: evtNotes || undefined,
                    meetingPlatform: evtMeetingPlatform || undefined,
                    meetingLink: evtMeetingLink || undefined,
                  };
                  if (editEvtId) {
                    updateEventMut.mutate({ id: editEvtId, ...payload });
                  } else {
                    createEventMut.mutate({
                      ...payload,
                      recipientEmails: evtRecipientEmails.length > 0 ? evtRecipientEmails : undefined,
                    });
                  }
                }}
                disabled={!evtTitle || !evtDate || !evtStartTime || !evtEndTime || createEventMut.isPending || updateEventMut.isPending || evtNotes.length >= NOTES_MAX}
              >
                {(createEventMut.isPending || updateEventMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editEvtId ? "Save Changes" : "Create Event"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── EQUIPMENT DIALOG ── */}
        <Dialog open={showEquipmentDialog} onOpenChange={setShowEquipmentDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editEquipId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium block mb-1">Name *</label>
                <Input placeholder="e.g. Excavator #2" value={eqName} onChange={e => setEqName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <Select value={eqType} onValueChange={setEqType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["excavator", "lift", "crane", "truck", "tools", "other"].map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <Select value={eqStatus} onValueChange={setEqStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "available", label: "Available" },
                      { value: "in_use", label: "In Use" },
                      { value: "maintenance", label: "Maintenance" },
                      { value: "retired", label: "Retired" },
                    ].map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Notes (optional)</label>
                <CharCountedTextarea
                  placeholder="e.g. Due for service in June"
                  value={eqNotes}
                  onChange={e => setEqNotes(e.target.value.slice(0, NOTES_MAX))}
                  className="min-h-[60px]"
                  maxLength={NOTES_MAX}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEquipmentDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!eqName) return;
                  const body = { name: eqName, type: eqType, status: eqStatus, notes: eqNotes || undefined };
                  if (editEquipId) {
                    updateEquipMut.mutate({ id: editEquipId, ...body });
                  } else {
                    createEquipMut.mutate(body);
                  }
                }}
                disabled={!eqName || createEquipMut.isPending || updateEquipMut.isPending || eqNotes.length >= NOTES_MAX}
              >
                {(createEquipMut.isPending || updateEquipMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editEquipId ? "Save Changes" : "Add Equipment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
