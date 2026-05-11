import {
  useGetDashboardSummary, useGetRecentActivity, useListProjects,
  useGetMe, useListCompanyMembers, customFetch,
} from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { WeatherWidget } from "@/components/WeatherWidget";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ── AI Briefing ──────────────────────────────────────────────────────────────

type BriefingLine = { icon: string; color: string; text: string };

function parseBriefing(raw: string): BriefingLine[] {
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: BriefingLine[] = [];
  for (const line of lines) {
    if (line.startsWith("📋") || line.toLowerCase().includes("priorit")) {
      out.push({ icon: "list", color: "#3b82f6", text: line.replace(/^📋\s*/, "") });
    } else if (line.startsWith("⚠️") || line.toLowerCase().includes("alert") || line.toLowerCase().includes("risk")) {
      out.push({ icon: "alert-triangle", color: "#f59e0b", text: line.replace(/^⚠️\s*/, "") });
    } else if (line.startsWith("✅") || line.toLowerCase().includes("complet") || line.toLowerCase().includes("done")) {
      out.push({ icon: "check-circle", color: "#10b981", text: line.replace(/^✅\s*/, "") });
    } else if (line.startsWith("💰") || line.toLowerCase().includes("budget") || line.toLowerCase().includes("cost")) {
      out.push({ icon: "dollar-sign", color: "#D4AF37", text: line.replace(/^💰\s*/, "") });
    } else if (line.startsWith("🌤") || line.startsWith("☀") || line.startsWith("🌧")) {
      out.push({ icon: "cloud", color: "#6366f1", text: line });
    } else if (line.startsWith("-") || line.startsWith("•")) {
      out.push({ icon: "chevron-right", color: "#6b7280", text: line.replace(/^[-•]\s*/, "") });
    } else if (line.endsWith(":") || line.match(/^[A-Z\s]+:$/)) {
      out.push({ icon: "bookmark", color: "#D4AF37", text: line });
    } else {
      out.push({ icon: "chevron-right", color: "#6b7280", text: line });
    }
  }
  return out.slice(0, 12);
}

function AiBriefingCard({ colors }: { colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<BriefingLine[]>([]);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      customFetch<{ briefing: string } | string>("/api/ai/foreman-briefing", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      const raw = typeof data === "string"
        ? data
        : (data as any)?.briefing ?? (data as any)?.summary ?? JSON.stringify(data);
      setLines(parseBriefing(raw));
      setExpanded(true);
    },
  });

  useEffect(() => {
    mutate();
  }, []);

  const displayLines = expanded ? lines : lines.slice(0, 3);

  return (
    <View style={[styles.briefingCard, { backgroundColor: colors.sidebar, borderColor: "#C9A84C30" }]}>
      <View style={styles.briefingHeader}>
        <View style={[styles.briefingIconWrap, { backgroundColor: "#C9A84C22" }]}>
          <Feather name="cpu" size={16} color="#C9A84C" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.briefingTitle, { color: "#FFFFFF" }]}>AI Daily Briefing</Text>
          <Text style={[styles.briefingMeta, { color: "rgba(255,255,255,0.45)" }]}>
            {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => mutate()}
          style={[styles.refreshBtn, { borderColor: "#C9A84C40" }]}
          disabled={isPending}
          hitSlop={8}
        >
          <Feather name="refresh-cw" size={13} color="#C9A84C" />
        </TouchableOpacity>
      </View>

      {isPending ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          <ActivityIndicator size="small" color="#C9A84C" />
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" }}>
            Generating briefing…
          </Text>
        </View>
      ) : lines.length === 0 ? (
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10, fontFamily: "Inter_400Regular" }}>
          Tap refresh to generate your daily briefing.
        </Text>
      ) : (
        <>
          <View style={{ marginTop: 10, gap: 6 }}>
            {displayLines.map((l, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Feather name={l.icon as any} size={13} color={l.color} style={{ marginTop: 2 }} />
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", flex: 1, lineHeight: 18, fontFamily: "Inter_400Regular" }}>
                  {l.text}
                </Text>
              </View>
            ))}
          </View>
          {lines.length > 3 ? (
            <TouchableOpacity
              onPress={() => setExpanded((v) => !v)}
              style={styles.expandBtn}
              hitSlop={6}
            >
              <Text style={{ fontSize: 12, color: "#C9A84C", fontFamily: "Inter_600SemiBold" }}>
                {expanded ? "Show less" : `Show ${lines.length - 3} more`}
              </Text>
              <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color="#C9A84C" />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS_WORKER = [
  { label: "My Projects", icon: "folder", path: "/projects", color: "#8b5cf6" },
  { label: "Estimator", icon: "bar-chart-2", path: "/estimator", color: "#C9A84C" },
  { label: "Ask AI", icon: "message-circle", path: "/ask", color: "#ec4899" },
  { label: "Site Vision", icon: "camera", path: "/site-vision", color: "#C9A84C" },
];

const QUICK_ACTIONS_OWNER = [
  { label: "Projects", icon: "folder", path: "/projects", color: "#8b5cf6" },
  { label: "Finance", icon: "trending-up", path: "/finance", color: "#16a34a" },
  { label: "Estimator", icon: "bar-chart-2", path: "/estimator", color: "#C9A84C" },
  { label: "Ask AI", icon: "message-circle", path: "/ask", color: "#ec4899" },
  { label: "Site Vision", icon: "camera", path: "/site-vision", color: "#C9A84C" },
];

function QuickActionsGrid({ isWorker, colors, router }: { isWorker: boolean; colors: any; router: any }) {
  const actions = isWorker ? QUICK_ACTIONS_WORKER : QUICK_ACTIONS_OWNER;
  return (
    <View style={styles.quickGrid}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(action.path as any);
          }}
          activeOpacity={0.75}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}18` }]}>
            <Feather name={action.icon as any} size={20} color={action.color} />
          </View>
          <Text style={[styles.quickActionLabel, { color: colors.foreground }]} numberOfLines={1}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, subtitle, icon, onPress,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  onPress: () => void;
}) {
  const colors = useColors();

  function handlePress() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}. ${subtitle}`}
    >
      <View style={styles.summaryCardTop}>
        <Text style={[styles.summaryCardTitle, { color: colors.mutedForeground }]}>{title}</Text>
        <View style={[styles.summaryCardIconBg, { backgroundColor: `${colors.primary}1A` }]}>
          <Feather name={icon as any} size={16} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.summaryCardValue, { color: colors.foreground }]}>{value}</Text>
      <View style={styles.summaryCardBottom}>
        <Text style={[styles.summaryCardSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        <Feather name="chevron-right" size={14} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

// ── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: any }) {
  const colors = useColors();
  const router = useRouter();
  const statusColors: Record<string, string> = {
    active: "#22C55E",
    completed: colors.mutedForeground,
    on_hold: "#F59E0B",
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.projectCard,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={() => router.push(`/project/${project.id}`)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.projectName, { color: colors.foreground }]} numberOfLines={1}>{project.name}</Text>
        {!!project.location && (
          <View style={styles.row}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.projectMeta, { color: colors.mutedForeground }]} numberOfLines={1}> {project.location}</Text>
          </View>
        )}
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColors[project.status] ?? colors.mutedForeground }]} />
    </Pressable>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  daily_report: "file-text",
  rfi_created: "alert-circle",
  project_created: "folder",
  task_created: "check-square",
  schedule_assigned: "calendar",
  cost_added: "dollar-sign",
};

