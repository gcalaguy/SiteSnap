import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetProject,
  useGetProjectSummary,
  useListDailyReports,
  useListRFIs,
  useListTasks,
  useGetMe,
  useListCompanyMembers,
  useListProjectMembers,
  useAddProjectMember,
  useRemoveProjectMember,
  useListChangeOrders,
  getListProjectMembersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TasksTab, getMemberName, getInitials } from "@/components/project-detail/TasksTab";
import { useCompanyFeatures } from "@/components/FeatureGuard";
import type { Member, Task } from "@/components/project-detail/TasksTab";
import { ReportsTab } from "@/components/project-detail/ReportsTab";
import { CostTab } from "@/components/project-detail/CostTab";
import { RFIsTab } from "@/components/project-detail/RFIsTab";
import DocumentsTab from "@/components/DocumentsTab";
import QuotesTab from "@/components/QuotesTab";
import ClientMessagesTab from "@/components/ClientMessagesTab";
import SafetyComplianceTab from "@/components/SafetyComplianceTab";
import PermitsTab from "@/components/project-detail/PermitsTab";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { CharCountedTextarea } from "@/components/ui/char-counted-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { pdf } from "@react-pdf/renderer";
import ProjectLiteDocument from "@/components/pdf/ProjectLiteDocument";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, ChevronLeft, MapPin, Calendar, DollarSign, FileText, AlertTriangle, CheckSquare, Loader2, FolderOpen, Users, X, CalendarDays, UserPlus, UserMinus, Share2, Copy, Check, ExternalLink, MessageCircle, Printer, Shield, BadgeCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";


