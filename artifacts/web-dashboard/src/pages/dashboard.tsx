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
  ShieldAlert,
  Flame,
  CircleDot,
  ArrowRight,
  Loader2,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { WeatherCard } from "@/components/WeatherCard";
import { Link } from "wouter";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

const GOLD = "#C9A84C";
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

// ── Risk Hero Section ─────────────────────────────────────────────────────────

function RiskHeroSection() {
  const { data, isLoading } = useQuery<RiskDashboardData>({
    queryKey: ["risk-dashboard"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading) return null;
  if (!data || data.topRisk.length === 0) return null;

  const { topRisk, alerts, health } = data;
  const totalInspected = health.critical + health.high + health.medium + health.low;
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
          <Link href="/inspections">
            <button className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
      </div>

      {/* Risk items grid */}
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${Math.min(topRisk.length, 3)}, 1fr)`, background: "#1a1a1a" }}>
        {topRisk.slice(0, 3).map((row, i) => {
          const insp = row.inspection;
          const lvl = (insp.riskLevel ?? "High") as RiskLevel;
          const cfg = RISK_CFG[lvl] ?? RISK_CFG.High;
          const score = insp.riskScore ? parseFloat(insp.riskScore) : null;
          const barPct = score != null ? (score / 10) * 100 : 0;

          return (
            <Link href="/inspections" key={insp.id}>
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
              <Link href="/inspections" key={insp.id} className="flex-1">
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
          <Link href="/inspections" className="ml-auto">
            <span className="text-[10px] font-semibold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
              Manage alerts →
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Risk Overview Cards ───────────────────────────────────────────────────────

type RiskCard = {
  label: string;
  value: string | number;
  sub: string;
  iconName: "shield" | "triangle" | "flame" | "dot";
  accent: string;
  isAlert: boolean;
};

function RiskCardIcon({ name, color }: { name: RiskCard["iconName"]; color: string }) {
  if (name === "shield") return <ShieldAlert className="h-4 w-4" style={{ color }} />;
  if (name === "triangle") return <AlertTriangle className="h-4 w-4" style={{ color }} />;
  if (name === "flame") return <Flame className="h-4 w-4" style={{ color }} />;
  return <CircleDot className="h-4 w-4" style={{ color }} />;
}

function RiskOverviewCards({ data }: { data: RiskDashboardData }) {
  const { health, alerts } = data;
  const total = health.critical + health.high + health.medium + health.low;
  const highRiskJobs = health.high + health.critical;
  const avgScore = health.avgRiskScore;

  const scoreColor =
    avgScore == null ? "#6b7280"
    : avgScore >= 8 ? "#dc2626"
    : avgScore >= 6 ? "#ea580c"
    : avgScore >= 4 ? "#ca8a04"
    : "#16a34a";

  const cards: RiskCard[] = [
    {
      label: "Total Inspections",
      value: total,
      sub: "last 30 days",
      iconName: "shield",
      accent: GOLD,
      isAlert: false,
    },
    {
      label: "High Risk Jobs",
      value: highRiskJobs,
      sub: highRiskJobs === 0 ? "All clear" : `${health.critical} critical · ${health.high} high`,
      iconName: "triangle",
      accent: highRiskJobs > 0 ? "#ea580c" : GOLD,
      isAlert: highRiskJobs > 0,
    },
    {
      label: "Critical Alerts",
      value: alerts.critical,
      sub: alerts.critical === 0 ? "No critical alerts" : "Requires immediate action",
      iconName: "flame",
      accent: alerts.critical > 0 ? "#dc2626" : GOLD,
      isAlert: alerts.critical > 0,
    },
    {
      label: "Avg Risk Score",
      value: avgScore != null ? `${avgScore}/10` : "—",
      sub: avgScore == null ? "No scored inspections" : avgScore >= 7 ? "Action recommended" : avgScore >= 4 ? "Monitor closely" : "Looking good",
      iconName: "dot",
      accent: scoreColor,
      isAlert: false,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Link href="/inspections" key={card.label} className="block group">
          <Card
            className="cursor-pointer transition-all duration-150 hover:shadow-xl"
            style={{
              background: card.isAlert ? `${card.accent}0a` : BLACK,
              border: card.isAlert ? `1px solid ${card.accent}30` : "none",
              boxShadow: card.isAlert
                ? `0 4px 16px ${card.accent}18`
                : "0 4px 16px rgba(0,0,0,0.18)",
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: card.accent }}>
                {card.label}
              </CardTitle>
              <RiskCardIcon name={card.iconName} color={card.accent} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color: card.isAlert ? card.accent : "#fff" }}>
                {card.value}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">{card.sub}</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: card.accent }} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ── Health bar (30-day) ───────────────────────────────────────────────────────

function RiskHealthBar({ health }: { health: RiskDashboardData["health"] }) {
  const total = health.critical + health.high + health.medium + health.low;
  if (total === 0) return null;

  const segments = [
    { key: "critical", count: health.critical, color: "#dc2626", label: "Critical" },
    { key: "high",     count: health.high,     color: "#ea580c", label: "High" },
    { key: "medium",   count: health.medium,   color: "#ca8a04", label: "Medium" },
    { key: "low",      count: health.low,       color: "#16a34a", label: "Low" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">30-Day Risk Distribution</span>
        <span className="text-[10px] text-zinc-600">{total} inspections</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.filter(s => s.count > 0).map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {segments.filter(s => s.count > 0).map(s => (
          <div key={s.key} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full inline-block" style={{ background: s.color }} />
            <span className="text-[10px] text-zinc-500">{s.label} <span className="text-zinc-400 font-medium">{s.count}</span></span>
          </div>
        ))}
      </div>
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

  const generate = useMutation({
    mutationKey: ["foreman-briefing"],
    mutationFn: (): Promise<{ briefing: string; generatedAt: string }> =>
      customFetch("/api/ai/foreman-briefing", { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["foreman-briefing-cache"], data);
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
              <ClipboardList className="h-6 w-6" style={{ color: `${GOLD}80` }} />
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

function fmt(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
    ...opts,
  }).format(n);
}

export default function Dashboard() {
  const { data: me } = useGetMe();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { data: smartSummary } = useGetDashboardSmartSummary();
  const { data: notifications } = useListNotifications();
  const { data: unread } = useGetNotificationsUnreadCount();
  const { data: riskData } = useQuery<RiskDashboardData>({
    queryKey: ["risk-dashboard"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    refetchInterval: 60_000,
  });
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

  const overdueInvoices = (summary as any)?.overdueInvoices ?? 0;
  const overdueAmount = (summary as any)?.overdueInvoiceAmount ?? 0;
  const pipeline = (summary as any)?.revenuePipeline ?? 0;
  const activeLeads = (summary as any)?.activeLeads ?? 0;
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your company's projects and activities.</p>
      </div>

      {/* Daily Foreman Briefing — owners and foremen only */}
      {isOwnerOrForeman && <ForemanBriefingCard />}

      {/* Risk Hero — only for owners/foremen when there are high/critical inspections */}
      {isOwnerOrForeman && <RiskHeroSection />}

      {/* Risk Overview Cards — always visible to owners/foremen if any inspections exist */}
      {isOwnerOrForeman && riskData && (riskData.health.critical + riskData.health.high + riskData.health.medium + riskData.health.low) > 0 && (
        <RiskOverviewCards data={riskData} />
      )}

      {/* Smart Summary Banner */}
      {smartSummary?.summary && (
        <Card className="border-amber-200/40 bg-gradient-to-r from-amber-50/80 to-orange-50/60">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
              style={{ background: `${GOLD}22`, border: `1.5px solid ${GOLD}44` }}>
              <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Smart Insights</p>
              <p className="text-sm text-gray-700 leading-relaxed">{smartSummary.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards Row 1 — Projects / Reports / RFIs / Team / Contacts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Link href="/projects" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Active Projects</CardTitle>
              <Building2 className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.activeProjects ?? 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">
                  {summary?.totalProjects ?? 0} total
                </p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Reports This Week</CardTitle>
              <FileText className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.reportsThisWeek || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Daily reports submitted</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/rfis" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Open RFIs</CardTitle>
              <MessageSquareWarning className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.openRFIs || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Awaiting response</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/team" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Team Members</CardTitle>
              <Users className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{summary?.teamMemberCount || 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Active in workspace</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/contacts" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Total Contacts</CardTitle>
              <BookUser className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{(summary as any)?.totalContacts ?? 0}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">Clients, workers &amp; suppliers</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Insight Cards Row 2 — Revenue Pipeline / Overdue Invoices / This Month's Spend */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/leads" className="block group">
          <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Revenue Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4" style={{ color: GOLD }} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{fmt(pipeline)}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">{activeLeads} active lead{activeLeads !== 1 ? "s" : ""}</p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/invoices" className="block group">
          <Card
            className="cursor-pointer transition-all duration-150 hover:shadow-xl"
            style={{
              background: overdueInvoices > 0 ? "#2a0a0a" : BLACK,
              border: overdueInvoices > 0 ? "1px solid #7f1d1d44" : "none",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: overdueInvoices > 0 ? "#f87171" : GOLD }}
              >
                Overdue Invoices
              </CardTitle>
              {overdueInvoices > 0
                ? <AlertTriangle className="h-4 w-4 text-red-400" />
                : <DollarSign className="h-4 w-4" style={{ color: GOLD }} />
              }
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color: overdueInvoices > 0 ? "#f87171" : "#fff" }}>
                {overdueInvoices > 0 ? fmt(overdueAmount) : "All clear"}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">
                  {overdueInvoices > 0 ? `${overdueInvoices} invoice${overdueInvoices !== 1 ? "s" : ""} past due` : "No overdue invoices"}
                </p>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: overdueInvoices > 0 ? "#f87171" : GOLD }} />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="cursor-pointer transition-all duration-150 hover:shadow-xl" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>This Month's Spend</CardTitle>
            <DollarSign className="h-4 w-4" style={{ color: GOLD }} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{fmt(summary?.totalSpentThisMonth ?? 0)}</div>
            <div className="mt-1">
              <p className="text-xs text-zinc-500">Budget: {fmt(summary?.totalBudgetAllProjects ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row — Activity / Notifications + Weather */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4" style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Recent Activity</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              {activity?.length === 0 ? (
                <div className="text-center text-sm text-zinc-500 py-4">No recent activity.</div>
              ) : (
                activity?.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}33` }}>
                      <Activity className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="ml-4 space-y-0.5">
                      <p className="text-sm font-medium leading-none text-white">{item.description}</p>
                      <p className="text-xs text-zinc-500">
                        {item.userName} • {item.projectName && <span className="font-semibold text-zinc-400">{item.projectName} • </span>}
                        {format(new Date(item.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="col-span-3 flex flex-col gap-4">
          <WeatherCard />

          {/* Notifications Panel */}
          <Card style={{ background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Notifications</CardTitle>
                  {unreadCount > 0 && (
                    <Badge
                      className="h-5 min-w-5 text-[10px] font-bold px-1.5"
                      style={{ background: GOLD, color: BLACK, border: "none" }}
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    style={{ color: GOLD }}
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
                  <Bell className="h-8 w-8 mb-2" style={{ color: `${GOLD}40` }} />
                  <p className="text-xs text-zinc-600">No notifications</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {notifications.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors ${n.isRead ? "opacity-50" : ""}`}
                      style={!n.isRead ? { background: `${GOLD}10`, border: `1px solid ${GOLD}22` } : {}}
                    >
                      <div
                        className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
                        style={{ background: n.isRead ? "#1f1f1f" : `${GOLD}22` }}
                      >
                        <Bell className="h-3 w-3" style={{ color: n.isRead ? "#555" : GOLD }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight text-white">{n.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 leading-tight">{n.body}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">
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
  );
}
