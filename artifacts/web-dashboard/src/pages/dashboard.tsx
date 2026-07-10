import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetDashboardSmartSummary,
  useListNotifications,
  useGetNotificationsUnreadCount,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useGetMe,
  customFetch,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  FileText,
  MessageSquareWarning,
  Users,
  Activity,
  ChevronRight,
  BookUser,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Sparkles,
  Bell,
  Check,
  CheckCircle2,
  Flame,
  CircleDot,
  ArrowRight,
  Loader2,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { WeatherCard } from "@/components/WeatherCard";
import { Link } from "wouter";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAiErrorMessage } from "@/hooks/useApiError";

const GOLD = "#D4AF37";
const BLACK = "#111111";

// ── Risk config ────────────────────────────────────────────────────────────────

const RISK_CFG = {
  Critical: { color: "#dc2626", bg: "#1a0000", border: "#7f1d1d60", badge: "#fee2e2", badgeText: "#991b1b", label: "Critical", barColor: "#dc2626" },
  High:     { color: "#ea580c", bg: "#1a0900", border: "#7c2d1260", badge: "#ffedd5", badgeText: "#9a3412", label: "High",     barColor: "#ea580c" },
  Medium:   { color: "#ca8a04", bg: "#1a1200", border: "#78350f60", badge: "#fef9c3", badgeText: "#854d0e", label: "Medium",   barColor: "#ca8a04" },
  Low:      { color: "#16a34a", bg: "#001a09", border: "#14532d60", badge: "#dcfce7", badgeText: "#166534", label: "Low",      barColor: "#16a34a" },
} as const;

type RiskLevel = keyof typeof RISK_CFG;

type RiskDashboardData = {
  topRisk: {
    inspection: {
      id: number;
      inspectionType: string;
      date: string;
      riskLevel: RiskLevel | null;
      riskScore: string | null;
      aiSummary: string | null;
      score: number | null;
    };
    project: { id: number; name: string } | null;
    inspector: { id: number; firstName: string; lastName: string } | null;
  }[];
  alerts: { critical: number; high: number; medium: number; total: number };
  health: { critical: number; high: number; medium: number; low: number; avgRiskScore: number | null };
};

// ── Risk Status Section ───────────────────────────────────────────────────────
// Single source of truth for inspection risk on the dashboard: the rich "at
// risk" breakdown when there's something to flag, or one compact all-clear
// strip when every recent inspection came back low-risk. Never both at once.

