import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetProject, 
  useGetProjectSummary, 
  useListDailyReports, 
  useListCostAnalyses, 
  useListRFIs,
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useGetMe,
  useListCompanyMembers,
  useListProjectMembers,
  useAddProjectMember,
  useRemoveProjectMember,
  getListProjectMembersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { format, addDays } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import DocumentsTab from "@/components/DocumentsTab";
import QuotesTab from "@/components/QuotesTab";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, ChevronLeft, ChevronDown, ChevronUp, MapPin, Calendar, DollarSign, FileText, AlertTriangle, CheckSquare, MoreVertical, Trash2, Circle, Loader2, FolderOpen, User, Users, X, CalendarDays, UserPlus, UserMinus, Share2, Copy, Check, ExternalLink, Thermometer, Cloud, Wrench, Package, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Task = {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  assignedToUserId?: number | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
  createdAt: string;
};

type Member = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

function getInitials(m: Member) {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  if (first || last) return `${first}${last}`.toUpperCase();
  return (m.email?.[0] ?? "?").toUpperCase();
}
function getMemberName(m: Member) {
  const full = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  if (full) return full;
  return m.email ?? m.role;
}

function TaskCard({ task, onStatusChange, onDelete, assigneeName }: {
  task: Task;
  onStatusChange: (id: number, status: Task["status"]) => void;
  onDelete: (id: number) => void;
  assigneeName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const priorityColors: Record<string, string> = {
    low: "bg-slate-100 text-foreground border-border",
    medium: "bg-amber-950/30 text-amber-400 border-amber-900/50",
    high: "bg-red-950/30 text-red-400 border-red-900/50",
  };
  const statusNext: Record<Task["status"], { label: string; next: Task["status"]; icon: React.ReactNode }[]> = {
    todo: [{ label: "Start", next: "in_progress", icon: <Loader2 className="h-3 w-3" /> }],
    in_progress: [{ label: "Mark Done", next: "done", icon: <CheckSquare className="h-3 w-3" /> }],
    done: [{ label: "Reopen", next: "todo", icon: <Circle className="h-3 w-3" /> }],
  };

  return (
    <div
      className="bg-card border rounded-lg p-3 shadow-sm hover:border-primary/40 transition-colors group cursor-pointer select-none"
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium text-sm leading-snug flex-1">{task.title}</p>
        <div className="flex items-center gap-1 shrink-0">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {task.status !== "todo" && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, "todo"); }}>
                  <Circle className="mr-2 h-3 w-3" /> Mark To Do
                </DropdownMenuItem>
              )}
              {task.status !== "in_progress" && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, "in_progress"); }}>
                  <Loader2 className="mr-2 h-3 w-3" /> Mark In Progress
                </DropdownMenuItem>
              )}
              {task.status !== "done" && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, "done"); }}>
                  <CheckSquare className="mr-2 h-3 w-3" /> Mark Done
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
                <Trash2 className="mr-2 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {task.description && (
        <p className={`text-xs text-muted-foreground mb-2 ${expanded ? "" : "line-clamp-2"}`}>
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-muted-foreground">Due {format(new Date(task.dueDate), "MMM d")}</span>
        )}
        {assigneeName && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
            <User className="h-3 w-3" />
            {assigneeName}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {statusNext[task.status].map(({ label, next, icon }) => (
            <Button
              key={next}
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, next); }}
            >
              {icon} {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 ml-auto"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function TasksTab({ projectId, selectedWorkerId, members }: {
  projectId: number;
  selectedWorkerId: number | null;
  members: Member[];
}) {
  const { toast } = useToast();
  const { data: allTasks = [], isLoading } = useListTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [showDialog, setShowDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState<string>(
    selectedWorkerId ? String(selectedWorkerId) : "unassigned"
  );

  const tasks = selectedWorkerId
    ? (allTasks as Task[]).filter((t) => t.assignedToUserId === selectedWorkerId)
    : (allTasks as Task[]);

  const columns: { key: Task["status"]; label: string; color: string }[] = [
    { key: "todo", label: "To Do", color: "bg-muted/30 border-border" },
    { key: "in_progress", label: "In Progress", color: "bg-amber-950/20 border-amber-900/40" },
    { key: "done", label: "Done", color: "bg-green-950/20 border-green-900/40" },
  ];

  const byStatus = (status: Task["status"]) =>
    tasks.filter((t) => t.status === status);

  function getMemberNameById(id?: number | null) {
    if (!id) return undefined;
    const m = members.find((m) => m.id === id);
    return m ? getMemberName(m) : undefined;
  }

  function handleOpenDialog() {
    setNewAssigneeId(selectedWorkerId ? String(selectedWorkerId) : "unassigned");
    setShowDialog(true);
  }

  function handleCreate() {
    if (!newTitle.trim()) return;
    const assignedToUserId = newAssigneeId && newAssigneeId !== "unassigned"
      ? Number(newAssigneeId)
      : undefined;
    createTask.mutate(
      {
        projectId,
        data: {
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          priority: newPriority,
          dueDate: newDueDate || undefined,
          assignedToUserId,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
          setShowDialog(false);
          setNewTitle("");
          setNewDesc("");
          setNewPriority("medium");
          setNewDueDate("");
          setNewAssigneeId("unassigned");
          toast({ title: "Task created" });
        },
        onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
      },
    );
  }

  function handleStatusChange(taskId: number, status: Task["status"]) {
    updateTask.mutate(
      { projectId, taskId, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
        },
      },
    );
  }

  function handleDelete(taskId: number) {
    deleteTask.mutate(
      { projectId, taskId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
          toast({ title: "Task deleted" });
        },
      },
    );
  }

  const workerName = selectedWorkerId ? getMemberNameById(selectedWorkerId) : null;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xl font-bold">Tasks</h3>
          {workerName && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Showing tasks assigned to <span className="font-medium text-foreground">{workerName}</span>
            </p>
          )}
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-muted-foreground animate-pulse">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">
            {selectedWorkerId ? `No tasks assigned to ${workerName}` : "No tasks yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedWorkerId
              ? "Add a task and assign it to this worker."
              : "Add tasks to track work items for this project."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => {
            const colTasks = byStatus(col.key);
            return (
              <div key={col.key} className={`rounded-lg border p-3 ${col.color}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">{col.label}</h4>
                  <span className="text-xs bg-muted border-border border rounded-full px-2 py-0.5 font-medium">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      assigneeName={!selectedWorkerId ? getMemberNameById(task.assignedToUserId) : undefined}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Title *</label>
              <Input
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Description</label>
              <Textarea
                placeholder="Optional description"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Priority</label>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as typeof newPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Due Date</label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
            </div>
            {members.length > 0 && (
              <div>
                <label className="text-sm font-medium block mb-1">Assign To</label>
                <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select worker..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="flex items-center gap-2">
                          {getMemberName(m)}
                          <span className="text-xs text-muted-foreground capitalize">({m.role})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createTask.isPending}
            >
              {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ProjectAssignment = {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
  userEmail: string | null;
};

export default function ProjectDetail() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  // Assign worker dialog state
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [assignStartDate, setAssignStartDate] = useState<string>("");
  const [assignEndDate, setAssignEndDate] = useState<string>("");
  const [assignNotes, setAssignNotes] = useState<string>("");

  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState<string>("");

  // Client portal share state
  const [showPortalDialog, setShowPortalDialog] = useState(false);
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [expandedCostId, setExpandedCostId] = useState<number | null>(null);
  const [expandedRfiId, setExpandedRfiId] = useState<number | null>(null);

  const { data: me } = useGetMe();
  const companyId = me?.company?.id;
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: members = [], isLoading: membersLoading } = useListCompanyMembers(
    companyId ?? 0,
    { query: { enabled: !!companyId } as any }
  ) as { data: Member[]; isLoading: boolean };

  // Project-level member assignments (controls which workers can see this project)
  const { data: projectMembers = [] } = useListProjectMembers(projectId);
  const assignedIds = new Set((projectMembers as any[]).map((m: any) => m.id));
  const unassignedMembers = members.filter((m) => !assignedIds.has(m.id));

  const addProjectMember = useAddProjectMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(projectId) });
        setShowAddMemberDialog(false);
        setAddMemberUserId("");
        toast({ title: "Worker added to project" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to add worker", variant: "destructive" }),
    },
  });

  const removeProjectMember = useRemoveProjectMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(projectId) });
        toast({ title: "Worker removed from project" });
      },
      onError: (err: any) => toast({ title: err?.message ?? "Failed to remove worker", variant: "destructive" }),
    },
  });

  const { data: projectAssignments = [], refetch: refetchAssignments } = useQuery<ProjectAssignment[]>({
    queryKey: ["project-schedule", projectId],
    queryFn: () => customFetch(`/api/projects/${projectId}/schedule`),
    enabled: isOwnerOrForeman,
  });

  const createAssignment = useMutation({
    mutationFn: (body: object) => customFetch("/api/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      refetchAssignments();
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setShowAssignDialog(false);
      setAssignUserId(""); setAssignStartDate(""); setAssignEndDate(""); setAssignNotes("");
      toast({ title: "Worker scheduled on project" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to assign", variant: "destructive" }),
  });

  const removeAssignment = useMutation({
    mutationFn: (id: number) => customFetch(`/api/schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refetchAssignments();
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  function openAssignDialog(prefillUserId?: number) {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = addDays(new Date(), 5).toISOString().split("T")[0];
    setAssignUserId(prefillUserId ? String(prefillUserId) : "");
    setAssignStartDate(today);
    setAssignEndDate(nextWeek);
    setAssignNotes("");
    setShowAssignDialog(true);
  }

  async function openPortalDialog() {
    setShowPortalDialog(true);
    if (portalToken) return;
    setPortalLoading(true);
    try {
      const res = await customFetch(`/api/projects/${projectId}/portal/token`, {
        method: "POST",
      });
      setPortalToken((res as any).token);
    } catch {
      toast({ title: "Failed to generate portal link", variant: "destructive" });
      setShowPortalDialog(false);
    } finally {
      setPortalLoading(false);
    }
  }

  function copyPortalLink() {
    if (!portalToken) return;
    const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/portal/${portalToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const { data: project, isLoading: projectLoading } = useGetProject(projectId);
  const { data: summary } = useGetProjectSummary(projectId);
  const { data: reports } = useListDailyReports(projectId);
  const { data: costAnalyses } = useListCostAnalyses(projectId);
  const { data: rfis } = useListRFIs(projectId);

  const selectedMember = selectedWorkerId ? members.find((m) => m.id === selectedWorkerId) : null;

  const filteredReports = selectedWorkerId
    ? (reports ?? []).filter((r: any) => r.submittedByUserId === selectedWorkerId)
    : (reports ?? []);

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case "active": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "planning": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "on_hold": return <Badge variant="outline" className="text-orange-600 border-orange-600">On Hold</Badge>;
      case "completed": return <Badge variant="default" className="bg-blue-600">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>;
      case "high": return <Badge variant="default" className="bg-orange-600">High</Badge>;
      case "medium": return <Badge variant="secondary">Medium</Badge>;
      case "low": return <Badge variant="outline">Low</Badge>;
      default: return <Badge variant="outline">{priority}</Badge>;
    }
  };

  if (projectLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading project...</div>;
  if (!project) return <div className="p-8 text-center">Project not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/projects")} className="mt-1 shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {project.address}, {project.city}, {project.province}</span>
            {project.startDate && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Started: {format(new Date(project.startDate), "MMM d, yyyy")}</span>}
          </div>
        </div>

        {isOwnerOrForeman && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={openPortalDialog}
          >
            <Share2 className="h-4 w-4" />
            Share Client Portal
          </Button>
        )}

        {isOwnerOrForeman && members.length > 0 && (
          <div className="shrink-0 flex items-center gap-2">
            <div className="flex flex-col items-end gap-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">View as</label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={selectedWorkerId ? String(selectedWorkerId) : "all"}
                  onValueChange={(v) => setSelectedWorkerId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-[200px] h-9">
                    {selectedMember ? (
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {getInitials(selectedMember)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{getMemberName(selectedMember)}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" /> All Workers
                      </span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> All Workers
                      </span>
                    </SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px] bg-muted">
                              {getInitials(m)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{getMemberName(m)}</span>
                          <span className="text-xs text-muted-foreground capitalize ml-auto">({m.role})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWorkerId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedWorkerId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedMember && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
              {getInitials(selectedMember)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">
              Viewing as <span className="text-primary">{getMemberName(selectedMember)}</span>
              <Badge variant="outline" className="ml-2 capitalize text-xs">{selectedMember.role}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">Tasks and reports filtered to this worker's activity.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground hover:text-foreground h-7 px-2"
            onClick={() => setSelectedWorkerId(null)}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-max min-w-full h-10">
            <TabsTrigger value="overview" className="px-4 whitespace-nowrap">Overview</TabsTrigger>
            <TabsTrigger value="tasks" className="px-4 whitespace-nowrap">Tasks</TabsTrigger>
            <TabsTrigger value="reports" className="px-4 whitespace-nowrap">Daily Reports</TabsTrigger>
            <TabsTrigger value="cost" className="px-4 whitespace-nowrap">Cost Analysis</TabsTrigger>
            <TabsTrigger value="rfis" className="px-4 whitespace-nowrap">RFIs</TabsTrigger>
            <TabsTrigger value="quotes" className="px-4 whitespace-nowrap flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />Quotes
            </TabsTrigger>
            <TabsTrigger value="team" className="px-4 whitespace-nowrap flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />Team
            </TabsTrigger>
            <TabsTrigger value="documents" className="px-4 whitespace-nowrap flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />Documents
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${summary?.totalBudget?.toLocaleString() || "0"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                <DollarSign className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${summary?.totalSpent?.toLocaleString() || "0"}</div>
                {summary?.budgetUtilizationPercent && (
                  <p className="text-xs text-muted-foreground">{summary.budgetUtilizationPercent.toFixed(1)}% utilized</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {selectedMember ? `${selectedMember.firstName}'s Reports` : "Daily Reports"}
                </CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredReports.length}</div>
                {filteredReports.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Last: {format(new Date((filteredReports[0] as any).reportDate), "MMM d")}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open RFIs</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.openRFICount || 0}</div>
                <p className="text-xs text-muted-foreground">{summary?.closedRFICount || 0} closed</p>
              </CardContent>
            </Card>
          </div>

          {/* Task Overview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4 text-primary" />
                Task Overview
              </CardTitle>
              <span className="text-sm text-muted-foreground font-normal">
                {(summary as any)?.taskTotal ?? 0} total
              </span>
            </CardHeader>
            <CardContent>
              {!(summary as any)?.taskTotal ? (
                <p className="text-sm text-muted-foreground">No tasks yet — go to the Tasks tab to add some.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg border border-border bg-muted/30 py-3 px-2">
                    <p className="text-2xl font-bold text-foreground">{(summary as any)?.taskTodoCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">To Do</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 py-3 px-2">
                    <p className="text-2xl font-bold text-amber-700">{(summary as any)?.taskInProgressCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50/50 py-3 px-2">
                    <p className="text-2xl font-bold text-green-700">{(summary as any)?.taskDoneCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Done</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle>Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{project.description}</p>
              </CardContent>
            </Card>
          )}

          {isOwnerOrForeman && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Assigned Workers
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Workers currently scheduled on this project.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openAssignDialog()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Schedule Worker
                </Button>
              </CardHeader>
              <CardContent>
                {projectAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed rounded-lg">
                    <Users className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">No workers scheduled yet</p>
                    <p className="text-xs mt-1">Click "Schedule Worker" to assign a team member.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectAssignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                              {`${a.userFirstName?.[0] ?? ""}${a.userLastName?.[0] ?? ""}`.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {a.userFirstName} {a.userLastName}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {a.userRole} · {format(new Date(a.startDate), "MMM d")} – {format(new Date(a.endDate), "MMM d, yyyy")}
                            </p>
                            {a.notes && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{a.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAssignment.mutate(a.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <TasksTab
            projectId={projectId}
            selectedWorkerId={selectedWorkerId}
            members={members}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xl font-bold">Daily Reports</h3>
              {selectedMember && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Showing reports submitted by <span className="font-medium text-foreground">{getMemberName(selectedMember)}</span>
                </p>
              )}
            </div>
            <Button onClick={() => setLocation(`/projects/${projectId}/reports/new`)}>
              <Plus className="mr-2 h-4 w-4" /> New Report
            </Button>
          </div>
          {filteredReports.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>{selectedMember ? `No reports submitted by ${getMemberName(selectedMember)}.` : "No daily reports yet."}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredReports.map((report: any) => {
                const photos: any[] = report.photos ?? [];
                const isExpanded = expandedReportId === report.id;
                return (
                  <Card
                    key={report.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                    onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                  >
                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-lg">{format(new Date(report.reportDate), "MMM d, yyyy")}</span>
                        <div className="flex items-center gap-2">
                          {report.crewCount != null && <Badge variant="outline">Crew: {report.crewCount}</Badge>}
                          {photos.length > 0 && (
                            <Badge variant="secondary" className="gap-1">
                              <span>📷</span> {photos.length}
                            </Badge>
                          )}
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {!selectedMember && report.submittedBy && (
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {report.submittedBy.firstName} {report.submittedBy.lastName}
                        </p>
                      )}

                      {/* Work performed — truncated when collapsed */}
                      <p className={`text-sm text-muted-foreground mt-1 ${isExpanded ? "" : "line-clamp-2"}`}>
                        {report.workPerformed}
                      </p>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-4 space-y-3 border-t border-border pt-3">
                          {/* Weather row */}
                          {(report.weather || report.temperature) && (
                            <div className="flex flex-wrap gap-3 text-sm">
                              {report.weather && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Cloud className="h-3.5 w-3.5" /> {report.weather}
                                </span>
                              )}
                              {report.temperature && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Thermometer className="h-3.5 w-3.5" /> {report.temperature}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Materials */}
                          {report.materialsUsed && (
                            <div>
                              <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-0.5">
                                <Package className="h-3.5 w-3.5" /> Materials Used
                              </p>
                              <p className="text-sm text-muted-foreground">{report.materialsUsed}</p>
                            </div>
                          )}

                          {/* Equipment */}
                          {report.equipment && (
                            <div>
                              <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-0.5">
                                <Wrench className="h-3.5 w-3.5" /> Equipment
                              </p>
                              <p className="text-sm text-muted-foreground">{report.equipment}</p>
                            </div>
                          )}

                          {/* Issues */}
                          {report.issues && (
                            <div className="bg-amber-950/30 border border-amber-900/50 rounded-md p-3">
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 mb-0.5">
                                <TriangleAlert className="h-3.5 w-3.5" /> Issues / Delays
                              </p>
                              <p className="text-sm text-amber-800 dark:text-amber-300">{report.issues}</p>
                            </div>
                          )}

                          {/* Photos */}
                          {photos.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-2">Site Photos</p>
                              <div className="flex flex-wrap gap-2">
                                {photos.map((photo: any) => {
                                  const src = photo.objectPath.replace(/^\/objects\//, "/api/storage/objects/");
                                  return (
                                    <a
                                      key={photo.id}
                                      href={src}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <img
                                        src={src}
                                        alt={photo.caption ?? "Site photo"}
                                        className="h-24 w-24 object-cover rounded-md border border-border hover:opacity-80 transition-opacity"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                      />
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* AI Summary */}
                          {report.aiSummary && (
                            <div className="bg-muted/30 p-3 rounded border border-border/50">
                              <p className="text-xs font-semibold mb-1">AI Summary</p>
                              <p className="text-sm text-muted-foreground">{report.aiSummary}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Collapsed photo strip + AI summary hint */}
                      {!isExpanded && (
                        <>
                          {photos.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {photos.slice(0, 3).map((photo: any) => {
                                const src = photo.objectPath.replace(/^\/objects\//, "/api/storage/objects/");
                                return (
                                  <img
                                    key={photo.id}
                                    src={src}
                                    alt={photo.caption ?? "Site photo"}
                                    className="h-16 w-16 object-cover rounded-md border border-border opacity-80"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                );
                              })}
                              {photos.length > 3 && (
                                <div className="h-16 w-16 rounded-md border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">
                                  +{photos.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                          {report.aiSummary && (
                            <div className="mt-3 text-xs bg-muted/30 p-2 rounded border border-border/50">
                              <span className="font-semibold block mb-1">AI Summary:</span>
                              <span className="line-clamp-2 text-muted-foreground">{report.aiSummary}</span>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cost" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Cost Analysis</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/cost/new`)}>
              <Plus className="mr-2 h-4 w-4" /> Add Cost Record
            </Button>
          </div>
          {costAnalyses && costAnalyses.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Spend by Period</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={costAnalyses.map((c) => ({
                      name: c.periodLabel,
                      Labour: Number(c.labourCost),
                      Materials: Number(c.materialsCost),
                      Equipment: Number(c.equipmentCost),
                      Other: Number(c.otherCost),
                    }))}
                    margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
                    <Legend />
                    <Bar dataKey="Labour" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Materials" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="Equipment" stackId="a" fill="#D4AF37" />
                    <Bar dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {costAnalyses?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No cost records yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {costAnalyses?.map(cost => {
                const isCostExpanded = expandedCostId === cost.id;
                return (
                  <Card
                    key={cost.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                    onClick={() => setExpandedCostId(isCostExpanded ? null : cost.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">{cost.periodLabel}</CardTitle>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-destructive">${cost.totalCost.toLocaleString()}</span>
                          {isCostExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </CardHeader>
                    {isCostExpanded && (
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2 border-t pt-4">
                          <div><span className="text-muted-foreground block text-xs">Labour</span><span className="font-medium">${cost.labourCost.toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground block text-xs">Materials</span><span className="font-medium">${cost.materialsCost.toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground block text-xs">Equipment</span><span className="font-medium">${cost.equipmentCost.toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground block text-xs">Other</span><span className="font-medium">${cost.otherCost.toLocaleString()}</span></div>
                        </div>
                        {cost.aiAnalysis && (
                          <div className="mt-4 text-sm bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded border border-blue-200 dark:border-blue-800">
                            <span className="font-semibold block mb-1 text-blue-700 dark:text-blue-400">AI Insight:</span>
                            <span className="text-muted-foreground whitespace-pre-wrap">{cost.aiAnalysis}</span>
                          </div>
                        )}
                      </CardContent>
                    )}
                    {!isCostExpanded && (
                      <CardContent className="pb-3 pt-0">
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>Labour: <span className="font-medium text-foreground">${cost.labourCost.toLocaleString()}</span></span>
                          <span>Materials: <span className="font-medium text-foreground">${cost.materialsCost.toLocaleString()}</span></span>
                          <span>Equipment: <span className="font-medium text-foreground">${cost.equipmentCost.toLocaleString()}</span></span>
                          <span>Other: <span className="font-medium text-foreground">${cost.otherCost.toLocaleString()}</span></span>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rfis" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">RFIs</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/rfis/new`)}>
              <Plus className="mr-2 h-4 w-4" /> Create RFI
            </Button>
          </div>
          {rfis?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No RFIs generated.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rfis?.map(rfi => {
                const isRfiExpanded = expandedRfiId === rfi.id;
                return (
                  <Card
                    key={rfi.id}
                    className="hover:border-primary/50 transition-colors cursor-pointer select-none"
                    onClick={() => setExpandedRfiId(isRfiExpanded ? null : rfi.id)}
                  >
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-muted-foreground shrink-0">{rfi.rfiNumber}</span>
                            <h4 className="font-bold text-base">{rfi.subject}</h4>
                          </div>
                          <p className={`text-sm text-muted-foreground ${isRfiExpanded ? "" : "line-clamp-1"}`}>{rfi.description}</p>
                          {rfi.dueDate && <p className="text-xs text-muted-foreground mt-1.5">Due: {format(new Date(rfi.dueDate), "MMM d, yyyy")}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={rfi.status === 'open' || rfi.status === 'in_review' ? 'default' : 'secondary'} className={rfi.status === 'open' ? 'bg-orange-600' : ''}>
                              {rfi.status.replace("_", " ").toUpperCase()}
                            </Badge>
                            {isRfiExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          {getPriorityBadge(rfi.priority)}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isRfiExpanded && (
                        <div className="mt-4 space-y-3 border-t border-border pt-3">
                          {rfi.response && (
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-1">Response</p>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfi.response}</p>
                            </div>
                          )}
                          {rfi.aiDraftResponse && (
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                                <span>✦</span> AI Draft Response
                              </p>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfi.aiDraftResponse}</p>
                            </div>
                          )}
                          {rfi.closedAt && (
                            <p className="text-xs text-muted-foreground">Closed: {format(new Date(rfi.closedAt), "MMM d, yyyy")}</p>
                          )}
                          {!rfi.response && !rfi.aiDraftResponse && (
                            <p className="text-sm text-muted-foreground italic">No response recorded yet.</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xl font-bold">Project Team</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Workers assigned here can see and access this project.
              </p>
            </div>
            {isOwnerOrForeman && (
              <Button onClick={() => { setAddMemberUserId(""); setShowAddMemberDialog(true); }}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign Worker
              </Button>
            )}
          </div>

          {(projectMembers as any[]).length === 0 ? (
            <div className="text-center p-12 border rounded-md bg-card">
              <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No workers assigned yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isOwnerOrForeman
                  ? "Assign workers to give them access to this project."
                  : "No team members have been assigned to this project."}
              </p>
              {isOwnerOrForeman && (
                <Button className="mt-4" onClick={() => { setAddMemberUserId(""); setShowAddMemberDialog(true); }}>
                  <UserPlus className="mr-2 h-4 w-4" /> Assign First Worker
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {(projectMembers as any[]).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-4 border rounded-md bg-card">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {getInitials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{getMemberName(m)}</p>
                      <p className="text-sm text-muted-foreground">{m.email}</p>
                    </div>
                    <Badge variant="outline" className="capitalize ml-2">{m.role}</Badge>
                  </div>
                  {isOwnerOrForeman && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeProjectMember.mutate({ projectId, memberId: m.id })}
                      disabled={removeProjectMember.isPending}
                    >
                      <UserMinus className="h-4 w-4 mr-1.5" /> Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="mt-6">
          <QuotesTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab projectId={projectId} />
        </TabsContent>
      </Tabs>

      {/* Add Worker to Project Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Worker to Project</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium block mb-2">Select a worker *</label>
            {membersLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading team members…</span>
              </div>
            ) : unassignedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All company members are already assigned to this project.
              </p>
            ) : (
              <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member…" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedMembers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {getInitials(m)}
                          </AvatarFallback>
                        </Avatar>
                        {getMemberName(m)}
                        <span className="text-xs text-muted-foreground capitalize ml-1">({m.role})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addProjectMember.mutate({ projectId, data: { userId: Number(addMemberUserId) } })}
              disabled={!addMemberUserId || addProjectMember.isPending || membersLoading || unassignedMembers.length === 0}
            >
              {addProjectMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Worker to Project Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Worker on Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Worker *</label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="flex items-center gap-2">
                        {m.firstName} {m.lastName}
                        <span className="text-xs text-muted-foreground capitalize ml-1">({m.role})</span>
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
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">End Date *</label>
                <Input
                  type="date"
                  value={assignEndDate}
                  min={assignStartDate}
                  onChange={(e) => setAssignEndDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Notes (optional)</label>
              <Textarea
                placeholder="e.g. Framing crew, 7am–3pm shift"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                className="min-h-[64px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createAssignment.mutate({
                userId: Number(assignUserId),
                projectId,
                startDate: assignStartDate,
                endDate: assignEndDate,
                notes: assignNotes || undefined,
              })}
              disabled={!assignUserId || !assignStartDate || !assignEndDate || createAssignment.isPending}
            >
              {createAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Portal Share Dialog */}
      <Dialog open={showPortalDialog} onOpenChange={setShowPortalDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Share Client Portal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Share this link with your client. They can view project progress, documents, and upload files — no login required.
            </p>
            {portalLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : portalToken ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/portal/${portalToken}`}
                    className="text-xs font-mono bg-muted"
                  />
                  <Button size="icon" variant="outline" onClick={copyPortalLink} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <a
                  href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/portal/${portalToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open portal in new tab
                </a>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPortalDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
