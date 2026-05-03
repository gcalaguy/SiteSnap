import { useState } from "react";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, X, Loader2, Users, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Member = { id: number; firstName: string; lastName: string; role: string; email: string };
type Project = { id: number; name: string; status: string };
type Assignment = {
  id: number;
  projectId: number;
  userId: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  projectName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
};

type ScheduleData = {
  weekStart: string;
  weekEnd: string;
  assignments: Assignment[];
  members: Member[];
  projects: Project[];
};

const PROJECT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
];

function getProjectColor(projectId: number) {
  return PROJECT_COLORS[projectId % PROJECT_COLORS.length];
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function weekDays(weekStart: string) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export default function Schedule() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 1 });
  });

  const [showDialog, setShowDialog] = useState(false);
  const [prefillUserId, setPrefillUserId] = useState<string>("");
  const [prefillProjectId, setPrefillProjectId] = useState<string>("");
  const [newUserId, setNewUserId] = useState<string>("");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>("");
  const [newEndDate, setNewEndDate] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");

  const weekOf = format(currentWeek, "yyyy-MM-dd");

  const { data, isLoading } = useQuery<ScheduleData>({
    queryKey: ["schedule", weekOf],
    queryFn: () => customFetch(`/api/schedule?weekOf=${weekOf}`),
  });

  const days = data ? weekDays(data.weekStart) : weekDays(weekOf);

  const createAssignment = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["project-schedule"] });
      setShowDialog(false);
      resetDialog();
      toast({ title: "Worker assigned to project" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to assign worker", variant: "destructive" }),
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["project-schedule"] });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to remove assignment", variant: "destructive" }),
  });

  function resetDialog() {
    setNewUserId(prefillUserId);
    setNewProjectId(prefillProjectId);
    setNewStartDate("");
    setNewEndDate("");
    setNewNotes("");
  }

  function openDialog(userId?: string, projectId?: string) {
    setPrefillUserId(userId ?? "");
    setPrefillProjectId(projectId ?? "");
    setNewUserId(userId ?? "");
    setNewProjectId(projectId ?? "");
    setNewStartDate(weekOf);
    setNewEndDate(format(addDays(currentWeek, 4), "yyyy-MM-dd"));
    setNewNotes("");
    setShowDialog(true);
  }

  function handleCreate() {
    if (!newUserId || !newProjectId || !newStartDate || !newEndDate) return;
    createAssignment.mutate({
      userId: Number(newUserId),
      projectId: Number(newProjectId),
      startDate: newStartDate,
      endDate: newEndDate,
      notes: newNotes || undefined,
    });
  }

  function getAssignmentsForCell(userId: number, day: Date) {
    if (!data) return [];
    const dayStr = format(day, "yyyy-MM-dd");
    return data.assignments.filter((a) => {
      if (a.userId !== userId) return false;
      return dayStr >= a.startDate && dayStr <= a.endDate;
    });
  }

  const prevWeek = () => setCurrentWeek((w) => addDays(w, -7));
  const nextWeek = () => setCurrentWeek((w) => addDays(w, 7));
  const goToday = () => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  if (!isOwnerOrForeman) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Schedule is for owners and foremans only.</p>
      </div>
    );
  }

  const members = data?.members ?? [];
  const projects = data?.projects ?? [];
  const assignments = data?.assignments ?? [];

  // Summary: unique workers scheduled this week
  const scheduledWorkerIds = new Set(assignments.map((a) => a.userId));
  const projectsThisWeek = new Set(assignments.map((a) => a.projectId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-muted-foreground">Weekly worker availability across all projects.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Assign Worker
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduledWorkerIds.size}</p>
                <p className="text-xs text-muted-foreground">Workers scheduled this week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{projectsThisWeek.size}</p>
                <p className="text-xs text-muted-foreground">Active projects this week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <CalendarDays className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{members.length - scheduledWorkerIds.size}</p>
                <p className="text-xs text-muted-foreground">Unscheduled team members</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Week navigator */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[200px]">
                <p className="font-semibold text-sm">
                  {data ? `${format(parseISO(data.weekStart), "MMM d")} – ${format(parseISO(data.weekEnd), "MMM d, yyyy")}` : "Loading…"}
                </p>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={goToday}>
                Today
              </Button>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 flex-wrap">
              {projects.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-sm ${getProjectColor(p.id)}`} />
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading schedule…
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">No team members yet.</p>
              <p className="text-sm mt-1">Invite workers from the Team page first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    {/* Worker column header */}
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide w-[180px] bg-muted/30 border-r">
                      Worker
                    </th>
                    {days.map((day) => {
                      const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      return (
                        <th
                          key={day.toISOString()}
                          className={`py-3 px-2 text-center border-r last:border-r-0 min-w-[110px] ${isToday ? "bg-primary/5" : "bg-muted/30"}`}
                        >
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">
                            {format(day, "EEE")}
                          </div>
                          <div className={`text-sm font-semibold mt-0.5 ${isToday ? "text-primary" : ""}`}>
                            {format(day, "MMM d")}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, idx) => (
                    <tr key={member.id} className={`border-b last:border-b-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                      {/* Worker info cell */}
                      <td className="py-2 px-3 border-r align-top">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                              {getInitials(member.firstName, member.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate leading-tight">
                              {member.firstName} {member.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                          </div>
                        </div>
                      </td>
                      {/* Day cells */}
                      {days.map((day) => {
                        const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                        const cellAssignments = getAssignmentsForCell(member.id, day);
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        return (
                          <td
                            key={day.toISOString()}
                            className={`py-1.5 px-1.5 border-r last:border-r-0 align-top min-h-[56px] ${isToday ? "bg-primary/5" : isWeekend ? "bg-muted/20" : ""}`}
                          >
                            <div className="space-y-1">
                              {cellAssignments.map((a) => (
                                <div
                                  key={a.id}
                                  className={`group relative flex items-center gap-1 rounded px-2 py-1 text-white text-xs font-medium ${getProjectColor(a.projectId)} cursor-default`}
                                  title={a.notes ? `${a.projectName}: ${a.notes}` : a.projectName ?? ""}
                                >
                                  <span className="truncate leading-tight">{a.projectName}</span>
                                  <button
                                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-white/20 rounded p-0.5"
                                    onClick={() => deleteAssignment.mutate(a.id)}
                                    title="Remove assignment"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ))}
                              <button
                                className="w-full h-5 rounded border border-dashed border-border/50 text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-100"
                                onClick={() => openDialog(String(member.id))}
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
          )}
        </CardContent>
      </Card>

      {/* Project legend with full names */}
      {projects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-sm shrink-0 ${getProjectColor(p.id)}`} />
                  <span className="text-sm">{p.name}</span>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize"
                  >
                    {p.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Worker Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Worker to Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Worker *</label>
              <Select value={newUserId} onValueChange={setNewUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px] bg-muted">
                            {getInitials(m.firstName, m.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        {m.firstName} {m.lastName}
                        <span className="text-xs text-muted-foreground capitalize ml-1">({m.role})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Project *</label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-sm shrink-0 ${getProjectColor(p.id)}`} />
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
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">End Date *</label>
                <Input
                  type="date"
                  value={newEndDate}
                  min={newStartDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Notes (optional)</label>
              <Textarea
                placeholder="e.g. Framing crew, 7am–3pm shift"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="min-h-[64px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newUserId || !newProjectId || !newStartDate || !newEndDate || createAssignment.isPending}
            >
              {createAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
