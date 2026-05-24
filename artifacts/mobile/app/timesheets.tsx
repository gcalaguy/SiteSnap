import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { useListTimesheets, useGetMe } from "@workspace/api-client-react";

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

export default function TimesheetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();

  const [statusFilter, setStatusFilter] = useState<string>("all");

  const {
    data: timesheetsData,
    isLoading,
    refetch,
    isRefetching,
  } = useListTimesheets({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const timesheets = (timesheetsData ?? []) as any[];
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const statuses = ["all", "draft", "submitted", "approved", "denied"];
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerTitle}>Timesheets</Text>
          <Text style={styles.headerSub}>{isOwnerOrForeman ? "All company timesheets" : "My timesheets"}</Text>
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
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : timesheets.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="clipboard" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {statusFilter !== "all" ? `No ${statusFilter} timesheets` : "No timesheets yet"}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
        >
          {timesheets.map((ts) => {
            const statusColor = STATUS_COLORS[ts.status] ?? "#6B7280";
            return (
              <View
                key={ts.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardWeek, { color: colors.foreground }]}>
                    {formatWeekRange(ts.weekStart)}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {ts.status?.charAt(0).toUpperCase() + ts.status?.slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={[styles.cardHours, { color: colors.mutedForeground }]}>
                    {ts.totalHours ?? "0"} hours
                  </Text>
                  {ts.user && (
                    <Text style={[styles.cardUser, { color: colors.mutedForeground }]}>
                      {ts.user.firstName} {ts.user.lastName}
                    </Text>
                  )}
                </View>
              </View>
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
  cardWeek: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  cardHours: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardUser: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
