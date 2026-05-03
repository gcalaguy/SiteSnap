import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  customFetch, useGetMe, useListProjects, useListCompanyMembers,
  useListTimesheets, useApproveTimesheet, useDenyTimesheet,
} from "@workspace/api-client-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock, Users, Building2, TrendingUp, Trash2,
  ChevronDown, ChevronUp, CalendarRange, UserCheck, X,
  ClipboardCheck, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
} from "recharts";

type TimeEntry = {
  id: number;
  projectId: number;
  userId: number;
  date: string;
  hours: string;
  description?: string | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string; email: string; role: string } | null;
  project: { id: number; name: string } | null;
};

const RANGE_OPTIONS = [
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "All Time", value: "all" },
  { label: "Custom Range", value: "custom" },
];

function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null): string {
  if (!user) return "Unknown";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.email?.split("@")[0] || "Unknown";
}

function initials(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null): string {
  if (!user) return "?";
  if (user.firstName) return `${user.firstName[0]}${user.lastName?.[0] ?? ""}`.toUpperCase();
  return (user.email?.[0] ?? "?").toUpperCase();
}

function getRangeDates(range: string, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  switch (range) {
    case "this_week": return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    case "last_week": { const s = subWeeks(now, 1); return { from: format(startOfWeek(s, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(s, { weekStartsOn: 1 }), "yyyy-MM-dd") }; }
    case "this_month": return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
    case "last_month": { const s = subMonths(now, 1); return { from: format(startOfMonth(s), "yyyy-MM-dd"), to: format(endOfMonth(s), "yyyy-MM-dd") }; }
    case "custom": return { from: customFrom || undefined, to: customTo || undefined };
    default: return {};
  }
}

function formatRangeLabel(range: string, from?: string, to?: string): string {
  if (range === "custom") {
    if (from && to) return `${format(new Date(from + "T00:00:00"), "MMM d")} – ${format(new Date(to + "T00:00:00"), "MMM d, yyyy")}`;
    if (from) return `From ${format(new Date(from + "T00:00:00"), "MMM d, yyyy")}`;
    return "Custom Range";
  }
  return RANGE_OPTIONS.find(o => o.value === range)?.label ?? range;
}

export default function HoursPage() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: projects } = useListProjects();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: members } = useListCompanyMembers(me?.companyId ?? 0, {
    query: { enabled: !!me?.companyId } as any,
  });

  const [range, setRange] = useState("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  // Timesheet state
  const [tsStatusFilter, setTsStatusFilter] = useState<"all" | "submitted" | "approved" | "denied">("all");
  const [tsWorkerFilter, setTsWorkerFilter] = useState("all");
  const [denyingId, setDenyingId] = useState<number | null>(null);
  const [denyNotes, setDenyNotes] = useState("");

  const isCustom = range === "custom";
  const { from, to } = getRangeDates(range, customFrom, customTo);

  const params = new URLSearchParams();
  if (filterProject !== "all") params.set("projectId", filterProject);
  if (filterUser !== "all") params.set("userId", filterUser);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["time-entries", "company", filterProject, filterUser, from, to],
    queryFn: () => customFetch(`/api/time-entries?${params.toString()}`),
  });

  const deleteEntry = useMutation({
    mutationFn: ({ projectId, entryId }: { projectId: number; entryId: number }) =>
      customFetch(`/api/projects/${projectId}/time-entries/${entryId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ title: "Entry deleted" });
    },
    onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
  });

  // Timesheet hooks
  const tsParams: Record<string, string> = {};
  if (tsStatusFilter !== "all") tsParams.status = tsStatusFilter;
  if (tsWorkerFilter !== "all") tsParams.userId = tsWorkerFilter;
  const { data: timesheets = [], isLoading: tsLoading } = useListTimesheets(tsParams);

  const approveTs = useApproveTimesheet({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] }); toast({ title: "Timesheet approved" }); },
      onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
    },
  });
  const denyTs = useDenyTimesheet({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] }); setDenyingId(null); setDenyNotes(""); toast({ title: "Timesheet denied" }); },
      onError: () => toast({ title: "Failed to deny", variant: "destructive" }),
    },
  });

  const isPrivileged = me?.role === "owner" || me?.role === "foreman";

  const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.hours), 0);

  const byWorker = entries.reduce<Record<number, { user: TimeEntry["user"]; hours: number; entries: TimeEntry[] }>>((acc, e) => {
    const uid = e.userId;
    if (!acc[uid]) acc[uid] = { user: e.user, hours: 0, entries: [] };
    acc[uid].hours += parseFloat(e.hours);
    acc[uid].entries.push(e);
    return acc;
  }, {});

  const workerChartData = Object.values(byWorker)
    .sort((a, b) => b.hours - a.hours)
    .map(w => ({ name: displayName(w.user), hours: Math.round(w.hours * 10) / 10 }));

  const byProject = entries.reduce<Record<number, { name: string; hours: number }>>((acc, e) => {
    const pid = e.projectId;
    if (!acc[pid]) acc[pid] = { name: e.project?.name ?? `Project ${pid}`, hours: 0 };
    acc[pid].hours += parseFloat(e.hours);
    return acc;
  }, {});

  const projectChartData = Object.values(byProject)
    .sort((a, b) => b.hours - a.hours)
    .map(p => ({ name: p.name, hours: Math.round(p.hours * 10) / 10 }));

  const uniqueWorkers = Object.values(byWorker).length;

  const selectedWorker = filterUser !== "all" ? byWorker[parseInt(filterUser)] : null;
  const selectedMember = filterUser !== "all" ? members?.find(m => String(m.id) === filterUser) : null;

  const workerDailyData = selectedWorker
    ? Object.entries(
        selectedWorker.entries.reduce<Record<string, number>>((acc, e) => {
          acc[e.date] = (acc[e.date] ?? 0) + parseFloat(e.hours);
          return acc;
        }, {})
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, hours]) => ({
          date: format(new Date(date + "T00:00:00"), "MMM d"),
          hours: Math.round(hours * 10) / 10,
        }))
    : [];

  const workerProjectData = selectedWorker
    ? Object.entries(
        selectedWorker.entries.reduce<Record<string, number>>((acc, e) => {
          const name = e.project?.name ?? `Project ${e.projectId}`;
          acc[name] = (acc[name] ?? 0) + parseFloat(e.hours);
          return acc;
        }, {})
      )
        .sort(([, a], [, b]) => b - a)
        .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hours Tracker</h1>
        <p className="text-muted-foreground text-sm mt-1">Company-wide time entries across all projects</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Date range */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Period</Label>
          <Select value={range} onValueChange={(v) => { setRange(v); }}>
            <SelectTrigger className="w-[160px]">
              <CalendarRange className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Custom date inputs — shown only when Custom is selected */}
        {isCustom && (
          <div className="flex items-end gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">From</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[160px] h-9"
                max={customTo || undefined}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">To</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[160px] h-9"
                min={customFrom || undefined}
              />
            </div>
            {(customFrom || customTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => { setCustomFrom(""); setCustomTo(""); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Project filter */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Project</Label>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[190px]">
              <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Worker filter */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Worker</Label>
          <div className="flex items-center gap-1">
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className={`w-[190px] ${filterUser !== "all" ? "border-primary ring-1 ring-primary/30" : ""}`}>
                <UserCheck className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Workers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workers</SelectItem>
                {members?.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterUser !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setFilterUser("all")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Active filter summary pill */}
      {(filterUser !== "all" || filterProject !== "all" || isCustom) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Showing:</span>
          {filterUser !== "all" && selectedMember && (
            <Badge variant="secondary" className="gap-1">
              <UserCheck className="h-3 w-3" />
              {selectedMember.firstName} {selectedMember.lastName}
            </Badge>
          )}
          {filterProject !== "all" && (
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3 w-3" />
              {projects?.find(p => String(p.id) === filterProject)?.name}
            </Badge>
          )}
          {isCustom && (from || to) && (
            <Badge variant="secondary" className="gap-1">
              <CalendarRange className="h-3 w-3" />
              {formatRangeLabel(range, from, to)}
            </Badge>
          )}
          <button
            className="text-muted-foreground hover:text-destructive transition-colors ml-1"
            onClick={() => { setFilterUser("all"); setFilterProject("all"); setRange("this_week"); setCustomFrom(""); setCustomTo(""); }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── WORKER SPOTLIGHT ── shown when a specific worker is selected */}
      {selectedWorker && selectedMember ? (
        <div className="space-y-4">
          {/* Worker identity header */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4 flex-wrap">
                <Avatar className="h-14 w-14 bg-primary/15 border-2 border-primary/30">
                  <AvatarFallback className="text-lg font-bold bg-transparent text-primary">
                    {initials(selectedMember)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold">{displayName(selectedMember)}</h2>
                  <p className="text-sm text-muted-foreground capitalize">
                    {selectedMember.role} · {selectedMember.email}
                  </p>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{selectedWorker.hours.toFixed(1)}h</p>
                    <p className="text-xs text-muted-foreground">{formatRangeLabel(range, from, to)}</p>
                  </div>
                  <Separator orientation="vertical" className="h-10 self-center" />
                  <div>
                    <p className="text-2xl font-bold">{selectedWorker.entries.length}</p>
                    <p className="text-xs text-muted-foreground">entries</p>
                  </div>
                  <Separator orientation="vertical" className="h-10 self-center" />
                  <div>
                    <p className="text-2xl font-bold">{workerProjectData.length}</p>
                    <p className="text-xs text-muted-foreground">projects</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {selectedWorker.entries.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hours per day timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Daily Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  {workerDailyData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={workerDailyData} margin={{ left: 0, right: 8, top: 4, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} unit="h" />
                        <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                        <Line type="monotone" dataKey="hours" stroke="#FF6600" strokeWidth={2} dot={{ fill: "#FF6600", r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={workerDailyData} margin={{ left: 0, right: 8, top: 4, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="h" />
                        <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                        <Bar dataKey="hours" fill="#FF6600" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Hours by project */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Project</CardTitle>
                </CardHeader>
                <CardContent>
                  {workerProjectData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={workerProjectData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                        <Bar dataKey="hours" fill="#172034" radius={[0, 4, 4, 0]}>
                          {workerProjectData.map((_, i) => (
                            <Cell key={i} fill="#172034" opacity={1 - i * 0.15} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Individual entries for this worker */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Entries — {displayName(selectedMember)}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedWorker.entries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No entries in this period.</div>
              ) : (
                <div className="divide-y divide-border">
                  {[...selectedWorker.entries]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">
                              {format(new Date(entry.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                            </span>
                            <Badge variant="outline" className="text-xs py-0">{entry.project?.name ?? "Unknown project"}</Badge>
                            <span className="text-sm font-semibold text-primary">{parseFloat(entry.hours).toFixed(1)}h</span>
                          </div>
                          {entry.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                          )}
                        </div>
                        {(me?.role === "owner" || me?.role === "foreman") && (
                          <button
                            className="mt-0.5 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => deleteEntry.mutate({ projectId: entry.projectId, entryId: entry.id })}
                            title="Delete entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── ALL WORKERS VIEW ── */
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Hours</p>
                  <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="rounded-full bg-blue-500/10 p-3">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Workers Active</p>
                  <p className="text-2xl font-bold">{uniqueWorkers}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="rounded-full bg-green-500/10 p-3">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg / Worker</p>
                  <p className="text-2xl font-bold">
                    {uniqueWorkers > 0 ? (totalHours / uniqueWorkers).toFixed(1) : "0"}h
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          {entries.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Worker</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={workerChartData} margin={{ left: 0, right: 8, top: 4, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} unit="h" />
                      <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                      <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                        {workerChartData.map((_, i) => (
                          <Cell key={i} fill="#FF6600" opacity={1 - i * 0.1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={projectChartData} margin={{ left: 0, right: 8, top: 4, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} unit="h" />
                      <Tooltip formatter={(v: number) => [`${v}h`, "Hours"]} />
                      <Bar dataKey="hours" fill="#172034" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Per-worker breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Worker Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
              ) : Object.keys(byWorker).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No time entries for this period.</div>
              ) : (
                <div className="divide-y divide-border">
                  {Object.entries(byWorker).map(([uid, worker]) => {
                    const userId = parseInt(uid);
                    const isExpanded = expandedUser === userId;
                    return (
                      <div key={uid}>
                        <div className="flex items-center">
                          <button
                            className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                            onClick={() => setExpandedUser(isExpanded ? null : userId)}
                          >
                            <Avatar className="h-8 w-8 bg-primary/10 text-primary border border-primary/20">
                              <AvatarFallback className="text-xs font-bold bg-transparent">
                                {initials(worker.user)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{displayName(worker.user)}</p>
                              <p className="text-xs text-muted-foreground capitalize">{worker.user?.role} · {worker.entries.length} {worker.entries.length === 1 ? "entry" : "entries"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono">{worker.hours.toFixed(1)}h</Badge>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </button>
                          <button
                            className="px-3 py-3 text-xs text-primary hover:underline whitespace-nowrap"
                            onClick={() => setFilterUser(uid)}
                            title="View full report for this worker"
                          >
                            View report →
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="bg-muted/30 divide-y divide-border/50">
                            {worker.entries.map(entry => (
                              <div key={entry.id} className="flex items-start gap-3 px-6 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-muted-foreground">{format(new Date(entry.date + "T00:00:00"), "EEE, MMM d")}</span>
                                    <Badge variant="outline" className="text-xs py-0">{entry.project?.name ?? "Unknown project"}</Badge>
                                    <span className="text-sm font-semibold text-primary">{parseFloat(entry.hours).toFixed(1)}h</span>
                                  </div>
                                  {entry.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>}
                                </div>
                                {(me?.role === "owner" || me?.role === "foreman") && (
                                  <button
                                    className="mt-0.5 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={() => deleteEntry.mutate({ projectId: entry.projectId, entryId: entry.id })}
                                    title="Delete entry"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── TIMESHEETS SECTION ── */}
      <div className="mt-2">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Timesheets
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Weekly timesheet submissions requiring review</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Worker dropdown */}
            <Select value={tsWorkerFilter} onValueChange={(v) => { setTsWorkerFilter(v); setDenyingId(null); }}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="All Workers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workers</SelectItem>
                {members?.map((m) => {
                  const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email;
                  return (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Status pills */}
            <div className="flex items-center gap-1.5">
              {(["all", "submitted", "approved", "denied"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setTsStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    tsStatusFilter === s
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  {s !== "all" && (
                    <span className="ml-1.5 opacity-70">
                      ({timesheets.filter(t => t.status === s).length})
                    </span>
                  )}
                  {s === "all" && <span className="ml-1.5 opacity-70">({timesheets.length})</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {tsLoading ? (
              <div className="p-10 text-center text-muted-foreground text-sm">Loading timesheets…</div>
            ) : timesheets.length === 0 ? (
              <div className="p-10 text-center">
                <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  {tsStatusFilter === "submitted" ? "No pending timesheets to review." : "No timesheets found."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {timesheets.map((ts) => {
                  const weekEnd = addDays(new Date(ts.weekStart + "T00:00:00"), 6);
                  const weekLabel = `${format(new Date(ts.weekStart + "T00:00:00"), "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
                  const workerName = ts.user
                    ? `${ts.user.firstName ?? ""} ${ts.user.lastName ?? ""}`.trim() || ts.user.email
                    : "Unknown";
                  const workerInitials = ts.user?.firstName
                    ? `${ts.user.firstName[0]}${ts.user.lastName?.[0] ?? ""}`.toUpperCase()
                    : "?";
                  const reviewerName = ts.reviewer
                    ? `${ts.reviewer.firstName ?? ""} ${ts.reviewer.lastName ?? ""}`.trim() || ts.reviewer.email
                    : null;

                  const isDenying = denyingId === ts.id;

                  return (
                    <div key={ts.id} className="px-4 py-4">
                      <div className="flex items-start gap-3 flex-wrap">
                        {/* Worker avatar */}
                        <Avatar className="h-9 w-9 bg-primary/10 border border-primary/20 shrink-0 mt-0.5">
                          <AvatarFallback className="text-xs font-bold bg-transparent text-primary">
                            {workerInitials}
                          </AvatarFallback>
                        </Avatar>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{workerName}</span>
                            <span className="text-xs text-muted-foreground capitalize">{ts.user?.role}</span>
                            {ts.status === "submitted" && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
                                <AlertCircle className="h-3 w-3" /> Pending Review
                              </Badge>
                            )}
                            {ts.status === "approved" && (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Approved
                              </Badge>
                            )}
                            {ts.status === "denied" && (
                              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1">
                                <XCircle className="h-3 w-3" /> Denied
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarRange className="h-3 w-3" /> {weekLabel}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {parseFloat(ts.totalHours).toFixed(1)}h total
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Submitted {format(new Date(ts.submittedAt), "MMM d 'at' h:mm a")}
                            </span>
                          </div>
                          {ts.notes && !isDenying && (
                            <p className="text-xs text-muted-foreground mt-1.5 italic">
                              {ts.status === "denied" ? "Reason: " : ""}{ts.notes}
                            </p>
                          )}
                          {reviewerName && ts.status !== "submitted" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ts.status === "approved" ? "Approved" : "Denied"} by {reviewerName}
                              {ts.reviewedAt ? ` on ${format(new Date(ts.reviewedAt), "MMM d")}` : ""}
                            </p>
                          )}

                          {/* Deny notes input (inline) */}
                          {isDenying && (
                            <div className="mt-3 space-y-2">
                              <Textarea
                                placeholder="Reason for denial (optional)…"
                                value={denyNotes}
                                onChange={(e) => setDenyNotes(e.target.value)}
                                className="text-sm h-20 resize-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={denyTs.isPending}
                                  onClick={() => denyTs.mutate({ timesheetId: ts.id, data: { notes: denyNotes || undefined } })}
                                >
                                  {denyTs.isPending ? "Denying…" : "Confirm Denial"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setDenyingId(null); setDenyNotes(""); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action buttons (owner/foreman only, submitted timesheets) */}
                        {isPrivileged && ts.status === "submitted" && !isDenying && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
                              disabled={approveTs.isPending}
                              onClick={() => approveTs.mutate({ timesheetId: ts.id, data: {} })}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
                              onClick={() => { setDenyingId(ts.id); setDenyNotes(""); }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Deny
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
