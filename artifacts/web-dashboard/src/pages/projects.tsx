import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useCreateProject,
  useListProjectMembers,
  useGetProjectSummary,
} from "@workspace/api-client-react";
import type { Project, ProjectMember } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getInitials, getMemberName } from "@/components/project-detail/TasksTab";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  MapPin,
  Building2,
  RefreshCw,
  LayoutGrid,
  List as ListIcon,
  HardHat,
  Users,
  Wallet,
  FileText,
  ExternalLink,
} from "lucide-react";

const GOLD = "#D4AF37";
const SURFACE = "#FFFFFF";
const SURFACE2 = "#F8F8F8";
const SURFACE3 = "#F0F0F0";
const BORDER = "#E5E5E5";
const TEXT = "#111111";
const MUTED = "#888888";

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:    { label: "In Progress", color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0" },
  planning:  { label: "Planning",    color: "#2563EB", bg: "#DBEAFE", border: "#BFDBFE" },
  on_hold:   { label: "On Hold",     color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
  completed: { label: "Completed",   color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0" },
  cancelled: { label: "Cancelled",   color: "#DC2626", bg: "#FEE2E2", border: "#FECACA" },
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${Math.round((n / 1_000_000) * 10) / 10}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

const projectSchema = z.object({
  name:        z.string().min(2, "Project name must be at least 2 characters"),
  address:     z.string().min(2, "Address is required"),
  city:        z.string().min(2, "City is required"),
  province:    z.string().min(2, "Province is required"),
  status:      z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("active"),
  budget:      z.coerce.number().positive("Budget must be positive").optional(),
  description: z.string().optional(),
});

type Filter = "All" | "Active" | "OnHold" | "Complete";
type ViewMode = "grid" | "list";

function StatusPill({ status }: { status: string }) {
  const st = statusConfig[status] ?? statusConfig.active;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
      style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: st.color, boxShadow: `0 0 5px 1px ${st.color}99` }}
      />
      {st.label}
    </span>
  );
}

function useProjectCrew(projectId: number) {
  const { data: members = [], isLoading } = useListProjectMembers(projectId);
  const foreman = (members as ProjectMember[]).find((m) => m.role === "foreman") ?? null;
  return { members: members as ProjectMember[], foreman, crewCount: members.length, isLoading };
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: (p: Project) => void }) {
  const { foreman, crewCount, isLoading } = useProjectCrew(project.id);
  const budget = project.budget ? parseFloat(String(project.budget)) : null;
  const spent = project.financials?.totalPaid ?? null;
  const pct =
    project.financials?.burnVelocity != null
      ? Math.max(0, Math.min(100, Math.round(project.financials.burnVelocity * 100)))
      : null;

  return (
    <div
      onClick={() => onOpen(project)}
      className="group cursor-pointer rounded-2xl bg-white p-5 border border-[#E5E5E5] hover:border-[#D4AF37]/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-extrabold text-[14px] leading-snug truncate group-hover:underline" style={{ color: TEXT }}>
            {project.name}
          </p>
          <p className="text-[10px] font-medium mt-0.5" style={{ color: MUTED }}>#{project.id}</p>
        </div>
        <StatusPill status={project.status} />
      </div>

      {/* Hero metric — budget progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: MUTED }}>
            Budget Progress
          </span>
          <span className="text-[11px] font-extrabold" style={{ color: pct != null ? TEXT : MUTED }}>
            {pct != null ? `${pct}%` : "No budget"}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: SURFACE3 }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct ?? 0}%`,
              background: pct == null ? "transparent" : pct >= 90 ? "#DC2626" : GOLD,
            }}
          />
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: MUTED }} title={project.address}>
          <MapPin size={12} style={{ color: GOLD, flexShrink: 0 }} />
          <span className="truncate">{project.city}, {project.province}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: MUTED }}>
          <HardHat size={12} style={{ color: GOLD, flexShrink: 0 }} />
          <span className="truncate">{isLoading ? "—" : foreman ? getMemberName(foreman) : "Unassigned foreman"}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium" style={{ color: MUTED }}>
          <Users size={12} style={{ color: GOLD, flexShrink: 0 }} />
          <span className="truncate">{isLoading ? "—" : `${crewCount} crew assigned`}</span>
        </div>
      </div>

      {/* Footer financials */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${SURFACE3}` }}>
        {project.complianceAlert === true ? (
          <span
            title="One or more assigned workers have missing or expired COR/IHSA safety credentials."
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold cursor-default select-none"
            style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", fontSize: 10 }}
          >
            <AlertCircle size={9} /> COR
          </span>
        ) : (
          <span />
        )}
        <div className="text-right leading-tight">
          <p className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: MUTED }}>Spent / Budget</p>
          <p className="text-[13px] font-extrabold" style={{ color: TEXT }}>
            {spent != null ? formatCompact(spent) : "$0"}{" "}
            <span className="font-medium" style={{ color: MUTED }}>/</span>{" "}
            {budget != null ? formatCompact(budget) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${BORDER}` }}>
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-10" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full mb-4" />
      <div className="space-y-2 mb-4">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="pt-3" style={{ borderTop: `1px solid ${SURFACE3}` }}>
        <Skeleton className="h-3.5 w-24 ml-auto" />
      </div>
    </div>
  );
}

