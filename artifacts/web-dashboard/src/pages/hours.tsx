import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMe, useListProjects, useListCompanyMembers } from "@workspace/api-client-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, Users, Building2, TrendingUp, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
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

function getRangeDates(range: string): { from?: string; to?: string } {
  const now = new Date();
  switch (range) {
    case "this_week": return { from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    case "last_week": { const s = subWeeks(now, 1); return { from: format(startOfWeek(s, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(s, { weekStartsOn: 1 }), "yyyy-MM-dd") }; }
    case "this_month": return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
    case "last_month": { const s = subMonths(now, 1); return { from: format(startOfMonth(s), "yyyy-MM-dd"), to: format(endOfMonth(s), "yyyy-MM-dd") }; }
    default: return {};
  }
}

export default function HoursPage() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: projects } = useListProjects();
  const { data: members } = useListCompanyMembers();

  const [range, setRange] = useState("this_week");
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const { from, to } = getRangeDates(range);

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

  // Aggregate totals
  const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.hours), 0);

  // Hours by worker (for chart + grouped list)
  const byWorker = entries.reduce<Record<number, { user: TimeEntry["user"]; hours: number; entries: TimeEntry[] }>>((acc, e) => {
    const uid = e.userId;
    if (!acc[uid]) acc[uid] = { user: e.user, hours: 0, entries: [] };
    acc[uid].hours += parseFloat(e.hours);
    acc[uid].entries.push(e);
    return acc;
  }, {});

  const workerChartData = Object.values(byWorker)
    .sort((a, b) => b.hours - a.hours)
    .map(w => ({
      name: displayName(w.user),
      hours: Math.round(w.hours * 10) / 10,
    }));

  // Hours by project
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hours Tracker</h1>
        <p className="text-muted-foreground text-sm mt-1">Company-wide time entries across all projects</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Workers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workers</SelectItem>
            {members?.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.firstName} {m.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
                {uniqueWorkers > 0 ? (totalHours / uniqueWorkers).toFixed(1) : "0"}
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
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setExpandedUser(isExpanded ? null : userId)}
                    >
                      <Avatar className="h-8 w-8 bg-primary/10 text-primary border border-primary/20">
                        <AvatarFallback className="text-xs font-bold bg-transparent">
                          {initials(worker.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {displayName(worker.user)}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{worker.user?.role} · {worker.entries.length} {worker.entries.length === 1 ? "entry" : "entries"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">{worker.hours.toFixed(1)}h</Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
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
    </div>
  );
}
