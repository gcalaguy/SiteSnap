import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useListTimesheets, useListProjects, useGetMe } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  submitted: "#3B82F6",
  approved: "#22C55E",
  denied: "#EF4444",
};

function formatWeekRange(startStr: string): string {
  const start = new Date(startStr);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function HoursScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data: timesheetsData,
    isLoading: tsLoading,
    refetch,
    isRefetching,
  } = useListTimesheets({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const { data: projectsData, isLoading: projLoading } = useListProjects();

  const timesheets = (timesheetsData ?? []) as any[];
  const projects = (projectsData ?? []) as any[];
  const loading = tsLoading || projLoading;

  // Group timesheets by project
  const byProject: Record<number, any[]> = {};
  const unassigned: any[] = [];
  for (const ts of timesheets) {
    const pid = ts.projectId ?? 0;
    if (pid === 0) {
      unassigned.push(ts);
    } else {
      if (!byProject[pid]) byProject[pid] = [];
      byProject[pid].push(ts);
    }
  }

  const totalHours = timesheets.reduce((s, ts) => s + (parseFloat(ts.totalHours) || 0), 0);
  const statuses = ["all", "draft", "submitted", "approved", "denied"];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerTitle}>Hours Tracking</Text>
          <Text style={styles.headerSub}>
            {isOwnerOrForeman ? "All company hours" : "My tracked hours"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{totalHours.toFixed(1)}h</Text>
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
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={[
                styles.filterChip,
                { borderColor: active ? color : colors.border, backgroundColor: active ? `${color}15` : colors.card },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? color : colors.mutedForeground }]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {/* Per-project cards */}
          {projects.map((p) => {
            const entries = byProject[p.id] ?? [];
            const projectHours = entries.reduce((s: number, ts: any) => s + (parseFloat(ts.totalHours) || 0), 0);
            if (entries.length === 0 && timesheets.length > 0) return null;

            return (
              <View key={p.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.cardTotal, { color: colors.primary }]}>{projectHours.toFixed(1)}h</Text>
                </View>
                {entries.length === 0 ? (
                  <Text style={[styles.cardEmpty, { color: colors.mutedForeground }]}>No timesheets yet</Text>
                ) : (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    {entries.map((ts: any) => {
                      const statusColor = STATUS_COLORS[ts.status] ?? "#6B7280";
                      return (
                        <View key={ts.id} style={styles.entryRow}>
                          <Text style={[styles.entryWeek, { color: colors.mutedForeground }]}>
                            {formatWeekRange(ts.weekStart)}
                          </Text>
                          <Text style={[styles.entryHours, { color: colors.foreground }]}>{ts.totalHours}h</Text>
                          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>{ts.status}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {/* Unassigned timesheets */}
          {unassigned.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardName, { color: colors.foreground }]}>Unassigned</Text>
                <Text style={[styles.cardTotal, { color: colors.primary }]}>
                  {unassigned.reduce((s, ts) => s + (parseFloat(ts.totalHours) || 0), 0).toFixed(1)}h
                </Text>
              </View>
              <View style={{ gap: 6, marginTop: 4 }}>
                {unassigned.map((ts) => {
                  const statusColor = STATUS_COLORS[ts.status] ?? "#6B7280";
                  return (
                    <View key={ts.id} style={styles.entryRow}>
                      <Text style={[styles.entryWeek, { color: colors.mutedForeground }]}>
                        {formatWeekRange(ts.weekStart)}
                      </Text>
                      <Text style={[styles.entryHours, { color: colors.foreground }]}>{ts.totalHours}h</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{ts.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {timesheets.length === 0 && (
            <View style={styles.empty}>
              <Feather name="clock" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {statusFilter !== "all" ? `No ${statusFilter} timesheets` : "No timesheets yet"}
              </Text>
            </View>
          )}
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
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#111111" },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  cardTotal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardEmpty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  entryWeek: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  entryHours: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 42 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});
