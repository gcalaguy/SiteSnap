import { useMemo, useRef, useState, memo, type MutableRefObject } from "react";
import { format, addDays, parseISO, startOfDay, isSameDay, isWeekend } from "date-fns";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Plus, Users, X } from "lucide-react";
import { type WeekData, type Member, type GAssignment, MS_DAY, getUserColor, initials } from "@/components/schedule/shared";

type DragRef = MutableRefObject<{ id: number; fromDay: string; startDate: string; endDate: string } | null>;

interface MemberRowProps {
  member: Member;
  idx: number;
  teamWeekDays: Date[];
  assignments: GAssignment[];
  teamDragOver: string | null;
  setTeamDragOver: (key: string | null) => void;
  teamDragRef: DragRef;
  onDeleteAssignment: (id: number) => void;
  onOpenAssignDialog: () => void;
  onPatchAssignment: (payload: { id: number; startDate: string; endDate: string }) => void;
}

// This member's assignments are pre-filtered by the parent (assignmentsByMember),
// so per-cell filtering here only scans a handful of rows instead of the full
// company-wide assignments list on every render.
const MemberRow = memo(function MemberRow({
  member, idx, teamWeekDays, assignments, teamDragOver, setTeamDragOver, teamDragRef,
  onDeleteAssignment, onOpenAssignDialog, onPatchAssignment,
}: MemberRowProps) {
  function getCellAssignments(day: Date) {
    const dayStr = format(day, "yyyy-MM-dd");
    return assignments.filter(a => dayStr >= a.startDate && dayStr <= a.endDate);
  }

  return (
    <tr className={`border-b last:border-b-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
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
        const cellA = getCellAssignments(day);
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
              onPatchAssignment({
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
                          onClick={() => onDeleteAssignment(a.id)}
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
                onClick={onOpenAssignDialog}
                title="Add assignment"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
          </td>
        );
      })}
    </tr>
  );
});

interface TeamViewProps {
  data: WeekData | undefined;
  isLoading: boolean;
  teamWeek: Date;
  onOpenAssignDialog: () => void;
  onDeleteAssignment: (id: number) => void;
  onPatchAssignment: (payload: { id: number; startDate: string; endDate: string }) => void;
}

export function TeamView({ data, isLoading, teamWeek, onOpenAssignDialog, onDeleteAssignment, onPatchAssignment }: TeamViewProps) {
  const teamWeekDays = useMemo(() => {
    const start = data ? parseISO(data.weekStart) : teamWeek;
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [data, teamWeek]);

  // Grouped once per data fetch so each row only scans its own assignments
  // instead of filtering the full company-wide list on every render.
  const assignmentsByMember = useMemo(() => {
    const map = new Map<number, GAssignment[]>();
    for (const a of data?.assignments ?? []) {
      if (a.userId == null) continue;
      if (!map.has(a.userId)) map.set(a.userId, []);
      map.get(a.userId)!.push(a);
    }
    return map;
  }, [data]);

  // ── Drag state (Team grid) ────────────────────────────────────────────────
  const teamDragRef = useRef<{ id: number; fromDay: string; startDate: string; endDate: string } | null>(null);
  const [teamDragOver, setTeamDragOver] = useState<string | null>(null);

  const teamProjects = data?.projects ?? [];

  return (
    <Card>
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading schedule…
        </div>
      ) : (data?.members ?? []).length === 0 ? (
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
                {(data?.members ?? []).map((member, idx) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    idx={idx}
                    teamWeekDays={teamWeekDays}
                    assignments={assignmentsByMember.get(member.id) ?? []}
                    teamDragOver={teamDragOver}
                    setTeamDragOver={setTeamDragOver}
                    teamDragRef={teamDragRef}
                    onDeleteAssignment={onDeleteAssignment}
                    onOpenAssignDialog={onOpenAssignDialog}
                    onPatchAssignment={onPatchAssignment}
                  />
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
  );
}
