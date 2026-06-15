import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import {
  ShieldAlert, AlertTriangle, Flame, CircleDot, ChevronRight, ChevronLeft,
  Bell, Check, Eye, TrendingUp, BarChart3, Loader2, Download, Activity, ShieldCheck,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { FeatureGuard } from "@/components/FeatureGuard";

// ── Constants ──────────────────────────────────────────────────────────────────

const GOLD = "#C9A84C";
const BLACK = "#111111";

const RISK = {
  Critical: { color: "#dc2626", bg: "#1a0000", badge: "#fee2e2", badgeText: "#991b1b", border: "#7f1d1d50" },
  High:     { color: "#ea580c", bg: "#1a0900", badge: "#ffedd5", badgeText: "#9a3412", border: "#7c2d1250" },
  Medium:   { color: "#ca8a04", bg: "#1a1200", badge: "#fef9c3", badgeText: "#854d0e", border: "#78350f50" },
  Low:      { color: "#16a34a", bg: "#001a09", badge: "#dcfce7", badgeText: "#166534", border: "#14532d50" },
} as const;
type RLevel = keyof typeof RISK;

// ── Types ──────────────────────────────────────────────────────────────────────

type TrendPoint = { day: string; avgScore: number; count: number };

type InspectionRow = {
  inspection: {
    id: number; inspectionType: string; date: string; score: number | null;
    riskLevel: string | null; riskScore: string | null; aiSummary: string | null;
    status: string; createdAt: string;
  };
  project: { id: number; name: string } | null;
  inspector: { id: number; firstName: string; lastName: string } | null;
};

type AlertRow = {
  alert: { id: number; type: string; message: string; severity: string; isRead: boolean; createdAt: string };
  project: { id: number; name: string } | null;
  inspection: { id: number; inspectionType: string; date: string } | null;
};

type RiskDashData = {
  topRisk: InspectionRow[];
  alerts: { critical: number; high: number; medium: number; total: number };
  health: { critical: number; high: number; medium: number; low: number; avgRiskScore: number | null };
  trend: TrendPoint[];
};

type ComplianceDashRow = {
  project: { id: number; name: string; status: string };
  pending: number;
  pendingHigh: number;
  completed: number;
  dismissed: number;
  safetyStatus: "critical" | "warning" | "ok";
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function riskCfg(level?: string | null) {
  return RISK[(level as RLevel) ?? "Low"] ?? RISK.Low;
}

function RiskPill({ level }: { level?: string | null }) {
  if (!level) return <span className="text-xs text-zinc-500">—</span>;
  const cfg = riskCfg(level);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold" style={{ color: cfg.badgeText, background: cfg.badge }}>
      {level}
    </span>
  );
}

function ScoreBar({ score, riskLevel }: { score?: number | null; riskLevel?: string | null }) {
  if (score == null) return <span className="text-zinc-500 text-sm">—</span>;
  const color = riskCfg(riskLevel).color;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{score}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10 min-w-12">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent, isAlert = false, href,
}: { label: string; value: string | number; sub: string; icon: React.ElementType; accent: string; isAlert?: boolean; href?: string }) {
  const inner = (
    <Card
      className={`transition-all duration-150 ${href ? "cursor-pointer hover:brightness-110" : ""}`}
      style={{
        background: isAlert ? `${accent}0c` : BLACK,
        border: isAlert ? `1px solid ${accent}35` : "none",
        boxShadow: isAlert ? `0 4px 20px ${accent}20` : "0 4px 16px rgba(0,0,0,0.18)",
      }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {label}
        </CardTitle>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" style={{ color: isAlert ? accent : "#fff" }}>{value}</div>
        <p className="text-xs text-zinc-500 mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ── Risk Trend Chart ───────────────────────────────────────────────────────────

function RiskTrendChart({ trend }: { trend: TrendPoint[] }) {
  // Fill last 7 days (including days with no data)
  const filledDays = useMemo(() => {
    const map = new Map(trend.map((t) => [t.day, t]));
    return Array.from({ length: 7 }, (_, i) => {
      const day = format(subDays(new Date(), 6 - i), "yyyy-MM-dd");
      const existing = map.get(day);
      return {
        day,
        label: format(parseISO(day), "MMM d"),
        avgScore: existing?.avgScore ?? null,
        count: existing?.count ?? 0,
      };
    });
  }, [trend]);

  const hasData = filledDays.some((d) => d.avgScore != null);

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            Risk Score Trend — Last 7 Days
          </CardTitle>
          <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-44 text-zinc-600">
            <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No scored inspections in the last 7 days</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={filledDays} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#d4d4d4", fontWeight: 600 }}
                itemStyle={{ color: GOLD }}
                formatter={(val: any) => val == null ? ["No data", "Risk Score"] : [`${val}/10`, "Risk Score"]}
              />
              <ReferenceLine y={7} stroke="#ea580c" strokeDasharray="4 2" strokeOpacity={0.5} />
              <ReferenceLine y={9} stroke="#dc2626" strokeDasharray="4 2" strokeOpacity={0.5} />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke={GOLD}
                strokeWidth={2.5}
                dot={{ fill: GOLD, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: GOLD }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center gap-4 mt-2 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="inline-block h-px w-6 border-t border-dashed border-orange-500/50" /> High risk threshold (7)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-px w-6 border-t border-dashed border-red-500/50" /> Critical threshold (9)</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Top Risk Items ─────────────────────────────────────────────────────────────

function TopRiskSection({ rows }: { rows: InspectionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
        Highest Risk Right Now
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.slice(0, 6).map((row) => {
          const insp = row.inspection;
          const cfg = riskCfg(insp.riskLevel);
          const score = insp.riskScore ? parseFloat(insp.riskScore) : null;
          return (
            <Link href="/inspections" key={insp.id}>
              <div
                className="rounded-xl border p-4 cursor-pointer hover:brightness-110 transition-all group"
                style={{ background: cfg.bg, borderColor: cfg.border }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: cfg.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{insp.riskLevel}</span>
                  </div>
                  {score != null && (
                    <span className="text-sm font-bold tabular-nums" style={{ color: cfg.color }}>
                      {score.toFixed(1)}<span className="text-[10px] font-normal text-zinc-600">/10</span>
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-white capitalize mb-0.5">
                  {insp.inspectionType} Inspection
                </p>
                <p className="text-xs text-zinc-400 mb-2">{row.project?.name ?? "No project"}</p>
                {/* Score bar */}
                {score != null && (
                  <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: `${cfg.color}22` }}>
                    <div className="h-full rounded-full" style={{ width: `${(score / 10) * 100}%`, background: cfg.color }} />
                  </div>
                )}
                {/* AI summary */}
                {insp.aiSummary && (
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">{insp.aiSummary}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-zinc-600">{insp.date}</span>
                  {insp.score != null && (
                    <span className="text-[10px]">
                      Pass: <span className={`font-semibold ${insp.score >= 80 ? "text-green-500" : insp.score >= 60 ? "text-yellow-500" : "text-red-500"}`}>{insp.score}%</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Inspection Table ───────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

function InspectionTable({ rows }: { rows: InspectionRow[] }) {
  const [page, setPage] = useState(0);
  const [, setLocation] = useLocation();
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
            All Inspections
          </CardTitle>
          <span className="text-xs text-zinc-500">{rows.length} total</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Project</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Type</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Score</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Risk</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pageRows.map((row) => {
                const insp = row.inspection;
                return (
                  <tr
                    key={insp.id}
                    className="hover:bg-white/3 transition-colors cursor-pointer"
                    onClick={() => setLocation("/inspections")}
                  >
                    <td className="px-6 py-3">
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-36">{row.project?.name ?? "—"}</p>
                        {row.inspector && (
                          <p className="text-zinc-600 text-[10px]">{row.inspector.firstName} {row.inspector.lastName}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 capitalize text-sm">{insp.inspectionType}</td>
                    <td className="px-4 py-3 min-w-28">
                      <ScoreBar score={insp.score} riskLevel={insp.riskLevel} />
                    </td>
                    <td className="px-4 py-3"><RiskPill level={insp.riskLevel} /></td>
                    <td className="px-4 py-3 text-zinc-400 text-sm tabular-nums whitespace-nowrap">{insp.date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${insp.status === "submitted" ? "bg-green-900/40 text-green-400" : "bg-yellow-900/40 text-yellow-400"}`}>
                        {insp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href="/inspections">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-zinc-500 hover:text-white"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-zinc-600 text-sm">
                    No inspections yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/5">
            <span className="text-xs text-zinc-600">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="ghost"
                className="h-7 w-7 p-0 text-zinc-500 hover:text-white disabled:opacity-30"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                return (
                  <Button
                    key={pg} size="sm" variant="ghost"
                    className={`h-7 w-7 p-0 text-xs ${pg === page ? "text-white font-bold" : "text-zinc-500 hover:text-white"}`}
                    style={pg === page ? { color: GOLD } : {}}
                    onClick={() => setPage(pg)}
                  >
                    {pg + 1}
                  </Button>
                );
              })}
              <Button
                size="sm" variant="ghost"
                className="h-7 w-7 p-0 text-zinc-500 hover:text-white disabled:opacity-30"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Alerts Panel ───────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_COLOR: Record<string, string> = { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#6b7280" };

function AlertsPanel() {
  const qc = useQueryClient();
  const { data: alertRows = [], isLoading } = useQuery<AlertRow[]>({
    queryKey: ["inspection-alerts-risk-page"],
    queryFn: () => customFetch("/api/inspection-alerts"),
    refetchInterval: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: number) => customFetch(`/api/inspection-alerts/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection-alerts-risk-page"] }),
  });

  const markAll = useMutation({
    mutationFn: () => customFetch("/api/inspection-alerts/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection-alerts-risk-page"] }),
  });

  const sorted = [...alertRows].sort((a, b) => {
    const sa = a.alert?.severity ?? "";
    const sb = b.alert?.severity ?? "";
    const isReadDiff = Number(a.alert?.isRead) - Number(b.alert?.isRead);
    if (isReadDiff !== 0) return isReadDiff;
    return (SEV_ORDER[sa] ?? 9) - (SEV_ORDER[sb] ?? 9);
  });

  const unreadCount = alertRows.filter((r) => !r.alert?.isRead).length;

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
              Alerts
            </CardTitle>
            {unreadCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/60 text-red-400">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs text-zinc-500 hover:text-white px-2"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-zinc-600">
            <Bell className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
            {sorted.map((row) => {
              const a = row.alert;
              const color = SEV_COLOR[a.severity] ?? "#6b7280";
              return (
                <div
                  key={a.id}
                  className={`flex items-start gap-3 px-5 py-3 transition-opacity ${a.isRead ? "opacity-40" : ""}`}
                  style={!a.isRead ? { background: `${color}08` } : {}}
                >
                  {/* Severity dot */}
                  <div className="mt-1 flex-shrink-0 h-2 w-2 rounded-full" style={{ background: color }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] font-bold uppercase" style={{ color }}>
                        {a.severity}
                      </span>
                      {row.inspection && (
                        <span className="text-[10px] text-zinc-600 capitalize">
                          {row.inspection.inspectionType} · {row.inspection.date}
                        </span>
                      )}
                      {row.project && (
                        <span className="text-[10px] text-zinc-600">{row.project.name}</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-200 leading-snug">{a.message}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {format(new Date(a.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>

                  {!a.isRead && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-6 w-6 p-0 flex-shrink-0 text-zinc-600 hover:text-white"
                      onClick={() => markOne.mutate(a.id)}
                      disabled={markOne.isPending}
                      title="Mark as read"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── AI Compliance Monitor ──────────────────────────────────────────────────────

function ComplianceMonitorSection() {
  const { data: rows = [], isLoading } = useQuery<ComplianceDashRow[]>({
    queryKey: ["compliance-dashboard"],
    queryFn: () => customFetch("/api/compliance/dashboard"),
    refetchInterval: 90_000,
  });

  const statusCfg = {
    critical: { label: "Critical", color: "#dc2626", bg: "#1a000099", icon: AlertTriangle },
    warning:  { label: "Warning",  color: "#ca8a04", bg: "#1a120099", icon: Activity },
    ok:       { label: "OK",       color: "#16a34a", bg: "#00180099", icon: ShieldCheck },
  };

  return (
    <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: GOLD }}>
            <ShieldAlert className="h-4 w-4" style={{ color: GOLD }} />
            AI Compliance Monitor
          </CardTitle>
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
            Powered by AI Compliance Officer
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
            <ShieldCheck className="h-8 w-8 opacity-30" />
            <p className="text-sm">No active projects with compliance data.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row) => {
              const cfg = statusCfg[row.safetyStatus];
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={row.project.id}
                  className="flex items-center gap-3 py-3 group"
                  style={{ paddingLeft: 4, paddingRight: 4 }}
                >
                  {/* Status indicator */}
                  <div
                    className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}
                  >
                    <StatusIcon className="h-4 w-4" style={{ color: cfg.color }} />
                  </div>

                  {/* Project info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{row.project.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      {row.pending > 0 && (
                        <span className="text-[11px] text-zinc-500">
                          {row.pendingHigh > 0 && (
                            <span className="text-red-400 font-semibold">{row.pendingHigh} HIGH · </span>
                          )}
                          {row.pending} pending
                        </span>
                      )}
                      {row.completed > 0 && (
                        <span className="text-[11px] text-zinc-600">{row.completed} resolved</span>
                      )}
                    </div>
                  </div>

                  {/* Counts */}
                  <div className="hidden sm:flex items-center gap-4 text-center mr-2">
                    <div>
                      <div className="text-base font-bold" style={{ color: row.pendingHigh > 0 ? "#dc2626" : "#ca8a04" }}>
                        {row.pending}
                      </div>
                      <div className="text-[9px] uppercase tracking-widest text-zinc-600">Pending</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-green-500">{row.completed}</div>
                      <div className="text-[9px] uppercase tracking-widest text-zinc-600">Done</div>
                    </div>
                  </div>

                  {/* Audit export button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs flex-shrink-0"
                    style={{ borderColor: `${GOLD}50`, color: GOLD }}
                    onClick={() => {
                      window.location.href = `/api/projects/${row.project.id}/compliance/audit-export`;
                    }}
                    title="Download Ministry Audit Export PDF"
                  >
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Audit PDF</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function RiskDashboardInner() {
  const { data, isLoading } = useQuery<RiskDashData>({
    queryKey: ["risk-dashboard"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    refetchInterval: 60_000,
  });

  const { data: allRows = [], isLoading: loadingRows } = useQuery<InspectionRow[]>({
    queryKey: ["inspections"],
    queryFn: () => customFetch("/api/inspections"),
    refetchInterval: 60_000,
  });

  const health = data?.health;
  const total = health ? health.critical + health.high + health.medium + health.low : 0;
  const highRisk = health ? health.critical + health.high : 0;
  const avgScore = health?.avgRiskScore;

  const scoreColor =
    avgScore == null ? "#6b7280"
    : avgScore >= 8 ? "#dc2626"
    : avgScore >= 6 ? "#ea580c"
    : avgScore >= 4 ? "#ca8a04"
    : "#16a34a";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" style={{ color: GOLD }} />
            Risk Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time construction site risk overview · last 30 days
          </p>
        </div>
        <Link href="/inspections">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Manage Inspections
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Inspections" value={total} sub="last 30 days"
              icon={ShieldAlert} accent={GOLD} href="/inspections"
            />
            <StatCard
              label="High Risk Jobs" value={highRisk}
              sub={highRisk === 0 ? "All clear" : `${health?.critical ?? 0} critical · ${health?.high ?? 0} high`}
              icon={AlertTriangle} accent={highRisk > 0 ? "#ea580c" : GOLD} isAlert={highRisk > 0}
              href="/inspections"
            />
            <StatCard
              label="Critical Alerts" value={data?.alerts.critical ?? 0}
              sub={data?.alerts.critical ? "Requires immediate action" : "No critical alerts"}
              icon={Flame} accent={(data?.alerts.critical ?? 0) > 0 ? "#dc2626" : GOLD}
              isAlert={(data?.alerts.critical ?? 0) > 0}
              href="/inspections"
            />
            <StatCard
              label="Avg Risk Score"
              value={avgScore != null ? `${avgScore}/10` : "—"}
              sub={avgScore == null ? "No scored inspections" : avgScore >= 7 ? "Action recommended" : avgScore >= 4 ? "Monitor closely" : "Looking good"}
              icon={CircleDot} accent={scoreColor}
              href="/inspections"
            />
          </div>

          {/* Top risk items */}
          {data?.topRisk && data.topRisk.length > 0 && (
            <TopRiskSection rows={data.topRisk} />
          )}

          {/* AI Compliance Monitor */}
          <FeatureGuard feature="AI_COMPLIANCE" silent>
            <ComplianceMonitorSection />
          </FeatureGuard>

          {/* Chart + Alerts side by side */}
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <RiskTrendChart trend={data?.trend ?? []} />
            </div>
            <div className="lg:col-span-2">
              <AlertsPanel />
            </div>
          </div>

          {/* Distribution bar */}
          {total > 0 && (
            <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
              <CardContent className="py-4 px-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">30-Day Risk Distribution</span>
                  <span className="text-[10px] text-zinc-600">{total} inspections</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden gap-px">
                  {[
                    { key: "critical", count: health?.critical ?? 0, color: "#dc2626" },
                    { key: "high",     count: health?.high ?? 0,     color: "#ea580c" },
                    { key: "medium",   count: health?.medium ?? 0,   color: "#ca8a04" },
                    { key: "low",      count: health?.low ?? 0,      color: "#16a34a" },
                  ].filter((s) => s.count > 0).map((s) => (
                    <div
                      key={s.key}
                      style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
                      title={`${s.key}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  {[
                    { key: "Critical", count: health?.critical ?? 0, color: "#dc2626" },
                    { key: "High",     count: health?.high ?? 0,     color: "#ea580c" },
                    { key: "Medium",   count: health?.medium ?? 0,   color: "#ca8a04" },
                    { key: "Low",      count: health?.low ?? 0,      color: "#16a34a" },
                  ].filter((s) => s.count > 0).map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-[11px] text-zinc-500">
                        {s.key} <span className="text-zinc-300 font-semibold">{s.count}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inspection table */}
          {loadingRows ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : (
            <InspectionTable rows={allRows} />
          )}
        </>
      )}
    </div>
  );
}

export default function RiskDashboardPage() {
  return (
    <FeatureGuard feature="RISK_DASHBOARD">
      <RiskDashboardInner />
    </FeatureGuard>
  );
}