const ACTIVITY_COLORS: Record<string, string> = {
  daily_report: "#3B82F6",
  rfi_created: "#F59E0B",
  project_created: "#8B5CF6",
  task_created: "#22C55E",
  schedule_assigned: "#D4AF37",
  cost_added: "#6B7280",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function ActivityRow({ item }: { item: any }) {
  const colors = useColors();
  const iconName = ACTIVITY_ICONS[item.type] ?? "activity";
  const iconColor = ACTIVITY_COLORS[item.type] ?? colors.primary;

  return (
    <View style={[styles.activityRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: `${iconColor}18` }]}>
        <Feather name={iconName as any} size={14} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.activityDesc, { color: colors.foreground }]} numberOfLines={2}>{item.description}</Text>
        <View style={styles.activityFooter}>
          {!!item.projectName && (
            <Text style={[styles.activityMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.projectName}</Text>
          )}
          {!!item.createdAt && (
            <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>
              {item.projectName ? " · " : ""}{timeAgo(item.createdAt)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  name: { fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 2 },
  bellBtn: { position: "relative", padding: 4 },
  badge: {
    position: "absolute", top: -2, right: -4, minWidth: 18, height: 18,
    borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },

  // AI Briefing
  briefingCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#C9A84C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  briefingHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  briefingIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  briefingTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  briefingMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  refreshBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  expandBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start" },

  // Quick actions
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  quickAction: {
    width: "30%",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: "30%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickActionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Summary cards
  summaryGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  summaryCard: {
    borderRadius: 14, padding: 18, borderWidth: 1, gap: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  summaryCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  summaryCardTitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summaryCardIconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  summaryCardValue: { fontSize: 34, fontFamily: "Inter_700Bold", lineHeight: 40 },
  summaryCardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  summaryCardSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Finance card
  financeCard: {
    borderRadius: 14, padding: 18, elevation: 3,
    shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  financeCardInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  financeCardText: { gap: 2 },
  financeCardTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  financeCardSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // Project card
  projectCard: {
    flexDirection: "row", alignItems: "center", borderRadius: 10,
    padding: 14, marginBottom: 8, borderWidth: 1,
  },
  projectName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  projectMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: "row", alignItems: "center" },

  // Activity
  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  activityIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  activityDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  activityFooter: { flexDirection: "row", alignItems: "center", marginTop: 2, flexWrap: "wrap" },
  activityMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  activityTime: { fontSize: 12, fontFamily: "Inter_400Regular" },

  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  voiceEstimateCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    borderRadius: 14, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  voiceEstimateIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  voiceEstimateTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  voiceEstimateSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: me } = useGetMe();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useGetRecentActivity();
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useListProjects();
  const { data: members } = useListCompanyMembers(me?.companyId ?? 0, {
    query: { enabled: !!me?.companyId },
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["notifications", "unread"],
    queryFn: () => customFetch<{ count: number }>("/api/notifications/unread-count"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const refreshing = summaryLoading || activityLoading || projectsLoading;
  const handleRefresh = () => { refetchSummary(); refetchActivity(); refetchProjects(); };

  const firstName = me?.firstName ?? "there";
  const isWorker = me?.role === "worker";
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const allProjects = projects ?? [];
  const activeProjects = allProjects.filter((p) => p.status === "active" || p.status === "planning");
  const completedProjects = allProjects.filter((p) => p.status === "completed");
  const topProjects = isWorker ? allProjects.slice(0, 4) : activeProjects.slice(0, 4);
  const memberCount = (members as any[])?.length ?? 0;

  const formatCurrency = (v?: number | null) => {
    if (v == null) return "—";
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v}`;
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={[styles.greeting, { color: "rgba(255,255,255,0.6)" }]}>Good day,</Text>
          <Text style={[styles.name, { color: "#FFFFFF" }]}>{firstName}</Text>
        </View>
        <Pressable onPress={() => router.push("/notifications")} style={styles.bellBtn} hitSlop={10}>
          <Feather name="bell" size={22} color="#FFFFFF" />
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Weather */}
      <View style={{ paddingHorizontal: 20, marginTop: 16, marginBottom: 16 }}>
        <WeatherWidget />
      </View>

      {/* AI Daily Briefing — owners & foremen only */}
      {isOwnerOrForeman && <AiBriefingCard colors={colors} />}

      {/* Quick Actions */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>Quick Actions</Text>
      </View>
      <QuickActionsGrid isWorker={isWorker} colors={colors} router={router} />

      {/* Summary cards */}
      <View style={styles.summaryGrid}>
        <SummaryCard
          title={isWorker ? "My Projects" : "Active Projects"}
          value={summaryLoading ? "—" : isWorker ? String(allProjects.length) : String(summary?.activeProjects ?? 0)}
          subtitle={isWorker
            ? `${allProjects.length === 1 ? "1 project" : `${allProjects.length} projects`} assigned`
            : `${activeProjects.length} total · ${completedProjects.length} completed`}
          icon="folder"
          onPress={() => router.push("/projects")}
        />
        <SummaryCard
          title="Reports This Week"
          value={summaryLoading ? "—" : String(summary?.reportsThisWeek ?? 0)}
          subtitle="Daily reports submitted"
          icon="file-text"
          onPress={() => router.push("/log")}
        />
        {!isWorker && (
          <SummaryCard
            title="Team Members"
            value={memberCount > 0 ? String(memberCount) : "—"}
            subtitle="Active in workspace"
            icon="users"
            onPress={() => router.navigate("/(tabs)/profile")}
          />
        )}
      </View>

      {/* Finance Quick Access — owners and foremen only */}
      {isOwnerOrForeman && (
        <Pressable
          style={({ pressed }) => [
            styles.financeCard,
            { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1, marginHorizontal: 16, marginBottom: 12 },
          ]}
          onPress={() => router.push("/finance")}
        >
          <View style={styles.financeCardInner}>
            <View style={styles.financeCardText}>
              <Text style={styles.financeCardTitle}>Finance</Text>
              <Text style={styles.financeCardSub}>
                Budget {formatCurrency(summary?.totalBudget)} · Spend {formatCurrency(summary?.totalSpend)}
              </Text>
            </View>
            <Feather name="chevron-right" size={22} color="rgba(255,255,255,0.9)" />
          </View>
        </Pressable>
      )}

      {/* Voice Estimator — owners and foremen only */}
      {!isWorker && (
        <Pressable
          style={({ pressed }) => [
            styles.voiceEstimateCard,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/voice-estimate");
          }}
        >
          <View style={[styles.voiceEstimateIcon, { backgroundColor: `${colors.primary}1A` }]}>
            <Feather name="mic" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.voiceEstimateTitle, { color: colors.foreground }]}>Voice Estimator</Text>
            <Text style={[styles.voiceEstimateSub, { color: colors.mutedForeground }]}>
              Speak a project description — get an instant estimate & quote
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </Pressable>
      )}

      {/* Active Projects list */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isWorker ? "My Projects" : "Active Projects"}</Text>
          <Pressable onPress={() => router.push("/projects")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
          </Pressable>
        </View>
        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : topProjects.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {isWorker ? "No projects assigned to you" : "No active projects"}
          </Text>
        ) : (
          topProjects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>Recent Activity</Text>
        {activityLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (activity ?? []).length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent activity</Text>
        ) : (
          (activity ?? []).slice(0, 8).map((item) => <ActivityRow key={item.id} item={item} />)
        )}
      </View>
    </ScrollView>
  );
}
