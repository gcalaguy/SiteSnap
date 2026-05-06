import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import Svg, { Polyline, Line, Circle as SvgCircle } from "react-native-svg";

// ── Types matching the ACTUAL API responses ───────────────────────────────────

type RiskDashboard = {
  topRisk: Array<{
    inspection: {
      id: number;
      inspectionType: string;
      date: string;
      riskLevel: string | null;
      riskScore: string | null;
      status: string;
    };
    project: { id: number; name: string } | null;
    inspector: { id: number; firstName: string | null; lastName: string | null } | null;
  }>;
  alerts: {
    critical: number;
    high: number;
    medium: number;
    total: number;
  };
  health: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    avgRiskScore: number | null;
  };
  trend: Array<{ day: string; avgScore: number; count: number }>;
};

// GET /api/inspection-alerts returns nested objects:
type AlertItem = {
  alert: {
    id: number;
    type: string;
    message: string;
    severity: string;
    isRead: boolean;
    createdAt: string;
    companyId: number;
    projectId: number | null;
    inspectionId: number;
  };
  project: { id: number; name: string } | null;
  inspection: { id: number; inspectionType: string; date: string } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  Low: "#16a34a",
  Medium: "#ca8a04",
  High: "#ea580c",
  Critical: "#dc2626",
};