const GOLD = "#C9A84C";
const BLACK = "#111111";
const ASSIGN_NOTES_MAX = 1_000;

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

  // Print / Export PDF state
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [printSections, setPrintSections] = useState<Record<string, boolean>>({
    info: true,
    notes: false,
    reports: false,
    tasks: false,
    rfis: false,
    schedule: false,
    cost: false,
    changeOrders: false,
    safety: false,
  });
  // Deep-linkable via /projects/:id?tab=overview|tasks|reports|cost|rfis|quotes|team|documents|client-messages|safety|change-orders|permits
  const search = useSearch();
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(search).get("tab");
    return requestedTab || "overview";
  });

  const { data: me } = useGetMe();
  const companyId = me?.company?.id;
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const hasPerm = (key: string): boolean => {
    if (!me?.permissions) return true;
    return (me.permissions as Record<string, boolean>)[key] !== false;
  };
  const { data: featureData } = useCompanyFeatures(me?.activeCompanyId as number | null | undefined);
  const hasPermitsFeature =
    me?.systemRole === "super_admin" || (featureData?.features?.includes("PERMITS") ?? false);

  const { data: members = [], isLoading: membersLoading } = useListCompanyMembers(
    companyId ?? 0,
    { query: { enabled: !!companyId } as any }
  ) as { data: Member[]; isLoading: boolean };

  // Project-level member assignments (controls which workers can see this project)
  const { data: projectMembers = [] } = useListProjectMembers(projectId);
  const assignedIds = new Set(projectMembers.map((m: any) => m.id));
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

  const { refetch: refetchAssignments } = useQuery<ProjectAssignment[]>({
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
  const { data: rfis } = useListRFIs(projectId);
  const { data: allProjectTasks = [] } = useListTasks(projectId);
  const { data: changeOrders = [] } = useListChangeOrders(
    isOwnerOrForeman ? { projectId } : undefined,
    { query: { enabled: isOwnerOrForeman } as any },
  );

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

        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setShowPrintSheet(true)}
        >
          <Printer className="h-4 w-4" />
          Export PDF
        </Button>

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-max min-w-full h-10">
            <TabsTrigger value="overview" className="px-4 whitespace-nowrap">Overview</TabsTrigger>
            <TabsTrigger value="tasks" className="px-4 whitespace-nowrap">Tasks</TabsTrigger>
            <TabsTrigger value="reports" className="px-4 whitespace-nowrap">Daily Reports</TabsTrigger>
            {hasPerm("viewFinancials") && (
              <TabsTrigger value="cost" className="px-4 whitespace-nowrap">Cost Analysis</TabsTrigger>
            )}
            {hasPerm("viewRFIs") && (
              <TabsTrigger value="rfis" className="px-4 whitespace-nowrap">RFIs</TabsTrigger>
            )}
            {hasPerm("viewQuotes") && (
              <TabsTrigger value="quotes" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />Quotes
              </TabsTrigger>
            )}
            <TabsTrigger value="team" className="px-4 whitespace-nowrap flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />Team
            </TabsTrigger>
            {hasPerm("viewDocuments") && (
              <TabsTrigger value="documents" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />Documents
              </TabsTrigger>
            )}
            {hasPerm("viewClientMessages") && (
              <TabsTrigger value="client-messages" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />Client Messages
              </TabsTrigger>
            )}
            {hasPerm("viewSafetyTab") && (
              <TabsTrigger value="safety" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />Safety & Compliance
              </TabsTrigger>
            )}
            {isOwnerOrForeman && (
              <TabsTrigger value="change-orders" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />Change Orders
              </TabsTrigger>
            )}
            {isOwnerOrForeman && hasPermitsFeature && (
              <TabsTrigger value="permits" className="px-4 whitespace-nowrap flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5" />Permits
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total Budget",
                icon: DollarSign,
                value: `$${summary?.totalBudget?.toLocaleString() || "0"}`,
                sub: null,
              },
              {
                label: "Total Spent",
                icon: DollarSign,
                value: `$${summary?.totalSpent?.toLocaleString() || "0"}`,
                sub: summary?.budgetUtilizationPercent ? `${summary.budgetUtilizationPercent.toFixed(1)}% utilized` : null,
              },
              {
                label: selectedMember ? `${selectedMember.firstName}'s Reports` : "Daily Reports",
                icon: FileText,
                value: String(filteredReports.length),
                sub: filteredReports.length > 0 ? `Last: ${format(new Date(filteredReports[0].reportDate), "MMM d")}` : null,
                onClick: () => setActiveTab("reports"),
              },
              {
                label: "Open RFIs",
                icon: AlertTriangle,
                value: String(summary?.openRFICount || 0),
                sub: `${summary?.closedRFICount || 0} closed`,
                onClick: () => setActiveTab("rfis"),
              },
            ].map(({ label, icon: Icon, value, sub, onClick }) => {
              const content = (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
                    <Icon size={15} style={{ color: GOLD }} />
                  </div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  {sub && <p className="text-xs mt-1" style={{ color: "#71717a" }}>{sub}</p>}
                </>
              );
              return onClick ? (
                <button
                  key={label}
                  onClick={onClick}
                  className="rounded-xl p-4 text-left cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
                >
                  {content}
                </button>
              ) : (
                <div key={label} className="rounded-xl p-4" style={{ background: BLACK, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
                  {content}
                </div>
              );
            })}
          </div>

          {/* Task Overview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4 text-primary" />
                Task Overview
              </CardTitle>
              <span className="text-sm text-muted-foreground font-normal">
                {summary?.taskTotal ?? 0} total
              </span>
            </CardHeader>
            <CardContent>
              {!summary?.taskTotal ? (
                <p className="text-sm text-muted-foreground">No tasks yet — go to the Tasks tab to add some.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg border border-border bg-muted/30 py-3 px-2">
                    <p className="text-2xl font-bold text-foreground">{summary?.taskTodoCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">To Do</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 py-3 px-2">
                    <p className="text-2xl font-bold text-amber-700">{summary?.taskInProgressCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50/50 py-3 px-2">
                    <p className="text-2xl font-bold text-green-700">{summary?.taskDoneCount ?? 0}</p>
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
                  <p className="text-sm text-muted-foreground mt-1">Workers currently assigned to this project.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setAddMemberUserId(""); setShowAddMemberDialog(true); }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Schedule Worker
                </Button>
              </CardHeader>
              <CardContent>
                {projectMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed rounded-lg">
                    <Users className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm font-medium">No workers assigned yet</p>
                    <p className="text-xs mt-1">Click "Schedule Worker" to assign a team member.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectMembers.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                              {getInitials(m)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {getMemberName(m)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.email}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize text-xs ml-1">{m.role}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeProjectMember.mutate({ projectId, memberId: m.id })}
                            disabled={removeProjectMember.isPending}
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
          <ReportsTab
            projectId={projectId}
            selectedWorkerId={selectedWorkerId}
            members={members}
            isOwnerOrForeman={isOwnerOrForeman}
          />
        </TabsContent>

        {hasPerm("viewFinancials") && (
          <TabsContent value="cost" className="mt-6">
            <CostTab projectId={projectId} isOwnerOrForeman={isOwnerOrForeman} />
          </TabsContent>
        )}

        {hasPerm("viewRFIs") && (
          <TabsContent value="rfis" className="mt-6">
            <RFIsTab projectId={projectId} isOwnerOrForeman={isOwnerOrForeman} members={members} />
          </TabsContent>
        )}

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

          {projectMembers.length === 0 ? (
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
              {projectMembers.map((m: any) => (
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

        {hasPerm("viewQuotes") && (
          <TabsContent value="quotes" className="mt-6">
            <QuotesTab projectId={projectId} />
          </TabsContent>
        )}

        {hasPerm("viewDocuments") && (
          <TabsContent value="documents" className="mt-6">
            <DocumentsTab projectId={projectId} />
          </TabsContent>
        )}

        {hasPerm("viewClientMessages") && (
          <TabsContent value="client-messages" className="mt-6">
            <ClientMessagesTab projectId={projectId} />
          </TabsContent>
        )}

        {hasPerm("viewSafetyTab") && (
          <TabsContent value="safety" className="mt-6">
            <SafetyComplianceTab projectId={projectId} />
          </TabsContent>
        )}

        {isOwnerOrForeman && (
          <TabsContent value="change-orders" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Change Orders</h3>
                <span className="text-sm text-muted-foreground">{changeOrders.length} total</span>
              </div>
              {changeOrders.length === 0 ? (
                <div className="text-center p-8 border rounded-md bg-card">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                  <p className="font-medium">No change orders yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Change orders will appear here once created.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {changeOrders.map((co: any) => {
                    const statusColors: Record<string, string> = {
                      pending: "bg-amber-950/30 text-amber-400 border-amber-900/50",
                      approved: "bg-green-950/30 text-green-400 border-green-900/50",
                      rejected: "bg-red-950/30 text-red-400 border-red-900/50",
                    };
                    const amount = co.amount != null
                      ? (typeof co.amount === "string" ? parseFloat(co.amount) : Number(co.amount))
                      : null;
                    return (
                      <div key={co.id} className="rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{co.title}</p>
                            {co.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{co.description}</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${statusColors[co.status] ?? statusColors.pending}`}>
                            {co.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          {amount != null && (
                            <span className="font-medium text-foreground">
                              ${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(co.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {isOwnerOrForeman && hasPermitsFeature && (
          <TabsContent value="permits" className="mt-6">
            <PermitsTab projectId={projectId} />
          </TabsContent>
        )}
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
              <CharCountedTextarea
                placeholder="e.g. Framing crew, 7am–3pm shift"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value.slice(0, ASSIGN_NOTES_MAX))}
                className="min-h-[64px]"
                maxLength={ASSIGN_NOTES_MAX}
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
              disabled={!assignUserId || !assignStartDate || !assignEndDate || createAssignment.isPending || assignNotes.length >= ASSIGN_NOTES_MAX}
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

      {/* Export PDF Sheet */}
      <Sheet open={showPrintSheet} onOpenChange={setShowPrintSheet}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Export Project PDF</SheetTitle>
            <SheetDescription>
              Choose which sections to include in the report.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {[
              { key: "info", label: "Project Info", disabled: true },
              { key: "notes", label: "Project Notes" },
              { key: "reports", label: "Daily Reports" },
              { key: "tasks", label: "Tasks" },
              { key: "rfis", label: "RFIs" },
              { key: "schedule", label: "Worker Schedule" },
              { key: "cost", label: "Cost Analysis" },
              { key: "changeOrders", label: "Change Orders" },
              { key: "safety", label: "Safety & Inspections" },
            ].map(({ key, label, disabled }) => (
              <div key={key} className="flex items-center space-x-3">
                <Checkbox
                  id={`print-${key}`}
                  checked={printSections[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    setPrintSections((prev) => ({ ...prev, [key]: checked === true }))
                  }
                />
                <Label htmlFor={`print-${key}`} className={disabled ? "text-muted-foreground" : ""}>
                  {label}
                  {disabled && <span className="text-xs text-muted-foreground ml-1">(required)</span>}
                </Label>
              </div>
            ))}
          </div>
          <SheetFooter className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => setShowPrintSheet(false)}>
              Cancel
            </Button>
            <button
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors w-full"
              onClick={async () => {
                const pdfFileName = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_Report.pdf`;
                const blob = await pdf(
                  <ProjectLiteDocument
                    project={project}
                    summary={summary}
                    tasks={allProjectTasks as Task[]}
                    reports={reports ?? []}
                    rfis={rfis ?? []}
                    members={members}
                    sections={printSections}
                  />
                ).toBlob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = pdfFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                const { mirrorToLocalDrive } = await import("@/lib/driveSyncPipeline");
                await mirrorToLocalDrive(pdfFileName, blob);
              }}
            >
              Download PDF
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

