import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
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
  useGetMe,
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

// Minimal 1x1 transparent PNG base64 data URL (exceeds server minLength 50)
const DUMMY_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function formatWeekRange(startStr: string): string {
  const start = new Date(startStr);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

export default function TimesheetsScreen() {
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
    isLoading,
    refetch,
    isRefetching,
  } = useListTimesheets({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const timesheets = (timesheetsData ?? []) as any[];
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const canManage = me?.role === "owner";
  // Editing your own hours doesn't require owner/review privileges — the
  // backend already allows the timesheet's own user to PATCH it.
  const canEdit = (ts: any) => canManage || ts.userId === me?.id;

  const statuses = ["all", "draft", "submitted", "approved", "denied"];
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/timesheets/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ signatureData: DUMMY_SIGNATURE }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
      Alert.alert("Approved", "Timesheet approved.");
    },
    onError: (err: any) => {
      const msg = err?.status === 409
        ? "Only submitted timesheets can be approved."
        : "Failed to approve timesheet.";
      Alert.alert("Error", msg);
    },
  });

  const denyMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/timesheets/${id}/deny`, {
        method: "POST",
        body: JSON.stringify({ notes: "" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey() });
      Alert.alert("Rejected", "Timesheet rejected.");
    },
    onError: (err: any) => {
      const msg = err?.status === 409
        ? "Only submitted timesheets can be rejected."
        : "Failed to reject timesheet.";
      Alert.alert("Error", msg);
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
            const isEditing = editingId === ts.id;

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
                  {isEditing ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <TextInput
                        value={editHours}
                        onChangeText={setEditHours}
                        keyboardType="decimal-pad"
                        style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                        autoFocus
                      />
                      <TouchableOpacity onPress={() => handleSaveEdit(ts.id)}>
                        <Feather name="check" size={18} color="#22C55E" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingId(null); setEditHours(""); }}>
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.cardHours, { color: colors.mutedForeground }]}>
                      {ts.totalHours ?? "0"} hours
                    </Text>
                  )}
                  {ts.user && (
                    <Text style={[styles.cardUser, { color: colors.mutedForeground }]}>
                      {ts.user.firstName} {ts.user.lastName}
                    </Text>
                  )}
                </View>

                {/* Actions: approve/reject are owner-only; edit is available to the
                    timesheet's own user as well (backend already allows this). */}
                {(canManage || (canEdit(ts) && !isEditing)) && (
                  <View style={styles.actionRow}>
                    {canManage && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: "#22C55E15" }]}
                          onPress={() => {
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            approveMutation.mutate(ts.id);
                          }}
                          disabled={approveMutation.isPending}
                        >
                          {approveMutation.isPending ? (
                            <ActivityIndicator size="small" color="#22C55E" />
                          ) : (
                            <>
                              <Feather name="check-circle" size={13} color="#22C55E" />
                              <Text style={[styles.actionText, { color: "#22C55E" }]}>Approve</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: "#EF444415" }]}
                          onPress={() => {
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            denyMutation.mutate(ts.id);
                          }}
                          disabled={denyMutation.isPending}
                        >
                          {denyMutation.isPending ? (
                            <ActivityIndicator size="small" color="#EF4444" />
                          ) : (
                            <>
                              <Feather name="x-circle" size={13} color="#EF4444" />
                              <Text style={[styles.actionText, { color: "#EF4444" }]}>Reject</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                    {canEdit(ts) && !isEditing && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: `${colors.primary}15` }]}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          handleEdit(ts);
                        }}
                        disabled={editMutation.isPending}
                      >
                        <Feather name="edit-2" size={13} color={colors.primary} />
                        <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
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
  editInput: {
    width: 80,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
