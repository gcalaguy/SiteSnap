import { useState, useEffect } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown, ChevronUp, CheckSquare, MoreVertical, Trash2, Loader2, Circle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { createTaskBodyDescriptionMax as TASK_DESC_MAX } from "@workspace/api-zod";

export type Task = {
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

export type Member = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

export function getInitials(m: Member) {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  if (first || last) return `${first}${last}`.toUpperCase();
  return (m.email?.[0] ?? "?").toUpperCase();
}

export function getMemberName(m: Member) {
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

export function TasksTab({ projectId, selectedWorkerId, members }: {
  projectId: number;
  selectedWorkerId: number | null;
  members: Member[];
}) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<Task["status"] | "all">("all");
  const { data: allTasks = [], isLoading, dataUpdatedAt } = useListTasks(
    projectId,
    statusFilter !== "all" ? { status: statusFilter } : undefined,
  );

  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("");

  useEffect(() => {
    function computeLabel() {
      if (!dataUpdatedAt) return "";
      const secs = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      if (secs < 5) return "just now";
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ago`;
    }
    setLastUpdatedLabel(computeLabel());
    const id = setInterval(() => setLastUpdatedLabel(computeLabel()), 10_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

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
        <div className="flex items-center gap-3">
          {lastUpdatedLabel && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdatedLabel}
            </span>
          )}
          <Button onClick={handleOpenDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add Task
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "todo", "in_progress", "done"] as const).map((s) => {
          const label =
            s === "all" ? "All" :
            s === "todo" ? "To Do" :
            s === "in_progress" ? "In Progress" : "Done";
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-muted-foreground animate-pulse">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">
            {selectedWorkerId
              ? `No tasks assigned to ${workerName}`
              : statusFilter !== "all"
              ? `No ${statusFilter === "todo" ? "to do" : statusFilter === "in_progress" ? "in-progress" : "done"} tasks`
              : "No tasks yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedWorkerId
              ? "Add a task and assign it to this worker."
              : "Add tasks to track work items for this project."}
          </p>
        </div>
      ) : (
        <div className={statusFilter === "all" ? "grid grid-cols-1 md:grid-cols-3 gap-4" : "space-y-2"}>
          {(statusFilter === "all" ? columns : columns.filter((c) => c.key === statusFilter)).map((col) => {
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
              <CharCountedTextarea
                placeholder="Optional description"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value.slice(0, TASK_DESC_MAX))}
                className="min-h-[80px]"
                maxLength={TASK_DESC_MAX}
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
              disabled={!newTitle.trim() || createTask.isPending || newDesc.length >= TASK_DESC_MAX}
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
