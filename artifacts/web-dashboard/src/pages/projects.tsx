import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useCreateProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  Loader2,
  MapPin,
  Building2,
} from "lucide-react";

const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#FFFFFF";
const SURFACE2 = "#F8F8F8";
const SURFACE3 = "#F0F0F0";
const BORDER = "#E5E5E5";
const TEXT = "#111111";
const MUTED = "#888888";

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:    { label: "Active",    color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0" },
  planning:  { label: "Planning",  color: "#2563EB", bg: "#DBEAFE", border: "#BFDBFE" },
  on_hold:   { label: "On Hold",   color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" },
  completed: { label: "Completed", color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0" },
  cancelled: { label: "Cancelled", color: "#DC2626", bg: "#FEE2E2", border: "#FECACA" },
};

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

export default function Projects() {
  const { data: projects, isLoading } = useListProjects();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState<Filter>("All");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sortCol, setSortCol]         = useState<string | null>(null);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");

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

      {/* Table container */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: SURFACE, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
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
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin mr-2" style={{ color: GOLD }} />
            <span className="text-sm text-[#121212]/60 font-medium">Loading projects…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Building2 size={36} style={{ color: "rgba(212,175,55,0.25)", marginBottom: 12 }} />
            <p className="text-sm font-extrabold text-[#121212]">No projects found</p>
            <p className="text-xs mt-1 text-[#121212]/60 font-medium">Create your first project to get started</p>
          </div>
        ) : (
          <>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Project",   sortable: true,  col: "name" },
                    { label: "Location",  sortable: false, col: "" },
                    { label: "Budget",    sortable: true,  col: "budget" },
                    { label: "Status",    sortable: false, col: "" },
                    { label: "Created",   sortable: true,  col: "date" },
                    { label: "",          sortable: false, col: "" },
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
                  const isOverdue = project.status === "cancelled";
                  return (
                    <tr
                      key={project.id}
                      style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? SURFACE : SURFACE2, cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = SURFACE3; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? SURFACE : SURFACE2; }}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`}>
                          <div>
                            <p className="font-extrabold hover:underline" style={{ color: "#121212", fontSize: 12 }}>{project.name}</p>
                            <p style={{ color: "#888888", fontSize: 10 }}>#{project.id}</p>
                          </div>
                        </Link>
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
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 10 }}
                        >
                          {project.status === "cancelled" && <AlertCircle size={9} />}
                          {project.status === "completed" && <CheckCircle2 size={9} />}
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: isOverdue ? "#DC2626" : MUTED, fontSize: 11 }}>
                        {format(new Date(project.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`}>
                          <button className="rounded-md p-1" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                            <MoreHorizontal size={14} style={{ color: MUTED }} />
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
          </>
        )}
      </div>
    </div>
  );
}
