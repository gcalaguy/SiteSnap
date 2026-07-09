import { useCallback, useMemo, useRef, useState } from "react";
import {
  format, addDays, parseISO, startOfDay, eachDayOfInterval, eachWeekOfInterval, isSameDay, isWeekend,
} from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Loader2, Plus, X } from "lucide-react";
import {
  type GanttData, type GAssignment, type ZoomLevel,
  COL_WIDTH_PX, MS_DAY, BAR_H, BAR_GAP, ROW_PAD, LABEL_W,
  STATUS_CONFIG, getUserColor, getProjectBg, initials, assignTracks, getGanttRange,
} from "@/components/schedule/shared";

interface GanttViewProps {
  data: GanttData | undefined;
  isLoading: boolean;
  zoom: ZoomLevel;
  ganttNav: Date;
  onOpenAssignDialog: (projectId?: string) => void;
  onDeleteAssignment: (id: number) => void;
  onPatchAssignment: (payload: { id: number; startDate: string; endDate: string }) => void;
}

type DragInfo = { id: number; kind: "move" | "resize"; startClientX: number; origStartMs: number; origEndMs: number };
type DragPreview = { id: number; leftPx: number; widthPx: number; startDate: string; endDate: string };

export function GanttView({ data, isLoading, zoom, ganttNav, onOpenAssignDialog, onDeleteAssignment, onPatchAssignment }: GanttViewProps) {
  const ganttRange = useMemo(() => getGanttRange(ganttNav, zoom), [ganttNav, zoom]);

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

  // ── Row data ──────────────────────────────────────────────────────────────
  const ganttProjects = data?.projects ?? [];
  const ganttAssignments = data?.assignments ?? [];
  const ganttMembers = data?.members ?? [];

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

  // ── Drag state ────────────────────────────────────────────────────────────
  const dragRef = useRef<DragInfo | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

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

    const newStartMs = dr.kind === "move" ? dr.origStartMs + deltaDays * MS_DAY : dr.origStartMs;
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
      onPatchAssignment({ id: dragPreview.id, startDate: dragPreview.startDate, endDate: dragPreview.endDate });
    }
    dragRef.current = null;
    setDragPreview(null);
    setIsDragActive(false);
  }

  return (
    <Card className="overflow-hidden shadow-none border-border/70 h-full">
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
                  style={{ height: rowH, contentVisibility: "auto", containIntrinsicSize: `0 ${rowH}px` }}
                  onClick={() => onOpenAssignDialog(String(project.id))}
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
                  <div key={project.id} className="border-b relative" style={{ height: rowH, contentVisibility: "auto", containIntrinsicSize: `0 ${rowH}px` }}>
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
                                onClick={() => onDeleteAssignment(bar.id)}
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
                        onClick={() => onOpenAssignDialog(String(project.id))}
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
  );
}
