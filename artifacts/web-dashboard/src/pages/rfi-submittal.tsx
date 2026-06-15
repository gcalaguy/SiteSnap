import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useListProjects } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  MessageSquareWarning, Search, ExternalLink, CheckCircle2,
  XCircle, Clock, Eye, FileQuestion, CheckCheck, Filter,
  RefreshCw, ChevronRight, LayoutGrid,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ──────────────────────────────────────────────────────────────
const GOLD = "#D4AF37";
const BLACK = "#0A0A0A";
const SURFACE = "#141414";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  open: {
    label: "Open",
    icon: FileQuestion,
    color: "#ef4444",
    bg: "bg-red-950/40",
    border: "border-red-800/40",
    badge: "bg-red-100 text-red-700 border-red-200",
    glow: "#ef444422",
  },
  in_review: {
    label: "In Review",
    icon: Eye,
    color: "#f59e0b",
    bg: "bg-amber-950/40",
    border: "border-amber-700/40",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    glow: "#f59e0b22",
  },
  answered: {
    label: "Answered",
    icon: CheckCheck,
    color: "#3b82f6",
    bg: "bg-blue-950/40",
    border: "border-blue-800/40",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    glow: "#3b82f622",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    color: "#22c55e",
    bg: "bg-green-950/40",
    border: "border-green-800/40",
    badge: "bg-green-100 text-green-700 border-green-200",
    glow: "#22c55e22",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    color: "#f43f5e",
    bg: "bg-rose-950/40",
    border: "border-rose-800/40",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    glow: "#f43f5e22",
  },
  closed: {
    label: "Closed",
    icon: Clock,
    color: "#6b7280",
    bg: "bg-zinc-900/40",
    border: "border-zinc-700/40",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    glow: "#6b728022",
  },
} as const;

type RfiStatus = keyof typeof STATUS_CONFIG;

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  high: "bg-red-100 text-red-700 border-red-200",
  urgent: "bg-red-200 text-red-800 border-red-300",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface RfiRow {
  id: number;
  projectId: number;
  projectName: string | null;
  rfiNumber: string;
  subject: string;
  status: RfiStatus;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  submittedByName: string;
}

