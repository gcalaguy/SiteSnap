import {
  useGetDashboardSummary, useGetRecentActivity, useListProjects,
  useGetMe, useListCompanyMembers, customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
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

// ── Tappable summary card ───────────────────────────────────────────────────
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
      {/* Top row: label + icon */}
      <View style={styles.summaryCardTop}>
        <Text style={[styles.summaryCardTitle, { color: colors.mutedForeground }]}>{title}</Text>
        <View style={[styles.summaryCardIconBg, { backgroundColor: `${colors.primary}1A` }]}>
          <Feather name={icon as any} size={16} color={colors.primary} />
        </View>
      </View>

      {/* Value */}
      <Text style={[styles.summaryCardValue, { color: colors.foreground }]}>{value}</Text>

      {/* Bottom row: subtitle + chevron */}
      <View style={styles.summaryCardBottom}>
        <Text style={[styles.summaryCardSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        <Feather name="chevron-right" size={14} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

// ── Project card ────────────────────────────────────────────────────────────
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

// ── Activity helpers ────────────────────────────────────────────────────────
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
            <Text style={[styles.activityMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.projectName}
            </Text>
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

// ── Styles ──────────────────────────────────────────────────────────────────
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

  // Summary cards
  summaryGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  summaryCard: {
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    gap: 4,
    // subtle shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
});

// ── Screen ──────────────────────────────────────────────────────────────────
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
    queryFn: async () => {
      const res = await customFetch("/api/notifications/unread-count");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const refreshing = summaryLoading || activityLoading || projectsLoading;
  const handleRefresh = () => { refetchSummary(); refetchActivity(); refetchProjects(); };

  const firstName = me?.firstName ?? "there";
  const isWorker = me?.role === "worker";
  const allProjects = projects ?? [];
  const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "planning");
  const completedProjects = allProjects.filter(p => p.status === "completed");
  // Workers: show all their projects (active + on_hold); owners: show active only
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

      {/* ── Summary cards (tappable) ── */}
      <View style={styles.summaryGrid}>
        <SummaryCard
          title={isWorker ? "My Projects" : "Active Projects"}
          value={summaryLoading ? "—" : isWorker ? String(allProjects.length) : String(summary?.activeProjects ?? 0)}
          subtitle={isWorker ? `${allProjects.length === 1 ? "1 project" : `${allProjects.length} projects`} assigned` : `${activeProjects.length} total · ${completedProjects.length} completed`}
          icon="folder"
          onPress={() => router.navigate("/(tabs)/projects")}
        />
        <SummaryCard
          title="Reports This Week"
          value={summaryLoading ? "—" : String(summary?.reportsThisWeek ?? 0)}
          subtitle="Daily reports submitted"
          icon="file-text"
          onPress={() => router.navigate("/(tabs)/log")}
        />
        <SummaryCard
          title="Open RFIs"
          value={summaryLoading ? "—" : String(summary?.pendingRFIs ?? 0)}
          subtitle="Awaiting response"
          icon="alert-circle"
          onPress={() => router.navigate("/(tabs)/projects")}
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

      {/* Finance Quick Access */}
      <Pressable
        style={({ pressed }) => [
          styles.financeCard,
          { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1, marginHorizontal: 16, marginBottom: 20 },
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

      {/* Projects list */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isWorker ? "My Projects" : "Active Projects"}</Text>
          <Pressable onPress={() => router.push("/(tabs)/projects")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
          </Pressable>
        </View>
        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : topProjects.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{isWorker ? "No projects assigned to you" : "No active projects"}</Text>
        ) : (
          topProjects.map(p => <ProjectCard key={p.id} project={p} />)
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
          (activity ?? []).slice(0, 8).map(item => <ActivityRow key={item.id} item={item} />)
        )}
      </View>
    </ScrollView>
  );
}
