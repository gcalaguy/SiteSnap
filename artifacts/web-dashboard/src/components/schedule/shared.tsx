import { startOfWeek, addDays, addMonths } from "date-fns";

// ─── Colors ─────────────────────────────────────────────────────────────────
export const GOLD = "#C9A84C";
export const BLACK = "#111111";
export const NOTES_MAX = 1_000;

// ─── Types ──────────────────────────────────────────────────────────────────
export type Member = { id: number; firstName: string; lastName: string; role: string; email: string };
export type Subcontractor = {
  id: number; name: string; type: string; complianceStatus: string;
  coiExpiration: string | null; workersCompClearanceExpiration: string | null;
};
export type GProject = { id: number; name: string; status: string; startDate: string | null; endDate: string | null };
export type GAssignment = {
  id: number; projectId: number; userId: number | null;
  contactId: number | null;
  startDate: string; endDate: string; notes: string | null;
  projectName: string | null;
  userFirstName: string | null; userLastName: string | null; userRole: string | null;
  contactName: string | null; contactType: string | null; contactCompliance: string | null;
};
export type GanttData = { assignments: GAssignment[]; projects: GProject[]; members: Member[]; subcontractors: Subcontractor[] };
export type WeekData = {
  weekStart: string; weekEnd: string;
  assignments: GAssignment[]; members: Member[]; projects: GProject[]; subcontractors: Subcontractor[];
};
export type ViewMode = "gantt" | "team" | "events" | "equipment";
export type ZoomLevel = "2w" | "1m" | "3m";
export type ScheduleEvent = {
  id: number; companyId: number; projectId: number | null; type: string; title: string;
  startTime: string; endTime: string; location: string | null; notes: string | null;
  meetingPlatform: string | null; meetingLink: string | null;
  status: string; projectName: string | null; createdByFirstName: string | null; createdByLastName: string | null;
  assignees: Array<{ id: number; eventId: number; resourceType: string; resourceId: number }>;
};
export type Equipment = { id: number; companyId: number; name: string; type: string; status: string; notes: string | null; createdAt: string };

export interface ScheduleConflictItem {
  eventId: number;
  title: string;
  startTime: string;
  endTime: string;
}
export interface ScheduleConflictGroup {
  resource: { resourceType: "user" | "equipment"; resourceId: number };
  conflicts: ScheduleConflictItem[];
}

// ─── Constants ──────────────────────────────────────────────────────────────
export const USER_COLORS = [
  { bg: "#D4AF37", text: "#fff" }, { bg: "#3B82F6", text: "#fff" },
  { bg: "#10B981", text: "#fff" }, { bg: "#8B5CF6", text: "#fff" },
  { bg: "#F59E0B", text: "#1a1a1a" }, { bg: "#EF4444", text: "#fff" },
  { bg: "#06B6D4", text: "#fff" }, { bg: "#EC4899", text: "#fff" },
  { bg: "#14B8A6", text: "#fff" }, { bg: "#6366F1", text: "#fff" },
];
export const PROJECT_COLORS_BG = [
  "#D4AF37","#3B82F6","#10B981","#8B5CF6","#F59E0B",
  "#EF4444","#06B6D4","#EC4899","#14B8A6","#6366F1",
];
export const COL_WIDTH_PX: Record<ZoomLevel, number> = { "2w": 54, "1m": 38, "3m": 82 };
export const MS_DAY = 86_400_000;
export const BAR_H = 26;
export const BAR_GAP = 4;
export const ROW_PAD = 10;
export const LABEL_W = 224;

export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  planning:    { label: "Active",      cls: "bg-green-100 text-green-700 border-green-200" },
  in_progress: { label: "In Progress", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  completed:   { label: "Completed",   cls: "bg-green-100 text-green-700 border-green-200" },
  on_hold:     { label: "On Hold",     cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
export const getUserColor = (uid: number) => USER_COLORS[uid % USER_COLORS.length];
export const getProjectBg = (pid: number) => PROJECT_COLORS_BG[pid % PROJECT_COLORS_BG.length];
export const initials = (f: string, l: string) => `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();

export type TrackItem = { id: number; startMs: number; endMs: number };
export function assignTracks<T extends TrackItem>(items: T[]): Array<T & { track: number }> {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs);
  const ends: number[] = [];
  return sorted.map(item => {
    const t = ends.findIndex(e => e <= item.startMs);
    if (t === -1) { ends.push(item.endMs); return { ...item, track: ends.length - 1 }; }
    ends[t] = item.endMs;
    return { ...item, track: t };
  });
}

// ─── Gantt range ────────────────────────────────────────────────────────────
export function getGanttRange(ganttNav: Date, zoom: ZoomLevel): { start: Date; end: Date } {
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
}