function RiskStatusSection() {
  const { data, isLoading } = useQuery<RiskDashboardData>({
    queryKey: ["risk-dashboard"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return null;

  const { topRisk, alerts, health } = data;
  const totalInspected = health.critical + health.high + health.medium + health.low;
  if (totalInspected === 0) return null;

  if (topRisk.length === 0) {
    return (
      <Card className="bg-white" style={{ border: "1px solid rgba(22,163,74,0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <CardContent className="flex items-center justify-between py-3 px-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0" style={{ background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.3)" }}>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            </div>
            <p className="text-sm text-[#121212]">
              <span className="font-semibold">All inspections clear</span>
              <span className="text-[#888888]">
                {" "}· {totalInspected} inspection{totalInspected !== 1 ? "s" : ""}
                {health.avgRiskScore != null ? ` · avg score ${health.avgRiskScore}/10` : ""}
              </span>
            </p>
          </div>
          <Link href="/safety-compliance">
            <button className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const safeCount = health.low;
  const atRiskCount = health.critical + health.high + health.medium;
  const avgScore = health.avgRiskScore;

  const hasCritical = topRisk.some(r => r.inspection.riskLevel === "Critical");
  const headerColor = hasCritical ? "#dc2626" : "#ea580c";
  const headerBg = hasCritical ? "linear-gradient(135deg, #1a0000 0%, #0d0d0d 100%)" : "linear-gradient(135deg, #1a0900 0%, #0d0d0d 100%)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: headerBg, border: `1px solid ${hasCritical ? "#7f1d1d60" : "#7c2d1260"}`, boxShadow: `0 4px 32px ${headerColor}18` }}>
      {/* Header strip */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: `${headerColor}12`, borderBottom: `1px solid ${headerColor}25` }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${headerColor}22`, border: `1px solid ${headerColor}44` }}>
            <Flame className="h-3.5 w-3.5" style={{ color: headerColor }} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: headerColor }}>
            At Risk Right Now
          </span>
          {alerts.total > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${headerColor}22`, color: headerColor }}>
              {alerts.total} unread alert{alerts.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          {totalInspected > 0 && (
            <>
              <span><span className="font-semibold text-zinc-300">{atRiskCount}</span> at risk</span>
              <span><span className="font-semibold text-green-400">{safeCount}</span> clear</span>
              {avgScore != null && <span>Avg score <span className="font-semibold" style={{ color: avgScore >= 7 ? "#dc2626" : avgScore >= 5 ? "#ea580c" : "#ca8a04" }}>{avgScore}/10</span></span>}
            </>
          )}
          <Link href="/safety-compliance">
            <button className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
      </div>

      {/* Risk items grid */}
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${Math.min(topRisk.length, 3)}, 1fr)`, background: "#1a1a1a" }}>
        {topRisk.slice(0, 3).map((row) => {
          const insp = row.inspection;
          const lvl = (insp.riskLevel ?? "High") as RiskLevel;
          const cfg = RISK_CFG[lvl] ?? RISK_CFG.High;
          const score = insp.riskScore ? parseFloat(insp.riskScore) : null;
          const barPct = score != null ? (score / 10) * 100 : 0;

          return (
            <Link href="/safety-compliance" key={insp.id}>
              <div
                className="flex flex-col gap-2.5 p-4 cursor-pointer transition-all hover:brightness-110 h-full"
                style={{ background: cfg.bg }}
              >
                {/* Risk badge + score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {cfg.label} Risk
                    </span>
                  </div>
                  {score != null && (
                    <span className="text-xs font-bold tabular-nums" style={{ color: cfg.color }}>
                      {score.toFixed(1)}<span className="text-[10px] font-normal text-zinc-600">/10</span>
                    </span>
                  )}
                </div>

                {/* Title */}
                <div>
                  <p className="text-sm font-semibold text-white leading-tight capitalize">
                    {insp.inspectionType} Inspection
                  </p>
                  {row.project && (
                    <p className="text-xs text-zinc-400 mt-0.5">{row.project.name}</p>
                  )}
                  {!row.project && row.inspector && (
                    <p className="text-xs text-zinc-400 mt-0.5">{row.inspector.firstName} {row.inspector.lastName}</p>
                  )}
                </div>

                {/* Risk score bar */}
                {score != null && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: `${cfg.color}22` }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barPct}%`, background: cfg.color }}
                    />
                  </div>
                )}

                {/* AI summary preview */}
                {insp.aiSummary && (
                  <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "#9ca3af" }}>
                    {insp.aiSummary}
                  </p>
                )}

                {/* Date + inspection score */}
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-[10px] text-zinc-600">{insp.date}</span>
                  {insp.score != null && (
                    <span className="text-[10px] text-zinc-500">
                      Pass rate: <span className={`font-semibold ${insp.score >= 80 ? "text-green-500" : insp.score >= 60 ? "text-yellow-500" : "text-red-500"}`}>{insp.score}%</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Extra items (4th, 5th) as compact row */}
      {topRisk.length > 3 && (
        <div className="flex border-t border-white/5">
          {topRisk.slice(3, 5).map((row) => {
            const insp = row.inspection;
            const lvl = (insp.riskLevel ?? "Medium") as RiskLevel;
            const cfg = RISK_CFG[lvl] ?? RISK_CFG.Medium;
            const score = insp.riskScore ? parseFloat(insp.riskScore) : null;

            return (
              <Link href="/safety-compliance" key={insp.id} className="flex-1">
                <div
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:brightness-110 transition-all"
                  style={{ background: cfg.bg, borderRight: "1px solid #ffffff08" }}
                >
                  <CircleDot className="h-3.5 w-3.5 flex-shrink-0" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white capitalize truncate">{insp.inspectionType} Inspection</p>
                    {row.project && <p className="text-[10px] text-zinc-500 truncate">{row.project.name}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                    {score != null && <span className="text-[10px] text-zinc-500">{score.toFixed(1)}/10</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Alert severity chips (bottom) */}
      {alerts.total > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-white/5" style={{ background: "#0d0d0d" }}>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Unread Alerts</span>
          {alerts.critical > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#fee2e2", color: "#991b1b" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-red-600 inline-block" /> {alerts.critical} critical
            </span>
          )}
          {alerts.high > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#ffedd5", color: "#9a3412" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 inline-block" /> {alerts.high} high
            </span>
          )}
          {alerts.medium > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#fef9c3", color: "#854d0e" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 inline-block" /> {alerts.medium} medium
            </span>
          )}
          <Link href="/safety-compliance" className="ml-auto">
            <span className="text-[10px] font-semibold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
              Manage alerts →
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Foreman Briefing Card ─────────────────────────────────────────────────────

type BriefingLine =
  | { type: "section"; emoji: string; title: string }
  | { type: "bullet"; text: string }
  | { type: "text"; text: string };

function parseBriefing(text: string): BriefingLine[] {
  const lines: BriefingLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Section headers like "1. 🚨 Critical Alerts"
    const sectionMatch = line.match(/^\d+\.\s*([\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}⚠✅📅📉👷🛠🚨📋]+)\s*(.+)/u);
    if (sectionMatch) {
      lines.push({ type: "section", emoji: sectionMatch[1], title: sectionMatch[2] });
      continue;
    }
    // Bullets
    if (line.startsWith("- ") || line.startsWith("• ")) {
      lines.push({ type: "bullet", text: line.slice(2) });
      continue;
    }
    lines.push({ type: "text", text: line });
  }
  return lines;
}

const SEV_SECTION_COLOR: Record<string, string> = {
  "🚨": "#dc2626",
  "⚠️": "#ea580c",
  "⚠": "#ea580c",
  "🛠️": GOLD,
  "🛠": GOLD,
  "📅": "#60a5fa",
  "📉": "#f97316",
  "👷": "#a78bfa",
  "✅": "#22c55e",
};

function ForemanBriefingCard() {
  const qc = useQueryClient();
  const today = format(new Date(), "EEEE, MMMM d");
  const { toast } = useToast();

  const generate = useMutation({
    mutationKey: ["foreman-briefing"],
    mutationFn: (): Promise<{ briefing: string; generatedAt: string }> =>
      customFetch("/api/ai/foreman-briefing", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
    onSuccess: (data) => {
      qc.setQueryData(["foreman-briefing-cache"], data);
    },
    onError: (err) => {
      toast({ title: "Failed to generate briefing", description: getAiErrorMessage(err), variant: "destructive" });
    },
  });

  const cached = qc.getQueryData<{ briefing: string; generatedAt: string }>(["foreman-briefing-cache"]);
  const data = generate.data ?? cached;
  const lines = data ? parseBriefing(data.briefing) : [];

  let currentSectionColor = GOLD;

  return (
    <Card
      className="overflow-hidden"
      style={{ background: BLACK, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.22)" }}
    >
      <CardHeader className="pb-3" style={{ borderBottom: `1px solid ${GOLD}18` }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}40` }}
            >
              <ClipboardList className="h-4 w-4" style={{ color: GOLD }} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold" style={{ color: GOLD }}>
                Daily Foreman Briefing
              </CardTitle>
              <p className="text-[11px] text-zinc-500 mt-0.5">{today}</p>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs border"
            style={{ borderColor: `${GOLD}35`, color: GOLD }}
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {data ? "Refresh" : "Generate Briefing"}
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-4">
        {!data && !generate.isPending && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-3"
              style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}25` }}>
              <ClipboardList className="h-6 w-6" style={{ color: `${GOLD}b0` }} />
            </div>
            <p className="text-sm font-medium text-zinc-300 mb-1">Your AI briefing is ready to generate</p>
            <p className="text-xs text-zinc-600 max-w-xs">
              Get a concise, actionable summary of critical alerts, high-risk areas, and priority tasks for today.
            </p>
          </div>
        )}

        {generate.isPending && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
            <p className="text-sm text-zinc-500">Analyzing site data…</p>
          </div>
        )}

        {generate.isError && (
          <div className="text-center py-6">
            <p className="text-sm text-red-400">Failed to generate briefing. Please try again.</p>
          </div>
        )}

        {data && !generate.isPending && (
          <div className="space-y-1">
            {lines.map((line, i) => {
              if (line.type === "section") {
                currentSectionColor = SEV_SECTION_COLOR[line.emoji] ?? GOLD;
                return (
                  <div key={i} className="flex items-center gap-2 pt-3 pb-0.5 first:pt-0">
                    <span className="text-base leading-none">{line.emoji}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: currentSectionColor }}>
                      {line.title}
                    </span>
                  </div>
                );
              }
              if (line.type === "bullet") {
                return (
                  <div key={i} className="flex items-start gap-2 pl-6">
                    <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: currentSectionColor }} />
                    <p className="text-sm text-zinc-300 leading-relaxed">{line.text}</p>
                  </div>
                );
              }
              return (
                <p key={i} className="text-sm text-zinc-400 pl-6 leading-relaxed">{line.text}</p>
              );
            })}

            {data.generatedAt && (
              <p className="text-[10px] text-zinc-600 pt-3 border-t border-white/5 mt-3">
                Generated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })} · AI-generated · verify with your site data
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
// Shared card for the overview/financials grids. Kept deliberately quiet by
// default (neutral border, muted label) so the accent color is reserved for
// cards that are actually flagging something (alert=true).

