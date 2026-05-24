import React, { useState, useCallback } from "react";
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
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListTimesheets,
  useListProjects,
  useGetMe,
  useApproveTimesheet,
  useDenyTimesheet,
  getListTimesheetsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";

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
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

export default function HoursScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editHours, setEditHours] = useState("");

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
    if (pid === 0) unassigned.push(ts);
    else {
      if (!byProject[pid]) byProject[pid] = [];
      byProject[pid].push(ts);
    }
  }

  const totalHours = timesheets.reduce((s, ts) => s + (parseFloat(ts.totalHours) || 0), 0);
  const statuses = ["all", "draft", "submitted", "approved", "denied"];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const canManage = me?.role === "owner";

  const approveMutation = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
        Alert.alert("Approved", "Timesheet approved.");
      },
      onError: () => Alert.alert("Error", "Failed to approve timesheet."),
    },
  });

  const denyMutation = useDenyTimesheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
        Alert.alert("Rejected", "Timesheet rejected.");
      },
      onError: () => Alert.alert("Error", "Failed to reject timesheet."),
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { totalHours?: number; description?: string | null } }) =>
      customFetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
      setEditingId(null);
      setEditHours("");
      Alert.alert("Updated", "Timesheet hours updated.");
    },
    onError: () => Alert.alert("Error", "Failed to update timesheet."),
  });

  const handleEdit = useCallback((ts: any) => {
    setEditingId(ts.id);
    setEditHours(ts.totalHours ?? "");
  }, []);

  const handleSaveEdit = useCallback((id: number) => {
    const h = parseFloat(editHours);
    if (!editHours || isNaN(h) || h <= 0 || h > 168) {
      Alert.alert("Invalid hours", "Enter hours between 0.5 and 168");
      return;
    }
    editMutation.mutate({ id, body: { totalHours: h } });
  }, [editHours, editMutation]);

  const renderEntryRow = (ts: any) => {
    const statusColor = STATUS_COLORS[ts.status] ?? "#6B7280";
    const isEditing = editingId === ts.id;
    const showActions = canManage;

    return (
      <View key={ts.id} style={{ gap: 6 }}>
        <View style={styles.entryRow}>
          <Text style={[styles.entryWeek, { color: colors.mutedForeground }]}>
            {formatWeekRange(ts.weekStart)}
          </Text>
          {isEditing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
              <TextInput
                value={editHours}
                onChangeText={setEditHours}
                keyboardType="decimal-pad"
                style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                autoFocus
              />
              <TouchableOpacity onPress={() => handleSaveEdit(ts.id)}>
                <Feather name="check" size={16} color="#22C55E" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditingId(null); setEditHours(""); }}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.entryHours, { color: colors.foreground }]}>{ts.totalHours}h</Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{ts.status}</Text>
              </View>
            </>
          )}
        </View>

        {canManage && (
          <View style={styles.actionRow}>
            {showActions && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#22C55E15" }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    approveMutation.mutate({ timesheetId: ts.id, data: { signatureData: "" } });
                  }}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#22C55E" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={12} color="#22C55E" />
                      <Text style={[styles.actionText, { color: "#22C55E" }]}>Approve</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#EF444415" }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    denyMutation.mutate({ timesheetId: ts.id, data: { notes: "" } });
                  }}
                  disabled={denyMutation.isPending}
                >
                  {denyMutation.isPending ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <>
                      <Feather name="x-circle" size={12} color="#EF4444" />
                      <Text style={[styles.actionText, { color: "#EF4444" }]}>Reject</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
            {!isEditing && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: `${colors.primary}15` }]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleEdit(ts);
                }}
                disabled={editMutation.isPending}
              >
                <Feather name="edit-2" size={12} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

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
                  <View style={{ gap: 10, marginTop: 4 }}>
                    {entries.map((ts: any) => renderEntryRow(ts))}
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
              <View style={{ gap: 10, marginTop: 4 }}>
                {unassigned.map((ts) => renderEntryRow(ts))}
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
  editInput: {
    width: 60,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    paddingLeft: 0,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
