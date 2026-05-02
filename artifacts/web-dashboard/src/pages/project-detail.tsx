import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
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
} from "@workspace/api-client-react";
import { getListTasksQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, ChevronLeft, MapPin, Calendar, DollarSign, FileText, AlertTriangle, CheckSquare, MoreVertical, Trash2, Circle, Loader2 } from "lucide-react";
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

function TaskCard({ task, onStatusChange, onDelete }: {
  task: Task;
  onStatusChange: (id: number, status: Task["status"]) => void;
  onDelete: (id: number) => void;
}) {
  const priorityColors: Record<string, string> = {
    low: "bg-slate-100 text-slate-700 border-slate-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="bg-card border rounded-lg p-3 shadow-sm hover:border-primary/40 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-sm leading-snug">{task.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {task.status !== "todo" && (
              <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")}>
                <Circle className="mr-2 h-3 w-3" /> Mark To Do
              </DropdownMenuItem>
            )}
            {task.status !== "in_progress" && (
              <DropdownMenuItem onClick={() => onStatusChange(task.id, "in_progress")}>
                <Loader2 className="mr-2 h-3 w-3" /> Mark In Progress
              </DropdownMenuItem>
            )}
            {task.status !== "done" && (
              <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")}>
                <CheckSquare className="mr-2 h-3 w-3" /> Mark Done
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task.id)}>
              <Trash2 className="mr-2 h-3 w-3" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
      )}
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-muted-foreground">Due {format(new Date(task.dueDate), "MMM d")}</span>
        )}
      </div>
    </div>
  );
}

function TasksTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data: tasks = [], isLoading } = useListTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [showDialog, setShowDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  const columns: { key: Task["status"]; label: string; color: string }[] = [
    { key: "todo", label: "To Do", color: "bg-slate-50 border-slate-200" },
    { key: "in_progress", label: "In Progress", color: "bg-amber-50/50 border-amber-200" },
    { key: "done", label: "Done", color: "bg-green-50/50 border-green-200" },
  ];

  const byStatus = (status: Task["status"]) =>
    (tasks as Task[]).filter((t) => t.status === status);

  function handleCreate() {
    if (!newTitle.trim()) return;
    createTask.mutate(
      {
        projectId,
        data: {
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          priority: newPriority,
          dueDate: newDueDate || undefined,
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

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">Tasks</h3>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-muted-foreground animate-pulse">Loading tasks...</div>
      ) : (tasks as Task[]).length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-card">
          <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="font-medium">No tasks yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add tasks to track work items for this project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => {
            const colTasks = byStatus(col.key);
            return (
              <div key={col.key} className={`rounded-lg border p-3 ${col.color}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">{col.label}</h4>
                  <span className="text-xs bg-white border rounded-full px-2 py-0.5 font-medium">
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

export default function ProjectDetail() {
  const params = useParams();
  const projectId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: project, isLoading: projectLoading } = useGetProject(projectId);
  const { data: summary } = useGetProjectSummary(projectId);
  const { data: reports } = useListDailyReports(projectId);
  const { data: costAnalyses } = useListCostAnalyses(projectId);
  const { data: rfis } = useListRFIs(projectId);

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case "active": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "planning": return <Badge variant="secondary">Planning</Badge>;
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
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/projects")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {project.address}, {project.city}, {project.province}</span>
            {project.startDate && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Started: {format(new Date(project.startDate), "MMM d, yyyy")}</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="reports">Daily Reports</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
        </TabsList>

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
                <CardTitle className="text-sm font-medium">Daily Reports</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.reportCount || 0}</div>
                {summary?.lastReportDate && <p className="text-xs text-muted-foreground">Last: {format(new Date(summary.lastReportDate), "MMM d")}</p>}
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
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <TasksTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Daily Reports</h3>
            <Button onClick={() => setLocation(`/projects/${projectId}/reports/new`)}>
              <Plus className="mr-2 h-4 w-4" /> New Report
            </Button>
          </div>
          {reports?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No daily reports yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reports?.map(report => (
                <Card key={report.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-lg">{format(new Date(report.reportDate), "MMM d, yyyy")}</span>
                      <Badge variant="outline">Crew: {report.crewCount}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{report.workPerformed}</p>
                    {report.aiSummary && (
                      <div className="mt-3 text-xs bg-muted/30 p-2 rounded border border-border/50">
                        <span className="font-semibold block mb-1">AI Summary:</span>
                        <span className="line-clamp-2 text-muted-foreground">{report.aiSummary}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
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
          {costAnalyses?.length === 0 ? (
            <div className="text-center p-8 border rounded-md bg-card">
              <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p>No cost records yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {costAnalyses?.map(cost => (
                <Card key={cost.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">{cost.periodLabel}</CardTitle>
                      <span className="font-bold text-lg text-destructive">${cost.totalCost.toLocaleString()}</span>
                    </div>
                  </CardHeader>
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
                </Card>
              ))}
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
              {rfis?.map(rfi => (
                <div key={rfi.id} className="flex items-start justify-between p-4 border rounded-md bg-card hover:border-primary/50 transition-colors cursor-pointer">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">{rfi.rfiNumber}</span>
                      <h4 className="font-bold text-lg">{rfi.subject}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1 max-w-2xl">{rfi.description}</p>
                    {rfi.dueDate && <p className="text-xs text-muted-foreground mt-2">Due: {format(new Date(rfi.dueDate), "MMM d, yyyy")}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={rfi.status === 'open' || rfi.status === 'in_review' ? 'default' : 'secondary'} className={rfi.status === 'open' ? 'bg-orange-600' : ''}>
                      {rfi.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    {getPriorityBadge(rfi.priority)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
