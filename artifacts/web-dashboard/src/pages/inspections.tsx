import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInspections,
  useCreateInspection,
  useGetInspection,
  useSubmitInspection,
  useListInspectionAlerts,
  useMarkInspectionAlertRead,
  useMarkAllInspectionAlertsRead,
  getListInspectionsQueryKey,
  getGetInspectionQueryKey,
  getListInspectionAlertsQueryKey,
  useListProjects,
  type InspectionRow,
  type InspectionAlertRow,
  type InspectionDetail,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ClipboardCheck, Plus, Bell, CheckCircle2, AlertTriangle,
  Clock, Loader2, ChevronRight, X, Send, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const INSPECTION_TYPES = [
  { label: "General",        value: "general" },
  { label: "Site Safety",    value: "safety" },
  { label: "Quality",        value: "quality" },
  { label: "Progress",       value: "progress" },
  { label: "Electrical",     value: "electrical" },
  { label: "Structural",     value: "structural" },
  { label: "Fire Safety",    value: "fire" },
  { label: "Environmental",  value: "environmental" },
] as const;

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     color: "bg-gray-100 text-gray-700",    icon: FileText },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700",    icon: Send },
  passed:    { label: "Passed",    color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  failed:    { label: "Failed",    color: "bg-red-100 text-red-700",      icon: X },
  flagged:   { label: "Flagged",   color: "bg-yellow-100 text-yellow-700",icon: AlertTriangle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function CreateInspectionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: projectsData } = useListProjects();
  const projects = (projectsData as any)?.projects ?? (Array.isArray(projectsData) ? projectsData : []);

  const [projectId, setProjectId] = useState("");
  const [inspectionType, setInspectionType] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<Array<{ itemName: string; status: "pass" | "fail" | "na" }>>([
    { itemName: "", status: "pass" },
  ]);
  const [submitNow, setSubmitNow] = useState(false);

  const createMutation = useCreateInspection({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
        toast({ title: submitNow ? "Inspection submitted!" : "Inspection saved as draft." });
        onClose();
      },
      onError: (err: any) => toast({ title: "Error", description: err?.message ?? "Failed to create inspection", variant: "destructive" }),
    },
  });

  const addItem = () => setItems((prev) => [...prev, { itemName: "", status: "pass" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: "itemName" | "status", value: string) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const valid = inspectionType && date && items.every((it) => it.itemName.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            New Inspection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inspection Type *</Label>
              <Select value={inspectionType} onValueChange={setInspectionType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {INSPECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Inspection Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Checklist Items *</Label>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" />Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateItem(i, "itemName", e.target.value)}
                    placeholder={`Item ${i + 1} — e.g. Scaffolding inspected`}
                    className="flex-1"
                  />
                  <Select value={item.status} onValueChange={(v) => updateItem(i, "status", v)}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">Pass</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                      <SelectItem value="na">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground" onClick={() => removeItem(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl">
            <input
              type="checkbox"
              id="submitNow"
              checked={submitNow}
              onChange={(e) => setSubmitNow(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="submitNow" className="text-sm cursor-pointer">
              Submit immediately (mark as submitted)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate({
              data: {
                projectId: (projectId && projectId !== "none") ? parseInt(projectId) : null,
                inspectionType: inspectionType as any,
                date,
                items: items.map((it) => ({ itemName: it.itemName, status: it.status as any })),
                submit: submitNow,
              },
            })}
            disabled={!valid || createMutation.isPending}
            className="gap-2"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {submitNow ? "Submit Inspection" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspectionDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetInspection(id);

  const submitMutation = useSubmitInspection({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInspectionQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
        toast({ title: "Inspection submitted!" });
      },
    },
  });

  const detail = data as InspectionDetail | undefined;
  const insp = detail?.inspection;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            {isLoading ? "Loading…" : insp?.inspectionType}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : insp ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/40 rounded-xl text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                <StatusBadge status={insp.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                <p className="font-medium">{format(new Date(insp.date), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Score</p>
                <p className="font-medium">{insp.score != null ? `${insp.score}%` : "—"}</p>
              </div>
            </div>

            {detail?.project?.name && (
              <p className="text-sm text-muted-foreground">Project: <span className="font-medium text-foreground">{detail.project.name}</span></p>
            )}

            {insp.aiSummary && (
              <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <p className="text-xs font-semibold text-primary mb-1">AI Summary</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{insp.aiSummary}</p>
              </div>
            )}

            {detail?.items && detail.items.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Checklist</p>
                <div className="space-y-2">
                  {detail.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl border">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 ${
                        item.status === "pass" ? "bg-green-100 text-green-700"
                        : item.status === "fail" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "—"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.itemName}</p>
                        {item.comment && <p className="text-xs text-muted-foreground mt-0.5">{item.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {insp.status === "draft" && (
              <Button className="w-full gap-2"
                onClick={() => submitMutation.mutate({ id })}
                disabled={submitMutation.isPending}>
                {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Inspection
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Inspection not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function InspectionsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: rawInspections = [], isLoading } = useListInspections(
    projectFilter !== "all"
      ? { projectId: parseInt(projectFilter) }
      : undefined,
  );
  const { data: rawAlerts = [] } = useListInspectionAlerts();
  const { data: projectsData } = useListProjects();
  const projects = (projectsData as any)?.projects ?? (Array.isArray(projectsData) ? projectsData : []);

  const markReadMutation = useMarkInspectionAlertRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInspectionAlertsQueryKey() }),
    },
  });

  const markAllReadMutation = useMarkAllInspectionAlertsRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInspectionAlertsQueryKey() }),
    },
  });

  const allRows = rawInspections as InspectionRow[];
  const allAlertRows = rawAlerts as InspectionAlertRow[];

  const filtered = statusFilter === "all"
    ? allRows
    : allRows.filter((row) => row.inspection.status === statusFilter);

  const unreadAlerts = allAlertRows.filter((row) => row.alert?.isRead === false);
  const today = format(new Date(), "yyyy-MM-dd");
  const todayCount = allRows.filter((row) => row.inspection.date === today).length;
  const draftCount = allRows.filter((row) => row.inspection.status === "draft").length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inspections</h1>
            <p className="text-sm text-muted-foreground">Site safety and compliance checklists</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />New Inspection
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Today</p>
            <p className="text-2xl font-bold mt-1">{todayCount}</p>
            <p className="text-xs text-muted-foreground">inspection{todayCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-400">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Drafts</p>
            <p className="text-2xl font-bold mt-1">{draftCount}</p>
            <p className="text-xs text-muted-foreground">pending submit</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Alerts</p>
            <p className="text-2xl font-bold mt-1">{unreadAlerts.length}</p>
            <p className="text-xs text-muted-foreground">unread</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inspections">
        <TabsList className="mb-4">
          <TabsTrigger value="inspections" className="gap-2">
            <ClipboardCheck className="h-3.5 w-3.5" />Inspections
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {unreadAlerts.length > 0 && (
              <Badge className="ml-1 h-4 text-[10px] px-1.5">{unreadAlerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspections">
          <div className="flex items-center gap-3 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusConfig).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {filtered.length} inspection{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="font-semibold text-muted-foreground">No inspections found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {statusFilter !== "all" ? "Try changing the status filter." : "Create your first inspection to get started."}
                  </p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2">
                  <Plus className="h-4 w-4" />New Inspection
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => {
                const insp = row.inspection;
                return (
                  <button
                    key={insp.id}
                    onClick={() => setSelectedId(insp.id)}
                    className="w-full text-left border rounded-xl p-4 hover:bg-muted/50 hover:border-primary/30 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground capitalize">{insp.inspectionType}</p>
                          <StatusBadge status={insp.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />{format(new Date(insp.date), "MMM d, yyyy")}
                          </span>
                          {row.project?.name && <span>{row.project.name}</span>}
                          {insp.score != null && <span>Score: {insp.score}%</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts">
          {allAlertRows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <Bell className="h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium text-muted-foreground">No alerts</p>
                <p className="text-sm text-muted-foreground">You'll be notified about failed inspections and flagged items here.</p>
              </CardContent>
            </Card>
          ) : (
            <div>
              {unreadAlerts.length > 0 && (
                <div className="flex justify-end mb-3">
                  <Button variant="ghost" size="sm"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={markAllReadMutation.isPending}>
                    Mark all as read
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {allAlertRows.map((row, idx) => {
                  const alert = row.alert;
                  const isRead = alert?.isRead !== false;
                  return (
                    <div key={alert?.id ?? idx}
                      className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${isRead ? "bg-background" : "bg-primary/5 border-primary/15"}`}>
                      <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isRead ? "text-muted-foreground" : "text-yellow-600"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{alert?.message ?? "Inspection alert"}</p>
                        {alert?.createdAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(alert.createdAt), "MMM d, h:mm a")}</p>
                        )}
                        {row.inspection?.inspectionType && (
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{row.inspection.inspectionType}</p>
                        )}
                      </div>
                      {!isRead && alert?.id && (
                        <Button variant="ghost" size="sm" className="text-xs flex-shrink-0"
                          onClick={() => markReadMutation.mutate({ id: alert.id })}>
                          Dismiss
                        </Button>
                      )}
                      {row.inspectionId && (
                        <Button variant="outline" size="sm" className="text-xs flex-shrink-0 gap-1"
                          onClick={() => setSelectedId(row.inspectionId)}>
                          <ChevronRight className="h-3 w-3" />View
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateInspectionDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {selectedId !== null && (
        <InspectionDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
