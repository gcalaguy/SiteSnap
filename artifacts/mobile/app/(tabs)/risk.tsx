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

// ── Types ──────────────────────────────────────────────────────────────────────

type RiskStats = {
  avgRiskScore: number;
  criticalCount: number;
  highCount: number;
  totalInspections: number;
  activeAlerts: number;
};

type TrendPoint = { date: string; score: number };

type TopInspection = {
  id: number;
  inspectionType: string;
  date: string;
  riskLevel: string | null;
  riskScore: string | null;
  score: number | null;
  projectName: string | null;
};

type Alert = {
  id: number;
  type: string;
  message: string;
  severity: string;
  isRead: boolean;
  createdAt: string;
  projectName: string | null;
  inspectionType: string | null;
};

type RiskDashboard = {
  stats: RiskStats;
  trend: TrendPoint[];
  topRiskInspections: TopInspection[];
  alerts: Alert[];
};

// ── Colour maps ────────────────────────────────────────────────────────────────

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

// ── Mini trend sparkline ───────────────────────────────────────────────────────

function TrendChart({ data, colors }: { data: TrendPoint[]; colors: any }) {
  if (!data || data.length < 2) return null;

  const W = 300;
  const H = 72;
  const PAD = 8;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const scores = data.map((d) => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 10;

  const toX = (i: number) => PAD + (i / (data.length - 1)) * innerW;
  const toY = (s: number) => PAD + innerH - ((s - minScore) / range) * innerH;

  const pts = data.map((d, i) => `${toX(i)},${toY(d.score)}`).join(" ");
  const lastPt = data[data.length - 1];
  const lastX = toX(data.length - 1);
  const lastY = toY(lastPt.score);
  const trend = data.length >= 2 ? lastPt.score - data[0].score : 0;
  const trendColor = trend <= 0 ? "#16a34a" : "#dc2626";

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>7-Day Risk Trend</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name={trend <= 0 ? "trending-down" : "trending-up"} size={14} color={trendColor} />
          <Text style={{ fontSize: 12, color: trendColor, fontFamily: "Inter_600SemiBold" }}>
            {trend > 0 ? "+" : ""}{trend.toFixed(0)} pts
          </Text>
        </View>
      </View>

      <Svg width={W} height={H} style={{ alignSelf: "center" }}>
        <Polyline
          points={pts}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Line x1={PAD} y1={toY(50)} x2={W - PAD} y2={toY(50)} stroke={colors.border} strokeWidth={1} strokeDasharray="4,4" />
        <SvgCircle cx={lastX} cy={lastY} r={4} fill={colors.primary} />
      </Svg>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{data[0]?.date?.slice(5) ?? ""}</Text>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{lastPt.date?.slice(5) ?? ""}</Text>
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

function InspectionRow({ insp, colors }: { insp: TopInspection; colors: any }) {
  const riskColor = RISK_COLORS[insp.riskLevel ?? ""] ?? "#6b7280";
  return (
    <View style={[styles.inspRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.inspType, { color: colors.foreground }]}>
          {insp.inspectionType.charAt(0).toUpperCase() + insp.inspectionType.slice(1)}
        </Text>
        {insp.projectName ? (
          <Text style={[styles.inspMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{insp.projectName}</Text>
        ) : null}
        <Text style={[styles.inspDate, { color: colors.mutedForeground }]}>{insp.date}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {insp.riskLevel ? (
          <View style={[styles.riskBadge, { backgroundColor: `${riskColor}18`, borderColor: `${riskColor}40` }]}>
            <Text style={[styles.riskBadgeText, { color: riskColor }]}>{insp.riskLevel}</Text>
          </View>
        ) : null}
        {insp.score != null ? (
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{insp.score}/100</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, canAct, onMarkRead, colors }: {
  alert: Alert;
  canAct: boolean;
  onMarkRead: () => void;
  colors: any;
}) {
  const sevColor = SEV_COLORS[alert.severity] ?? "#6b7280";

  return (
    <View style={[styles.alertRow, { backgroundColor: alert.isRead ? colors.card : `${sevColor}08`, borderColor: colors.border }]}>
      <View style={[styles.alertDot, { backgroundColor: alert.isRead ? colors.muted : sevColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.alertMsg, { color: alert.isRead ? colors.mutedForeground : colors.foreground, fontFamily: alert.isRead ? "Inter_400Regular" : "Inter_500Medium" }]} numberOfLines={2}>
          {alert.message}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
          {alert.projectName ? (
            <Text style={[styles.alertMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{alert.projectName}</Text>
          ) : null}
          <Text style={[styles.alertMeta, { color: colors.mutedForeground }]}>{timeAgo(alert.createdAt)}</Text>
        </View>
      </View>
      {canAct && !alert.isRead ? (
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

  const { data, isLoading, refetch } = useQuery<RiskDashboard>({
    queryKey: ["risk-dashboard-mobile"],
    queryFn: () => customFetch("/api/risk-dashboard"),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/inspection-alerts/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-dashboard-mobile"] });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const stats = data?.stats;
  const trend = data?.trend ?? [];
  const topRisk = data?.topRiskInspections ?? [];
  const alerts = data?.alerts ?? [];
  const unreadAlerts = alerts.filter((a) => !a.isRead);
  const displayedAlerts = showAllAlerts ? alerts : alerts.slice(0, 5);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.55)" }]}>Site Snap</Text>
          <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Risk Dashboard</Text>
        </View>
        {unreadAlerts.length > 0 ? (
          <View style={[styles.alertBadge, { backgroundColor: "#DC2626" }]}>
            <Text style={styles.alertBadgeText}>{unreadAlerts.length} alert{unreadAlerts.length !== 1 ? "s" : ""}</Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <View style={styles.statsGrid}>
            <StatCard
              label="Avg Risk Score"
              value={stats?.avgRiskScore != null ? `${stats.avgRiskScore.toFixed(1)}/10` : "—"}
              icon="activity"
              color="#dc2626"
              colors={colors}
            />
            <StatCard
              label="Critical Items"
              value={stats?.criticalCount ?? "—"}
              icon="alert-triangle"
              color="#ea580c"
              colors={colors}
            />
            <StatCard
              label="Active Alerts"
              value={stats?.activeAlerts ?? unreadAlerts.length}
              icon="bell"
              color="#ca8a04"
              colors={colors}
            />
            <StatCard
              label="Inspections"
              value={stats?.totalInspections ?? topRisk.length}
              icon="shield"
              color={colors.primary}
              colors={colors}
            />
          </View>

          {/* ── Trend Chart ── */}
          {trend.length >= 2 ? (
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <TrendChart data={trend} colors={colors} />
            </View>
          ) : null}

          {/* ── Top Risk Inspections ── */}
          {topRisk.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Risk Items</Text>
                <View style={[styles.sevBadge, { backgroundColor: "#fee2e2" }]}>
                  <Text style={{ fontSize: 11, color: "#dc2626", fontFamily: "Inter_700Bold" }}>
                    {topRisk.filter((i) => i.riskLevel === "Critical" || i.riskLevel === "High").length} Critical/High
                  </Text>
                </View>
              </View>
              {topRisk.slice(0, 8).map((insp) => (
                <InspectionRow key={insp.id} insp={insp} colors={colors} />
              ))}
            </View>
          ) : (
            <View style={styles.section}>
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check-circle" size={28} color="#16a34a" />
                <Text style={[styles.emptyText, { color: colors.foreground }]}>No high-risk items</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>All recent inspections are within acceptable limits.</Text>
              </View>
            </View>
          )}

          {/* ── Alerts Feed ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Alerts</Text>
              {unreadAlerts.length > 0 ? (
                <View style={[styles.sevBadge, { backgroundColor: `${colors.primary}20` }]}>
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
                <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium" }}>
                  View only — contact your foreman to action alerts
                </Text>
              </View>
            ) : null}

            {alerts.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="bell-off" size={24} color={colors.mutedForeground} />
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>No alerts at this time</Text>
              </View>
            ) : (
              <>
                {displayedAlerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    canAct={isOwnerOrForeman}
                    onMarkRead={() => markRead.mutate(alert.id)}
                    colors={colors}
                  />
                ))}
                {alerts.length > 5 ? (
                  <Pressable
                    onPress={() => setShowAllAlerts((v) => !v)}
                    style={[styles.showMoreBtn, { borderColor: colors.border }]}
                  >
                    <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                      {showAllAlerts ? "Show less" : `Show all ${alerts.length} alerts`}
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
    marginBottom: 4,
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

  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
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
  sevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  inspRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  inspType: { fontSize: 14, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
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