function EmptyState({ hasActiveFilter, onCreate }: { hasActiveFilter: boolean; onCreate: () => void }) {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center py-20 rounded-2xl"
      style={{ border: `1px dashed ${BORDER}`, background: SURFACE2 }}
    >
      <div className="rounded-full p-4 mb-4" style={{ background: `${GOLD}14` }}>
        <Building2 size={28} style={{ color: GOLD }} />
      </div>
      <p className="text-sm font-extrabold" style={{ color: TEXT }}>No projects found</p>
      <p className="text-xs mt-1 font-medium max-w-xs text-center" style={{ color: MUTED }}>
        {hasActiveFilter ? "No projects match your search or filter." : "Get started by creating your first project."}
      </p>
      {!hasActiveFilter && (
        <button
          onClick={onCreate}
          className="mt-4 flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-lg text-white"
          style={{ background: GOLD }}
        >
          <Plus size={13} /> Create your first project
        </button>
      )}
    </div>
  );
}

const QUICK_LINKS: { label: string; tab: string; icon: React.ElementType; description: string }[] = [
  { label: "Financials", tab: "cost", icon: Wallet, description: "Cost analysis, invoices & budget burn" },
  { label: "Field Logs", tab: "reports", icon: FileText, description: "Daily reports from the job site" },
  { label: "Workforce & Schedule", tab: "team", icon: Users, description: "Assigned crew & foreman roster" },
];

