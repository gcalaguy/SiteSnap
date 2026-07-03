import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useListProjects, useGetMe } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  planning: "#3B82F6",
  active: "#22C55E",
  completed: "#6B7280",
  on_hold: "#F59E0B",
};

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return "TBD";
  return new Date(dateStr).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export default function ScheduleScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data: projectsData,
    isLoading,
    refetch,
    isRefetching,
  } = useListProjects();

  const projects = (projectsData ?? []) as any[];
  const filtered = statusFilter === "all" ? projects : projects.filter((p) => p.status === statusFilter);
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const statuses = ["all", "planning", "active", "on_hold", "completed"];
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: embedded ? 12 : topInset + 12, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerTitle}>Master Schedule</Text>
          <Text style={styles.headerSub}>
            {isOwnerOrForeman ? "All projects & timelines" : "My assigned schedule"}
          </Text>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        {statuses.map((s) => {
          const active = statusFilter === s;
          const color = s === "all" ? colors.primary : STATUS_COLORS[s] ?? colors.primary;
          const label = s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1);
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={[
                styles.filterChip,
                { borderColor: active ? color : colors.border, backgroundColor: active ? `${color}15` : colors.card },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? color : colors.mutedForeground }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="calendar" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {statusFilter !== "all" ? `No ${statusFilter.replace("_", " ")} projects` : "No projects yet"}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
        >
          {filtered.map((p) => {
            const statusColor = STATUS_COLORS[p.status] ?? "#6B7280";
            const start = p.startDate ? fmtDate(p.startDate) : "TBD";
            const end = p.endDate ? fmtDate(p.endDate) : "TBD";
            const remaining = daysUntil(p.endDate);

            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/project/${p.id}`);
                }}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {p.status === "on_hold" ? "On Hold" : p.status?.charAt(0).toUpperCase() + p.status?.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardTimeline}>
                  <View style={styles.timelineRow}>
                    <Feather name="play-circle" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.timelineText, { color: colors.mutedForeground }]}>Start: {start}</Text>
                  </View>
                  <View style={styles.timelineRow}>
                    <Feather name="flag" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.timelineText, { color: colors.mutedForeground }]}>End: {end}</Text>
                  </View>
                </View>

                {remaining != null && remaining > 0 && p.status !== "completed" && (
                  <Text style={[styles.remainingText, { color: statusColor }]}>
                    {remaining} day{remaining === 1 ? "" : "s"} remaining
                  </Text>
                )}
                {remaining != null && remaining <= 0 && p.status !== "completed" && (
                  <Text style={[styles.remainingText, { color: "#EF4444" }]}>Overdue by {Math.abs(remaining)} day{Math.abs(remaining) === 1 ? "" : "s"}</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardTimeline: { gap: 4, marginTop: 2 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timelineText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  remainingText: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
});
