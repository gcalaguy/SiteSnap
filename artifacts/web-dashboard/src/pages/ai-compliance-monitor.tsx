import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureGuard } from "@/components/FeatureGuard";
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Loader2,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Sparkles,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { formatDate as fmtDate } from "@/lib/format";
import type { ComplianceDirective, ComplianceDashboardRow } from "@workspace/api-client-react";

const GOLD = "#C9A84C";
const BLACK = "#111111";

// ── Types ──────────────────────────────────────────────────────────────────────

type DirectiveStatus = ComplianceDirective["status"];

// ── Status helpers ───────────────────────────────────────────────────────────────

const STATUS_META: Record<DirectiveStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PENDING:     { label: "Pending",     color: "#ca8a04", bg: "#1a1200", icon: Clock },
  COMPLETED:   { label: "Completed",   color: "#16a34a", bg: "#001a09", icon: CheckCircle },
  DISMISSED:   { label: "Dismissed",   color: "#6b7280", bg: "#1a1a1a", icon: XCircle },
  SUPERSEDED:  { label: "Superseded",  color: "#444444", bg: "#111111", icon: FileText },
};

const URGENCY_COLOR: Record<string, string> = {
  HIGH:   "#dc2626",
  MEDIUM: "#ca8a04",
  LOW:    "#16a34a",
};

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string | number; sub: string; icon: React.ElementType; accent: string }) {
  return (
    <Card
      style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {label}
        </CardTitle>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" style={{ color: "#fff" }}>{value}</div>
        <p className="text-xs text-zinc-500 mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Directive Card ─────────────────────────────────────────────────────────────

function DirectiveCard({ d, onComplete, onDismiss }: {
  d: ComplianceDirective;
  onComplete: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const meta = STATUS_META[d.status];
  const StatusIcon = meta.icon;
  const isActionable = d.status === "PENDING";

  return (
    <div
      className="rounded-xl border p-4 transition-all"
      style={{ background: meta.bg, borderColor: `${meta.color}30` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon className="h-4 w-4 flex-shrink-0" style={{ color: meta.color }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: URGENCY_COLOR[d.urgency] }}>
            {d.urgency}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 tabular-nums">
          {fmtDate(d.createdAt)}
        </span>
      </div>

      <p className="text-sm text-zinc-200 leading-snug mb-2">{d.workerDirective}</p>

      <div className="flex flex-wrap gap-1 mb-2">
        {d.triggerKeywords.map((k) => (
          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 border border-white/5">
            {k}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
          <span>Form: <span className="text-zinc-400">{d.targetFormId.replace(/_/g, " ")}</span></span>
          <span>Source: <span className="text-zinc-400">{d.sourceType}</span></span>
          <span>Confidence: <span className="text-zinc-400">{d.confidenceScore}%</span></span>
          {d.aiModel && <span className="text-zinc-500">AI: {d.aiModel}</span>}
        </div>

        {isActionable && (
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs gap-1"
              style={{ borderColor: "#16a34a40", color: "#16a34a" }}
              onClick={() => onComplete(d.id)}
            >
              <CheckCircle className="h-3 w-3" /> Complete
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs gap-1"
              style={{ borderColor: "#6b728040", color: "#6b7280" }}
              onClick={() => onDismiss(d.id)}
            >
              <XCircle className="h-3 w-3" /> Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Project Safety Card ──────────────────────────────────────────────────────

function ProjectSafetyCard({ row }: { row: ComplianceDashboardRow }) {
  const statusCfg = {
    critical: { label: "Critical", color: "#dc2626", bg: "#1a000099", icon: AlertTriangle },
    warning:  { label: "Warning",  color: "#ca8a04", bg: "#1a120099", icon: Activity },
    ok:       { label: "OK",       color: "#16a34a", bg: "#00180099", icon: ShieldCheck },
  };
  const cfg = statusCfg[row.safetyStatus];
  const StatusIcon = cfg.icon;

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}
          >
            <StatusIcon className="h-4 w-4" style={{ color: cfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100 truncate">{row.project.name}</p>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{row.project.status}</span>
          </div>
          <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg p-2" style={{ background: `${row.pendingHigh > 0 ? "#dc2626" : "#ca8a04"}10` }}>
            <div className="text-lg font-bold" style={{ color: row.pendingHigh > 0 ? "#dc2626" : "#ca8a04" }}>
              {row.pending}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-600">Pending</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "#16a34a10" }}>
            <div className="text-lg font-bold text-green-500">{row.completed}</div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-600">Resolved</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "#6b728010" }}>
            <div className="text-lg font-bold text-zinc-500">{row.dismissed}</div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-600">Dismissed</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          {row.pendingHigh > 0 && (
            <Badge className="text-[10px] bg-red-900/40 text-red-400 border-red-900/40">
              {row.pendingHigh} HIGH urgency
            </Badge>
          )}
          <Button
            size="sm" variant="outline"
            className="gap-1.5 text-xs ml-auto"
            style={{ borderColor: `${GOLD}50`, color: GOLD }}
            onClick={() => {
              window.location.href = `/api/projects/${row.project.id}/compliance/audit-export`;
            }}
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Audit PDF</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Directives List Panel ──────────────────────────────────────────────────────

function DirectivesListPanel({ status }: { status: DirectiveStatus }) {
  const qc = useQueryClient();
  const { data: directives = [], isLoading } = useQuery<ComplianceDirective[]>({
    queryKey: ["compliance-directives", status],
    queryFn: () => customFetch(`/api/compliance/directives?status=${status}`),
    refetchInterval: 60_000,
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/compliance/directives/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-directives"] });
      qc.invalidateQueries({ queryKey: ["compliance-dashboard"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (directives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
        <FileText className="h-8 w-8 opacity-30" />
        <p className="text-sm">No {status.toLowerCase()} directives.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {directives.map((d) => (
        <DirectiveCard
          key={d.id}
          d={d}
          onComplete={(id) => patch.mutate({ id, status: "COMPLETED" })}
          onDismiss={(id) => patch.mutate({ id, status: "DISMISSED" })}
        />
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function AIComplianceMonitorInner() {
  const { data: rows = [], isLoading: dashLoading } = useQuery<ComplianceDashboardRow[]>({
    queryKey: ["compliance-dashboard"],
    queryFn: () => customFetch("/api/compliance/dashboard"),
    refetchInterval: 90_000,
  });

  const { data: allDirectives = [] } = useQuery<ComplianceDirective[]>({
    queryKey: ["compliance-directives", "PENDING"],
    queryFn: () => customFetch(`/api/compliance/directives?status=PENDING`),
    refetchInterval: 60_000,
  });

  const totalPending = allDirectives.length;
  const totalHigh = allDirectives.filter((d) => d.urgency === "HIGH").length;
  const totalProjects = rows.length;
  const criticalProjects = rows.filter((r) => r.safetyStatus === "critical").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" style={{ color: GOLD }} />
            AI Compliance Monitor
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time compliance directive tracking across all active projects
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Projects" value={totalProjects}
          sub={`${criticalProjects} critical`}
          icon={BarChart3} accent={GOLD}
        />
        <StatCard
          label="Pending Directives" value={totalPending}
          sub={totalPending === 0 ? "All clear" : `${totalHigh} high urgency`}
          icon={AlertTriangle} accent={totalHigh > 0 ? "#dc2626" : GOLD}
        />
        <StatCard
          label="High Urgency" value={totalHigh}
          sub={totalHigh > 0 ? "Requires immediate action" : "No urgent items"}
          icon={Sparkles} accent={totalHigh > 0 ? "#dc2626" : GOLD}
        />
        <StatCard
          label="Compliance Rate"
          value={rows.length === 0 ? "\u2014" : `${Math.round((rows.filter((r) => r.safetyStatus === "ok").length / rows.length) * 100)}%`}
          sub="Projects with zero pending"
          icon={TrendingUp} accent={GOLD}
        />
      </div>

      {/* Project Cards */}
      {dashLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : rows.length === 0 ? (
        <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          <CardContent className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
            <ShieldCheck className="h-8 w-8 opacity-30" />
            <p className="text-sm">No active projects with compliance data.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <ProjectSafetyCard key={row.project.id} row={row} />
          ))}
        </div>
      )}

      {/* Directive Tabs */}
      <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            Compliance Directives
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="PENDING">
            <TabsList className="bg-white/5 mb-4">
              <TabsTrigger value="PENDING" className="text-xs data-[state=active]:bg-[#C9A84C] data-[state=active]:text-black">
                Pending
              </TabsTrigger>
              <TabsTrigger value="COMPLETED" className="text-xs data-[state=active]:bg-[#16a34a] data-[state=active]:text-white">
                Completed
              </TabsTrigger>
              <TabsTrigger value="DISMISSED" className="text-xs data-[state=active]:bg-[#6b7280] data-[state=active]:text-white">
                Dismissed
              </TabsTrigger>
              <TabsTrigger value="SUPERSEDED" className="text-xs data-[state=active]:bg-[#444444] data-[state=active]:text-white">
                Superseded
              </TabsTrigger>
            </TabsList>
            <TabsContent value="PENDING"><DirectivesListPanel status="PENDING" /></TabsContent>
            <TabsContent value="COMPLETED"><DirectivesListPanel status="COMPLETED" /></TabsContent>
            <TabsContent value="DISMISSED"><DirectivesListPanel status="DISMISSED" /></TabsContent>
            <TabsContent value="SUPERSEDED"><DirectivesListPanel status="SUPERSEDED" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AIComplianceMonitorPage() {
  return (
    <FeatureGuard feature="AI_COMPLIANCE">
      <AIComplianceMonitorInner />
    </FeatureGuard>
  );
}