const SEV_COLORS: Record<string, string> = {
  low: "#16a34a",
  medium: "#ca8a04",
  high: "#ea580c",
  critical: "#dc2626",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Trend Sparkline ───────────────────────────────────────────────────────────

function TrendChart({ data, colors }: { data: RiskDashboard["trend"]; colors: any }) {
  if (!Array.isArray(data) || data.length < 2) return null;

  const W = 300;
  const H = 72;
  const PAD = 8;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const scores = data.map((d) => d.avgScore);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 10;

  const toX = (i: number) => PAD + (i / (data.length - 1)) * innerW;
  const toY = (s: number) => PAD + innerH - ((s - minScore) / range) * innerH;

  const pts = data.map((d, i) => `${toX(i)},${toY(d.avgScore)}`).join(" ");
  const lastPt = data[data.length - 1];
  const lastX = toX(data.length - 1);
  const lastY = toY(lastPt.avgScore);
  const trend = data.length >= 2 ? lastPt.avgScore - data[0].avgScore : 0;
  const trendColor = trend <= 0 ? "#16a34a" : "#dc2626";

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>7-Day Risk Trend</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name={trend <= 0 ? "trending-down" : "trending-up"} size={14} color={trendColor} />
          <Text style={{ fontSize: 12, color: trendColor, fontFamily: "Inter_600SemiBold" }}>
            {trend > 0 ? "+" : ""}{trend.toFixed(1)} pts
          </Text>
        </View>
      </View>

      <Svg width={W} height={H} style={{ alignSelf: "center" }}>
        <Line x1={PAD} y1={toY(50)} x2={W - PAD} y2={toY(50)} stroke={colors.border} strokeWidth={1} strokeDasharray="4,4" />
        <Polyline
          points={pts}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <SvgCircle cx={lastX} cy={lastY} r={4} fill={colors.primary} />
      </Svg>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{data[0]?.day?.slice(5) ?? ""}</Text>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{lastPt.day?.slice(5) ?? ""}</Text>
      </View>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, colors }: {
  label: string; value: string | number; icon: string; color: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ── Top Inspection Row ────────────────────────────────────────────────────────

function InspectionRow({ item, colors }: { item: RiskDashboard["topRisk"][number]; colors: any }) {
  const insp = item.inspection;
  const project = item.project;
  const riskColor = RISK_COLORS[insp.riskLevel ?? ""] ?? "#6b7280";

  return (
    <View style={[styles.inspRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.inspType, { color: colors.foreground }]}>
          {(insp.inspectionType ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </Text>
        {project?.name ? (
          <Text style={[styles.inspMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {project.name}
          </Text>
        ) : null}
        <Text style={[styles.inspDate, { color: colors.mutedForeground }]}>{insp.date}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {insp.riskLevel ? (
          <View style={[styles.riskBadge, { backgroundColor: `${riskColor}18`, borderColor: `${riskColor}40` }]}>
            <Text style={[styles.riskBadgeText, { color: riskColor }]}>{insp.riskLevel}</Text>
          </View>
        ) : null}
        {insp.riskScore != null ? (
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
            {parseFloat(insp.riskScore as any).toFixed(0)}/100
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Alert Row (uses nested AlertItem shape) ───────────────────────────────────

function AlertRow({ item, canAct, onMarkRead, colors }: {
  item: AlertItem;
  canAct: boolean;
  onMarkRead: () => void;
  colors: any;
}) {
  const a = item.alert;
  const sevColor = SEV_COLORS[a.severity] ?? "#6b7280";

  return (
    <View style={[styles.alertRow, {
      backgroundColor: a.isRead ? colors.card : `${sevColor}08`,
      borderColor: colors.border,
    }]}>
      <View style={[styles.alertDot, { backgroundColor: a.isRead ? colors.muted : sevColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.alertMsg,
          { color: a.isRead ? colors.mutedForeground : colors.foreground, fontFamily: a.isRead ? "Inter_400Regular" : "Inter_500Medium" },
        ]} numberOfLines={2}>
          {a.message}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {item.project?.name ? (
            <Text style={[styles.alertMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.project.name}
            </Text>
          ) : null}
          {item.inspection?.inspectionType ? (
            <Text style={[styles.alertMeta, { color: colors.mutedForeground }]}>
              · {item.inspection.inspectionType.replace(/_/g, " ")}
            </Text>
          ) : null}
          <Text style={[styles.alertMeta, { color: colors.mutedForeground }]}>{timeAgo(a.createdAt)}</Text>
        </View>
      </View>
      {canAct && !a.isRead ? (
        <Pressable onPress={onMarkRead} style={[styles.readBtn, { borderColor: colors.border }]} hitSlop={8}>
          <Feather name="check" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RiskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const { data: dashData, isLoading, refetch } = useQuery<RiskDashboard>({
    queryKey: ["risk-dashboard-mobile"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });

  // Separate query for the actual alerts list (nested shape)
  const { data: alertsRaw, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<AlertItem[]>({
    queryKey: ["inspection-alerts-mobile"],
    queryFn: () => customFetch("/api/inspection-alerts"),
    staleTime: 60_000,
  });

  // Mark-read uses PATCH (not POST)
  const markRead = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/inspection-alerts/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inspection-alerts-mobile"] });
      void qc.invalidateQueries({ queryKey: ["risk-dashboard-mobile"] });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleRefresh = () => { refetch(); refetchAlerts(); };

  // Safely coerce all data (never rely on default param values with React Compiler)
  const health = dashData?.health;
  const trend = Array.isArray(dashData?.trend) ? dashData!.trend : [];
  const topRisk = Array.isArray(dashData?.topRisk) ? dashData!.topRisk : [];
  const alertCounts = dashData?.alerts ?? { critical: 0, high: 0, medium: 0, total: 0 };
  const alertsList: AlertItem[] = Array.isArray(alertsRaw) ? alertsRaw : [];

  const unreadAlerts = alertsList.filter((item) => !item.alert.isRead);
  const displayedAlerts = showAllAlerts ? alertsList : alertsList.slice(0, 5);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading || alertsLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.55)" }]}>Site Snap</Text>
          <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Risk Dashboard</Text>
        </View>
        {alertCounts.total > 0 ? (
          <View style={[styles.alertBadge, { backgroundColor: alertCounts.critical > 0 ? "#DC2626" : "#EA580C" }]}>
            <Text style={styles.alertBadgeText}>
              {alertCounts.total} alert{alertCounts.total !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <>
          {/* ── Stat cards ── */}
          <View style={styles.statsGrid}>
            <StatCard
              label="Avg Risk Score"
              value={health?.avgRiskScore != null ? `${Number(health.avgRiskScore).toFixed(1)}/100` : "—"}
              icon="activity"
              color="#dc2626"
              colors={colors}
            />
            <StatCard
              label="Critical"
              value={health?.critical ?? 0}
              icon="alert-triangle"
              color="#dc2626"
              colors={colors}
            />
            <StatCard
              label="High Risk"
              value={health?.high ?? 0}
              icon="alert-circle"
              color="#ea580c"
              colors={colors}
            />
            <StatCard
              label="Unread Alerts"
              value={unreadAlerts.length}
              icon="bell"
              color="#ca8a04"
              colors={colors}
            />
          </View>

          {/* Alert severity summary strip */}
          {alertCounts.total > 0 && (
            <View style={[styles.severityStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {alertCounts.critical > 0 ? (
                <View style={styles.severityItem}>
                  <View style={[styles.severityDot, { backgroundColor: "#dc2626" }]} />
                  <Text style={{ fontSize: 12, color: "#dc2626", fontFamily: "Inter_600SemiBold" }}>
                    {alertCounts.critical} Critical
                  </Text>
                </View>
              ) : null}
              {alertCounts.high > 0 ? (
                <View style={styles.severityItem}>
                  <View style={[styles.severityDot, { backgroundColor: "#ea580c" }]} />
                  <Text style={{ fontSize: 12, color: "#ea580c", fontFamily: "Inter_600SemiBold" }}>
                    {alertCounts.high} High
                  </Text>
                </View>
              ) : null}
              {alertCounts.medium > 0 ? (
                <View style={styles.severityItem}>
                  <View style={[styles.severityDot, { backgroundColor: "#ca8a04" }]} />
                  <Text style={{ fontSize: 12, color: "#ca8a04", fontFamily: "Inter_600SemiBold" }}>
                    {alertCounts.medium} Medium
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── Trend chart ── */}
          {trend.length >= 2 ? (
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <TrendChart data={trend} colors={colors} />
            </View>
          ) : null}

          {/* ── Top risk inspections ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Risk Items</Text>
              {topRisk.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: "#fee2e2" }]}>
                  <Text style={{ fontSize: 11, color: "#dc2626", fontFamily: "Inter_700Bold" }}>
                    {topRisk.filter((i) => i.inspection.riskLevel === "Critical" || i.inspection.riskLevel === "High").length} High+
                  </Text>
                </View>
              ) : null}
            </View>

            {topRisk.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check-circle" size={28} color="#16a34a" />
                <Text style={[styles.emptyText, { color: colors.foreground }]}>No high-risk items</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  All recent inspections are within acceptable limits.
                </Text>
              </View>
            ) : (
              topRisk.map((item) => (
                <InspectionRow key={item.inspection.id} item={item} colors={colors} />
              ))
            )}
          </View>

          {/* ── Alerts feed ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Alerts</Text>
              {unreadAlerts.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: `${colors.primary}20` }]}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_700Bold" }}>
                    {unreadAlerts.length} unread
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>All read</Text>
              )}
            </View>

            {/* Workers: read-only notice */}
            {!isOwnerOrForeman ? (
              <View style={[styles.readonlyBanner, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                <Feather name="eye" size={14} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium", flex: 1 }}>
                  View only — contact your foreman to action alerts
                </Text>
              </View>
            ) : null}

            {alertsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
            ) : alertsList.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="bell-off" size={24} color={colors.mutedForeground} />
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>No alerts at this time</Text>
              </View>
            ) : (
              <>
                {displayedAlerts.map((item) => (
                  <AlertRow
                    key={String(item.alert.id)}
                    item={item}
                    canAct={isOwnerOrForeman}
                    onMarkRead={() => markRead.mutate(item.alert.id)}
                    colors={colors}
                  />
                ))}
                {alertsList.length > 5 ? (
                  <Pressable
                    onPress={() => setShowAllAlerts((v) => !v)}
                    style={[styles.showMoreBtn, { borderColor: colors.border }]}
                  >
                    <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                      {showAllAlerts ? "Show less" : `Show all ${alertsList.length} alerts`}
                    </Text>
                    <Feather name={showAllAlerts ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginTop: 2 },
  alertBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-end",
    marginBottom: 4,
  },
  alertBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFFFFF" },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
  },
  statCard: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },

  severityStrip: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  severityItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },

  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 4,
    overflow: "hidden",
  },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  countBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  inspRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  inspType: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inspMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  inspDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  riskBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  alertMsg: { fontSize: 13, lineHeight: 18 },
  alertMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  readBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  readonlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },

  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },

  emptyBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