// ── Status Summary Card ───────────────────────────────────────────────────────
function StatusCard({
  status,
  count,
  active,
  onClick,
}: {
  status: RfiStatus;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col gap-2 rounded-xl p-4 border text-left w-full
        transition-all duration-150 cursor-pointer
        ${cfg.bg} ${cfg.border}
        ${active ? "ring-2 ring-offset-1 ring-offset-black scale-[1.02]" : "hover:scale-[1.01]"}
      `}
      style={active ? ({ ringColor: cfg.color } as React.CSSProperties) : {}}
    >
      {active && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: `0 0 0 2px ${cfg.color}` }}
        />
      )}
      <div className="flex items-center justify-between">
        <Icon size={18} style={{ color: cfg.color }} />
        {active && (
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
            Filtered
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-white leading-none">{count}</p>
        <p className="text-xs font-semibold mt-1" style={{ color: cfg.color }}>
          {cfg.label}
        </p>
      </div>
    </button>
  );
}

// ── Change Status Dialog ──────────────────────────────────────────────────────
function ChangeStatusDialog({
  rfi,
  open,
  onOpenChange,
}: {
  rfi: RfiRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [next, setNext] = useState<"approved" | "rejected">("approved");

  const mutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/rfis/${rfi!.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfi-submittal-all"] });
      toast({ title: `RFI marked as ${next}` });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Failed to update status", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" style={{ background: SURFACE, border: `1px solid ${GOLD}33` }}>
        <DialogHeader>
          <DialogTitle className="text-white">Change RFI Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-zinc-400">
            Set final status for <span className="font-semibold text-white">{rfi?.rfiNumber}</span>
          </p>
          <div className="flex gap-3">
            {(["approved", "rejected"] as const).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              return (
                <button
                  key={s}
                  onClick={() => setNext(s)}
                  className={`
                    flex-1 flex flex-col items-center gap-2 rounded-lg p-3 border transition-all
                    ${cfg.bg} ${cfg.border}
                    ${next === s ? "ring-2" : "opacity-60 hover:opacity-80"}
                  `}
                  style={next === s ? { boxShadow: `0 0 0 2px ${cfg.color}` } : {}}
                >
                  <Icon size={20} style={{ color: cfg.color }} />
                  <span className="text-xs font-semibold text-white">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            style={{ background: GOLD, color: BLACK }}
          >
            {mutation.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RfiSubmittalPage() {
  const [activeStatus, setActiveStatus] = useState<RfiStatus | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<number | undefined>(undefined);
  const [changeTarget, setChangeTarget] = useState<RfiRow | null>(null);

  const { data: projects = [] } = useListProjects();

  const { data: rfis = [], isLoading, refetch } = useQuery<RfiRow[]>({
    queryKey: ["rfi-submittal-all"],
    queryFn: () => customFetch<RfiRow[]>("/api/rfis"),
    staleTime: 30_000,
  });

  // Status counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rfis) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rfis]);

  // Filtered list
  const filtered = useMemo(() => {
    return rfis.filter((r) => {
      if (activeStatus && r.status !== activeStatus) return false;
      if (projectFilter && r.projectId !== projectFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.subject.toLowerCase().includes(q) &&
          !r.rfiNumber.toLowerCase().includes(q) &&
          !(r.projectName ?? "").toLowerCase().includes(q) &&
          !r.submittedByName.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rfis, activeStatus, projectFilter, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filtered],
  );

  const hasFilters = activeStatus !== null || projectFilter !== undefined || search !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <MessageSquareWarning size={24} style={{ color: GOLD }} />
            RFI &amp; Submittal
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Global view of all Requests for Information and their workflow status.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-zinc-400 hover:text-white gap-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.keys(STATUS_CONFIG) as RfiStatus[]).map((s) => (
          <StatusCard
            key={s}
            status={s}
            count={counts[s] ?? 0}
            active={activeStatus === s}
            onClick={() => setActiveStatus(activeStatus === s ? null : s)}
          />
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500"
            placeholder="Search RFIs, projects, submitters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={projectFilter !== undefined ? String(projectFilter) : "all"}
          onValueChange={(v) => setProjectFilter(v === "all" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-700 text-white">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveStatus(null);
              setProjectFilter(undefined);
              setSearch("");
            }}
            className="text-zinc-500 hover:text-white gap-1"
          >
            <Filter size={13} />
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-xs text-zinc-500 font-medium">
          {sorted.length} of {rfis.length} RFIs
        </span>
      </div>

      {/* RFI list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl bg-zinc-900" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card style={{ background: SURFACE, border: `1px solid #27272a` }}>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <LayoutGrid size={40} className="text-zinc-700" />
            <p className="text-zinc-500 font-medium">
              {hasFilters ? "No RFIs match your filters." : "No RFIs have been submitted yet."}
            </p>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setActiveStatus(null); setProjectFilter(undefined); setSearch(""); }}
                className="text-amber-500"
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((rfi) => {
            const cfg = STATUS_CONFIG[rfi.status] ?? STATUS_CONFIG.open;
            const Icon = cfg.icon;
            const canChangeStatus = rfi.status !== "approved" && rfi.status !== "rejected" && rfi.status !== "closed";
            return (
              <div
                key={rfi.id}
                className="group flex items-center gap-4 rounded-xl px-4 py-3 border transition-all duration-150 hover:border-zinc-600"
                style={{ background: SURFACE, borderColor: "#27272a" }}
              >
                {/* Status indicator */}
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-lg w-9 h-9"
                  style={{ background: cfg.glow }}
                >
                  <Icon size={16} style={{ color: cfg.color }} />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[11px] font-mono text-zinc-500">{rfi.rfiNumber}</span>
                    <Badge variant="outline" className={`text-[10px] py-0 ${cfg.badge}`}>
                      {cfg.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] py-0 ${PRIORITY_BADGE[rfi.priority] ?? ""}`}>
                      {rfi.priority}
                    </Badge>
                  </div>
                  <p className="font-semibold text-sm text-white truncate">{rfi.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {rfi.projectName && (
                      <span className="text-zinc-400 font-medium">{rfi.projectName} · </span>
                    )}
                    {rfi.submittedByName} · {format(new Date(rfi.createdAt), "MMM d, yyyy")}
                    {rfi.dueDate && (
                      <span className="ml-1 text-amber-500/70">
                        · Due {format(new Date(rfi.dueDate), "MMM d")}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canChangeStatus && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setChangeTarget(rfi)}
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1"
                    >
                      <ChevronRight size={13} />
                      Update Status
                    </Button>
                  )}
                  <Link href={`/projects/${rfi.projectId}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1"
                      style={{ color: GOLD }}
                      asChild
                    >
                      <span>
                        <ExternalLink size={12} />
                        Project
                      </span>
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Change status dialog */}
      <ChangeStatusDialog
        rfi={changeTarget}
        open={!!changeTarget}
        onOpenChange={(v) => { if (!v) setChangeTarget(null); }}
      />
    </div>
  );
}