function ProjectDrawer({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { data: summary } = useGetProjectSummary(project?.id ?? 0);
  const { members, foreman, crewCount } = useProjectCrew(project?.id ?? 0);

  if (!project) return null;
  const budget = project.budget ? parseFloat(String(project.budget)) : null;

  return (
    <Sheet open={!!project} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="p-6 pb-4 text-left space-y-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[11px] font-medium" style={{ color: MUTED }}>#{project.id}</p>
          <SheetTitle className="text-xl font-extrabold pr-6">{project.name}</SheetTitle>
          <div className="flex items-center gap-2 pt-0.5">
            <StatusPill status={project.status} />
            {project.complianceAlert === true && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
                style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", fontSize: 10 }}
              >
                <AlertCircle size={9} /> COR Alert
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: GOLD }}>Budget</p>
              <p className="text-lg font-extrabold" style={{ color: TEXT }}>
                {budget != null ? formatCompact(budget) : "—"}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: GOLD }}>Spent</p>
              <p className="text-lg font-extrabold" style={{ color: TEXT }}>
                {summary?.totalSpent != null ? formatCompact(summary.totalSpent) : "—"}
              </p>
              {summary?.budgetUtilizationPercent != null && (
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>{summary.budgetUtilizationPercent.toFixed(0)}% utilized</p>
              )}
            </div>
            <div className="rounded-xl p-3" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: GOLD }}>Open RFIs</p>
              <p className="text-lg font-extrabold" style={{ color: TEXT }}>{summary?.openRFICount ?? 0}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] font-extrabold uppercase tracking-wider mb-1" style={{ color: GOLD }}>Daily Reports</p>
              <p className="text-lg font-extrabold" style={{ color: TEXT }}>{summary?.reportCount ?? 0}</p>
              {summary?.lastReportDate && (
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  Last: {format(new Date(summary.lastReportDate), "MMM d")}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Location</p>
            <div className="flex items-start gap-2 text-sm font-medium" style={{ color: TEXT }}>
              <MapPin size={14} style={{ color: GOLD, marginTop: 2, flexShrink: 0 }} />
              <span>{project.address}, {project.city}, {project.province}</span>
            </div>
          </div>

          {/* Crew snapshot */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: MUTED }}>Crew</p>
              <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{crewCount} assigned</span>
            </div>
            {foreman && (
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold" style={{ color: TEXT }}>
                <HardHat size={13} style={{ color: GOLD }} /> {getMemberName(foreman)} <span className="font-normal" style={{ color: MUTED }}>· Foreman</span>
              </div>
            )}
            {members.length === 0 ? (
              <p className="text-xs font-medium" style={{ color: MUTED }}>No workers assigned yet.</p>
            ) : (
              <div className="flex -space-x-2">
                {members.slice(0, 6).map((m) => (
                  <Avatar key={m.id} className="h-7 w-7 border-2 border-white">
                    <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                      {getInitials(m)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {members.length > 6 && (
                  <div
                    className="h-7 w-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-semibold"
                    style={{ background: SURFACE3, color: MUTED }}
                  >
                    +{members.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Quick Links</p>
            <div className="space-y-2">
              {QUICK_LINKS.map(({ label, tab, icon: Icon, description }) => (
                <Link key={tab} href={`/projects/${project.id}?tab=${tab}`} onClick={onClose}>
                  <div
                    className="flex items-center gap-3 rounded-xl p-3 cursor-pointer hover:border-[#D4AF37]/50 transition-colors"
                    style={{ border: `1px solid ${BORDER}` }}
                  >
                    <div className="rounded-lg p-2" style={{ background: `${GOLD}14` }}>
                      <Icon size={15} style={{ color: GOLD }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: TEXT }}>{label}</p>
                      <p className="text-[10px] font-medium truncate" style={{ color: MUTED }}>{description}</p>
                    </div>
                    <ChevronRight size={14} style={{ color: MUTED, flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="p-6 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Close</Button>
          <Link href={`/projects/${project.id}`} onClick={onClose} className="flex-1 sm:flex-none">
            <Button className="w-full">
              Open Full Project <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function Projects() {
  const { data: projects, isLoading, dataUpdatedAt } = useListProjects();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState<Filter>("All");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sortCol, setSortCol]         = useState<string | null>(null);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("projects-view-mode") as ViewMode) || "grid";
    } catch {
      return "grid";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("projects-view-mode", viewMode);
    } catch {}
  }, [viewMode]);

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

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", address: "", city: "", province: "", status: "active", budget: undefined, description: "" },
  });

  function onSubmit(values: z.infer<typeof projectSchema>) {
    createProject.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project created successfully" });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: (err: any) => {
          toast({ title: "Failed to create project", description: err?.message || "An error occurred", variant: "destructive" });
        },
      }
    );
  }

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const allProjects = projects ?? [];

  const activeCount    = allProjects.filter(p => p.status === "active" || p.status === "planning").length;
  const completedCount = allProjects.filter(p => p.status === "completed").length;
  const onHoldCount    = allProjects.filter(p => p.status === "on_hold").length;
  const totalBudget    = allProjects.reduce((sum, p) => sum + (p.budget ? parseFloat(String(p.budget)) : 0), 0);

  const statCards: { label: string; value: string; icon: React.ElementType; sub: string; filterKey: Filter }[] = [
    { label: "Total Budget", value: totalBudget > 0 ? `$${(totalBudget / 1_000_000).toFixed(1)}M` : "—", icon: DollarSign, sub: `${allProjects.length} projects`, filterKey: "All" },
    { label: "Active",        value: String(activeCount),    icon: TrendingUp,  sub: "in progress", filterKey: "Active" },
    { label: "On Hold",       value: String(onHoldCount),    icon: Clock,       sub: "paused",      filterKey: "OnHold" },
    { label: "Completed",     value: String(completedCount), icon: CheckCircle2, sub: "finished",   filterKey: "Complete" },
  ];

  let filtered = allProjects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
    const matchFilter =
      filter === "All"      ? true :
      filter === "Active"   ? (p.status === "active" || p.status === "planning") :
      filter === "OnHold"   ? p.status === "on_hold" :
      p.status === "completed";
    return matchSearch && matchFilter;
  });

  if (sortCol === "name") filtered = [...filtered].sort((a, b) => sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  if (sortCol === "budget") filtered = [...filtered].sort((a, b) => {
    const av = a.budget ? parseFloat(String(a.budget)) : 0;
    const bv = b.budget ? parseFloat(String(b.budget)) : 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });
  if (sortCol === "date") filtered = [...filtered].sort((a, b) => {
    const av = new Date(a.createdAt).getTime();
    const bv = new Date(b.createdAt).getTime();
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const hasActiveFilter = search.length > 0 || filter !== "All";

  const SortIcon = ({ col }: { col: string }) => (
    <div className="flex flex-col" style={{ opacity: sortCol === col ? 1 : 0.35 }}>
      <ChevronUp size={8} style={{ marginBottom: -2, color: sortCol === col && sortDir === "asc" ? GOLD : "inherit" }} />
      <ChevronDown size={8} style={{ color: sortCol === col && sortDir === "desc" ? GOLD : "inherit" }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
            <Building2 className="h-6 w-6" style={{ color: "#D4AF37" }} />
            Project Overview
          </h1>
          <p className="text-sm mt-0.5 text-[#121212]/60 font-medium">All your job sites in one place</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdatedLabel && (
            <span className="text-xs text-[#121212]/40 hidden sm:block">
              Updated {lastUpdatedLabel}
            </span>
          )}
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border hover:bg-[#F8F8F8]"
            style={{ borderColor: "rgba(212,175,55,0.25)", color: MUTED }}
          >
            <RefreshCw size={12} style={{ color: GOLD }} /> Refresh
          </button>

          {/* View switcher */}
          <div className="flex items-center rounded-lg p-0.5" style={{ background: SURFACE2, border: `1px solid ${BORDER}` }}>
            <button
              onClick={() => setViewMode("grid")}
              title="Card grid view"
              className="rounded-md p-1.5 transition-colors"
              style={{ background: viewMode === "grid" ? SURFACE : "transparent", boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
            >
              <LayoutGrid size={14} style={{ color: viewMode === "grid" ? GOLD : MUTED }} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="Compact list view"
              className="rounded-md p-1.5 transition-colors"
              style={{ background: viewMode === "list" ? SURFACE : "transparent", boxShadow: viewMode === "list" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
            >
              <ListIcon size={14} style={{ color: viewMode === "list" ? GOLD : MUTED }} />
            </button>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-[#D4AF37] text-white hover:bg-[#b5922e]"
              >
                <Plus size={13} />
                New Project
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input placeholder="123 Main St Reno" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input placeholder="123 Main St" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Toronto" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="province" render={({ field }) => (
                      <FormItem><FormLabel>Province</FormLabel><FormControl><Input placeholder="ON" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="budget" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget (CAD) <span className="text-muted-foreground font-normal">— optional</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number" min="0" step="1000" placeholder="500000" className="pl-9"
                            {...field}
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="submit" disabled={createProject.isPending}>
                      {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Project
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map(({ label, value, icon: Icon, sub, filterKey }) => {
          const isActive = filter === filterKey;
          return (
            <button
              key={label}
              onClick={() => setFilter(isActive ? "All" : filterKey)}
              className="rounded-xl p-4 text-left transition-all duration-150 bg-white"
              style={{
                border: isActive ? `2px solid ${GOLD}` : "2px solid rgba(212,175,55,0.20)",
                boxShadow: isActive
                  ? `0 0 0 1px ${GOLD}22, 0 4px 12px rgba(0,0,0,0.06)`
                  : "0 2px 8px rgba(0,0,0,0.04)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>{label}</span>
                <Icon size={15} style={{ color: GOLD }} />
              </div>
              <p className="text-2xl font-extrabold mb-1 text-[#121212]">{isLoading ? "—" : value}</p>
              <p className="text-xs font-medium text-[#121212]/50">{sub}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{ background: SURFACE2, border: `1px solid ${BORDER}`, width: 260 }}>
          <Search size={13} style={{ color: MUTED, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: TEXT }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: MUTED }}>{filtered.length} projects</span>
          <div style={{ width: 1, height: 16, background: BORDER }} />
          <div className="flex items-center gap-1">
            {(["All", "Active", "OnHold", "Complete"] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-xs px-2.5 py-1 rounded-md font-medium"
                style={{
                  background: filter === f ? `${GOLD}18` : "transparent",
                  color: filter === f ? GOLD : MUTED,
                  border: filter === f ? `1px solid ${GOLD}33` : "1px solid transparent",
                }}
              >
                {f === "OnHold" ? "On Hold" : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin mr-2" style={{ color: GOLD }} />
              <span className="text-sm text-[#121212]/60 font-medium">Loading projects…</span>
            </div>
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className={viewMode === "grid" ? "grid grid-cols-1" : ""}>
          <EmptyState hasActiveFilter={hasActiveFilter} onCreate={() => setIsDialogOpen(true)} />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCard key={project.id} project={project} onOpen={setSelectedProject} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: SURFACE, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {[
                  { label: "Project",        sortable: true,  col: "name" },
                  { label: "Location",       sortable: false, col: "" },
                  { label: "Budget",         sortable: true,  col: "budget" },
                  { label: "Burn Velocity",  sortable: false, col: "" },
                  { label: "Status",         sortable: false, col: "" },
                  { label: "Created",        sortable: true,  col: "date" },
                  { label: "",               sortable: false, col: "" },
                ].map(({ label, sortable, col }) => (
                  <th
                    key={label || "actions"}
                    className="text-left px-4 py-3 font-extrabold tracking-wider"
                    style={{ color: "#D4AF37", fontSize: 10, textTransform: "uppercase", background: "#F8F8F8", cursor: sortable ? "pointer" : "default" }}
                    onClick={() => sortable && toggleSort(col)}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {sortable && <SortIcon col={col} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((project, i) => {
                const st = statusConfig[project.status] ?? statusConfig.active;
                const budget = project.budget ? parseFloat(String(project.budget)) : null;
                const pct = project.financials?.burnVelocity != null ? Math.round(project.financials.burnVelocity * 100) : null;
                return (
                  <tr
                    key={project.id}
                    className="group"
                    style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? SURFACE : SURFACE2, cursor: "pointer" }}
                    onClick={() => setSelectedProject(project)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = SURFACE3; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? SURFACE : SURFACE2; }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-extrabold group-hover:underline" style={{ color: "#121212", fontSize: 12 }}>{project.name}</p>
                      <p style={{ color: "#888888", fontSize: 10 }}>#{project.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium" style={{ color: "#888888", fontSize: 12 }}>
                        <MapPin size={11} style={{ color: "#D4AF37", flexShrink: 0 }} />
                        <span>{project.city}, {project.province}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {budget ? (
                        <span className="font-extrabold" style={{ color: "#D4AF37", fontSize: 12 }}>
                          ${budget.toLocaleString("en-CA")}
                        </span>
                      ) : (
                        <span style={{ color: "#888888", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pct == null ? (
                        <span style={{ color: "#888888", fontSize: 12 }}>—</span>
                      ) : (
                        <span className="font-semibold" style={{ color: "#121212", fontSize: 12 }}>
                          {pct}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10 }}
                        >
                          {project.status === "cancelled" && <AlertCircle size={9} />}
                          {project.status === "completed" && <CheckCircle2 size={9} />}
                          {st.label}
                        </span>
                        {project.complianceAlert === true && (
                          <span
                            title="One or more assigned workers have missing or expired COR/IHSA safety credentials. Review Worker Vault to resolve."
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold cursor-default select-none"
                            style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", fontSize: 10 }}
                          >
                            <AlertCircle size={9} />
                            COR
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: project.status === "cancelled" ? "#DC2626" : MUTED, fontSize: 11 }}>
                      {format(new Date(project.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()}>
                        <button className="rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "transparent", border: "none", cursor: "pointer" }} title="Open full project">
                          <ExternalLink size={14} style={{ color: MUTED }} />
                        </button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE2 }}
          >
            <span className="text-xs" style={{ color: MUTED }}>
              Showing {filtered.length} of {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      <ProjectDrawer project={selectedProject} onClose={() => setSelectedProject(null)} />
    </div>
  );
}