type StatCardConfig = {
  href: string;
  label: string;
  value: string | number;
  sub: string;
  icon: LucideIcon;
  alert?: boolean;
};

function StatCard({ href, label, value, sub, icon: Icon, alert }: StatCardConfig) {
  const accent = alert ? "#EF4444" : GOLD;
  return (
    <Link href={href} className="block group">
      <Card
        className="cursor-pointer transition-all duration-150 hover:shadow-md bg-white"
        style={{
          border: alert ? "1.5px solid rgba(239,68,68,0.35)" : "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
          <CardTitle
            className={`text-[11px] uppercase tracking-wide ${alert ? "font-bold" : "font-semibold"}`}
            style={{ color: alert ? accent : "#9a9a9a" }}
          >
            {label}
          </CardTitle>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" style={{ color: alert ? accent : "#121212" }}>
            {value}
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#999999]">{sub}</p>
            <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wider text-[#999999] mb-2">{children}</p>;
}

function fmt(n: number, opts?: Intl.NumberFormatOptions) {
  return formatCurrency(n, { maximumFractionDigits: 0, ...opts });
}

export default function Dashboard() {
  const { data: me } = useGetMe();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { data: smartSummary } = useGetDashboardSmartSummary();
  const { data: notifications } = useListNotifications();
  const { data: unread } = useGetNotificationsUnreadCount();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const qc = useQueryClient();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  const handleMarkOne = (id: number) => {
    markOne.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/notifications"] });
        qc.invalidateQueries({ queryKey: ["/notifications/unread-count"] });
      },
    });
  };

  if (isLoadingSummary || isLoadingActivity) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard...</div>;
  }

  const overdueInvoices = summary?.overdueInvoices ?? 0;
  const overdueAmount = summary?.overdueInvoiceAmount ?? 0;
  const pipeline = summary?.revenuePipeline ?? 0;
  const activeLeads = summary?.activeLeads ?? 0;
  const unreadCount = unread?.count ?? 0;

  const overviewCards: StatCardConfig[] = [
    { href: "/projects", label: "Active Projects", value: summary?.activeProjects ?? 0, sub: `${summary?.totalProjects ?? 0} total`, icon: Building2 },
    { href: "/reports", label: "Reports This Week", value: summary?.reportsThisWeek || 0, sub: "Daily reports submitted", icon: FileText },
    { href: "/rfis", label: "Open RFIs", value: summary?.openRFIs || 0, sub: "Awaiting response", icon: MessageSquareWarning },
    { href: "/team", label: "Team Members", value: summary?.teamMemberCount || 0, sub: "Active in workspace", icon: Users },
    ...(isOwnerOrForeman ? [{ href: "/crm?tab=directory", label: "Total Contacts", value: summary?.totalContacts ?? 0, sub: "Clients, workers & suppliers", icon: BookUser }] : []),
  ];

  const financialCards: StatCardConfig[] = [
    { href: "/crm?tab=leads", label: "Revenue Pipeline", value: fmt(pipeline), sub: `${activeLeads} active lead${activeLeads !== 1 ? "s" : ""}`, icon: TrendingUp },
    {
      href: "/financials?tab=invoices",
      label: "Overdue Invoices",
      value: overdueInvoices > 0 ? fmt(overdueAmount) : "All clear",
      sub: overdueInvoices > 0 ? `${overdueInvoices} invoice${overdueInvoices !== 1 ? "s" : ""} past due` : "No overdue invoices",
      icon: overdueInvoices > 0 ? AlertTriangle : DollarSign,
      alert: overdueInvoices > 0,
    },
    { href: "/financials", label: "This Month's Spend", value: fmt(summary?.totalSpentThisMonth ?? 0), sub: `Budget: ${fmt(summary?.totalBudgetAllProjects ?? 0)}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#121212] flex items-center gap-2">
          <Activity className="h-6 w-6" style={{ color: GOLD }} />
          Dashboard
        </h1>
        <p className="text-sm text-[#121212]/60 font-medium">Overview of your company's projects and activities.</p>
      </div>

      {/* Daily Foreman Briefing — owners and foremen only */}
      {isOwnerOrForeman && <ForemanBriefingCard />}

      {/* Risk Status — owners/foremen only. Rich alert breakdown when something needs attention,
          otherwise a single compact all-clear strip. Never both. */}
      {isOwnerOrForeman && <RiskStatusSection />}

      {/* Smart Summary Banner — content is already scoped server-side to the caller's role/assignments */}
      {smartSummary && (
        <Card className="border-amber-200/40 bg-gradient-to-r from-amber-50/80 to-orange-50/60">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
              style={{ background: `${GOLD}22`, border: `1.5px solid ${GOLD}44` }}>
              <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Smart Insights</p>
              {smartSummary.summary ? (
                <p className="text-sm text-gray-700 leading-relaxed">{smartSummary.summary}</p>
              ) : (
                <p className="text-sm text-gray-500 leading-relaxed">No current insights for your assigned tasks.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview — Projects / Reports / RFIs / Team / Contacts */}
      <div>
        <SectionLabel>Overview</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {overviewCards.map((card) => <StatCard key={card.label} {...card} />)}
        </div>
      </div>

      {/* Financials — Revenue Pipeline / Overdue Invoices / This Month's Spend.
          Financial / company-wide metrics — owners and foremen only. */}
      {isOwnerOrForeman && (
        <div>
          <SectionLabel>Financials</SectionLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {financialCards.map((card) => <StatCard key={card.label} {...card} />)}
          </div>
        </div>
      )}

      {/* Activity — Recent Activity / Weather + Notifications */}
      <div>
        <SectionLabel>Activity</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 bg-white" style={{ border: "2px solid rgba(212,175,55,0.20)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <CardHeader>
              <CardTitle className="text-sm font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>Recent Activity</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                {activity?.length === 0 ? (
                  <div className="text-center text-sm text-[#888888] py-4 font-medium">No recent activity.</div>
                ) : (
                  activity?.map((item) => (
                    <div key={item.id} className="flex items-center">
                      <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ background: "rgba(212,175,55,0.10)", border: "1px solid rgba(212,175,55,0.20)" }}>
                        <Activity className="h-4 w-4" style={{ color: GOLD }} />
                      </div>
                      <div className="ml-4 space-y-0.5">
                        <p className="text-sm font-medium leading-none text-[#121212]">{item.description}</p>
                        <p className="text-xs text-[#888888] font-medium">
                          {item.userName} • {item.projectName && <span className="font-semibold text-[#121212]/70">{item.projectName} • </span>}
                          {format(new Date(item.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="col-span-3 flex flex-col gap-3">
            <WeatherCard />

            {/* Notifications Panel */}
            <Card className="bg-white" style={{ border: "2px solid rgba(212,175,55,0.20)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>Notifications</CardTitle>
                    {unreadCount > 0 && (
                      <Badge
                        className="h-5 min-w-5 text-[10px] font-bold px-1.5"
                        style={{ background: GOLD, color: "white", border: "none" }}
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-[#D4AF37] hover:text-[#b5922e]"
                      onClick={handleMarkAll}
                    >
                      Mark all read
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {!notifications || notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Bell className="h-8 w-8 mb-2" style={{ color: "rgba(212,175,55,0.40)" }} />
                    <p className="text-xs text-[#888888] font-medium">No notifications</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {notifications.slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors ${n.isRead ? "opacity-50" : ""}`}
                        style={!n.isRead ? { background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" } : {}}
                      >
                        <div
                          className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
                          style={{ background: n.isRead ? "#F0F0F0" : "rgba(212,175,55,0.12)" }}
                        >
                          <Bell className="h-3 w-3" style={{ color: n.isRead ? "#AAAAAA" : GOLD }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-tight text-[#121212]">{n.title}</p>
                          <p className="text-xs text-[#888888] mt-0.5 leading-tight font-medium">{n.body}</p>
                          <p className="text-[10px] text-[#AAAAAA] mt-0.5 font-medium">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!n.isRead && (
                          <button
                            className="flex-shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
                            onClick={() => handleMarkOne(n.id)}
                            title="Mark as read"
                          >
                            <Check className="h-3 w-3 text-zinc-500" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
