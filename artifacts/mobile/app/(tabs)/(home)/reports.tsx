import { useListAllDailyReports, useListProjects } from "@workspace/api-client-react";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DailyReportListItem } from "@workspace/api-client-react";

// ── Date range filter ─────────────────────────────────────────────────────────

type DatePreset = "this_week" | "this_month" | "last_30" | "custom";

const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: "This week", value: "this_week" },
  { label: "This month", value: "this_month" },
  { label: "Last 30 days", value: "last_30" },
  { label: "Custom…", value: "custom" },
];

function getDateRangeStrings(
  preset: DatePreset | null,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  if (!preset) return {};
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  if (preset === "this_week") {
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay());
    return { from: d.toISOString().split("T")[0], to: todayStr };
  }
  if (preset === "this_month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: d.toISOString().split("T")[0], to: todayStr };
  }
  if (preset === "last_30") {
    const d = new Date(now);
    d.setDate(now.getDate() - 30);
    return { from: d.toISOString().split("T")[0], to: todayStr };
  }
  if (preset === "custom") {
    return {
      from: customFrom.trim() || undefined,
      to: customTo.trim() || undefined,
    };
  }
  return {};
}

function presetLabel(preset: DatePreset, customFrom: string, customTo: string): string {
  if (preset === "this_week") return "This week";
  if (preset === "this_month") return "This month";
  if (preset === "last_30") return "Last 30 days";
  if (preset === "custom") {
    const parts = [customFrom.trim(), customTo.trim()].filter(Boolean);
    return parts.length === 2 ? `${parts[0]} – ${parts[1]}` : parts[0] ?? "Custom";
  }
  return "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

// ── Report Row ────────────────────────────────────────────────────────────────

function ReportRow({ report, onPressProject }: { report: DailyReportListItem; onPressProject: () => void }) {
  const colors = useColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPressProject}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <Feather name="file-text" size={18} color={colors.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.subject, { color: colors.foreground }]} numberOfLines={2}>
            {report.workPerformed}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {formatDate(report.reportDate)}
          </Text>
        </View>

        <View style={styles.rowMeta}>
          {!!report.projectName && (
            <View style={[styles.projectChip, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}30` }]}>
              <Feather name="folder" size={10} color={colors.primary} />
              <Text style={[styles.projectChipText, { color: colors.primary }]} numberOfLines={1}>
                {report.projectName}
              </Text>
            </View>
          )}
          <Feather name="user" size={11} color={colors.mutedForeground} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {report.submittedByName}
          </Text>
          {!!report.weather && (
            <>
              <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
              <Feather name="cloud" size={11} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>{report.weather}</Text>
            </>
          )}
        </View>

        {!!report.notes && (
          <Text style={[styles.notesPreview, { color: colors.mutedForeground }]} numberOfLines={2}>
            {report.notes}
          </Text>
        )}
        {!!report.issues && (
          <View style={[styles.issueRow, { borderLeftColor: "#f59e0b" }]}>
            <Text style={[styles.issueText, { color: "#92400e" }]} numberOfLines={1}>
              {report.issues}
            </Text>
          </View>
        )}
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AllReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"from" | "to">("from");
  const [pickerDate, setPickerDate] = useState(new Date());

  // Compute YYYY-MM-DD strings for server-side filtering
  const dateRange = useMemo(
    () => getDateRangeStrings(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  // Server-side filtering: projectId, from, to passed as query params
  const { data, isLoading, refetch, dataUpdatedAt } = useListAllDailyReports({
    projectId: selectedProject ?? undefined,
    from: dateRange.from,
    to: dateRange.to,
  });

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);
  const relativeTime = useRelativeTime(dataUpdatedAt || null);
  const updatedLabel = refreshing ? "Refreshing…" : relativeTime;

  // M-P4 fix: only refetch on focus if data is older than 60s — respects staleTime
  useFocusEffect(useCallback(() => {
    if (!dataUpdatedAt || Date.now() - dataUpdatedAt > 60_000) refetch();
  }, [dataUpdatedAt, refetch]));

  // Load projects for the picker independently of the filtered result set
  const { data: projectsData } = useListProjects();
  const projects = (projectsData ?? []) as { id: number; name: string; status: string }[];

  const reports = (data ?? []) as DailyReportListItem[];

  // Only text search remains client-side (API has no search param)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.workPerformed.toLowerCase().includes(q) ||
        (r.projectName ?? "").toLowerCase().includes(q) ||
        r.submittedByName.toLowerCase().includes(q) ||
        (r.issues ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q),
    );
  }, [reports, search]);

  const hasDateFilter = datePreset !== null;
  const hasActiveFilter = selectedProject !== null || hasDateFilter || search.trim().length > 0;

  const onDateChange = useCallback((event: unknown, date?: Date) => {
    if (date) {
      const iso = date.toISOString().split("T")[0];
      if (pickerMode === "from") setCustomFrom(iso);
      else setCustomTo(iso);
    }
    if (Platform.OS === "android") setShowDatePicker(false);
  }, [pickerMode]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Daily Reports</Text>
          {filtered.length > 0 && (
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>
              {filtered.length} {filtered.length === 1 ? "report" : "reports"}
            </Text>
          )}
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search reports..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={6}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Project filter */}
        {projects.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={styles.filterRow}>
              <Pressable
                onPress={() => setSelectedProject(null)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: selectedProject === null ? colors.primary : colors.muted,
                    borderColor: selectedProject === null ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.filterPillText, { color: selectedProject === null ? "#fff" : colors.mutedForeground }]}>
                  All Projects
                </Text>
              </Pressable>
              {projects.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedProject(p.id === selectedProject ? null : p.id)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: selectedProject === p.id ? colors.primary : colors.muted,
                      borderColor: selectedProject === p.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: selectedProject === p.id ? "#fff" : colors.mutedForeground }]}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Date range filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={styles.filterRow}>
            <View style={[styles.dateFilterLabel, { backgroundColor: colors.muted }]}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
            </View>
            {DATE_PRESETS.map((p) => (
              <Pressable
                key={p.value}
                onPress={() => {
                  if (datePreset === p.value) {
                    setDatePreset(null);
                    setCustomFrom("");
                    setCustomTo("");
                  } else {
                    setDatePreset(p.value);
                    if (p.value !== "custom") { setCustomFrom(""); setCustomTo(""); }
                  }
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: datePreset === p.value ? "#6366f1" : colors.muted,
                    borderColor: datePreset === p.value ? "#6366f1" : colors.border,
                    flexDirection: "row", alignItems: "center", gap: 4,
                  },
                ]}
              >
                <Text style={[styles.filterPillText, { color: datePreset === p.value ? "#fff" : colors.mutedForeground }]}>
                  {p.label}
                </Text>
                {datePreset === p.value && (
                  <Feather name="x" size={12} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Custom date picker */}
        {datePreset === "custom" && (
          <View style={styles.customDateRow}>
            <Pressable
              onPress={() => {
                setPickerMode("from");
                setPickerDate(customFrom ? new Date(customFrom) : new Date());
                setShowDatePicker(true);
              }}
              style={[styles.dateInput, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={{ color: customFrom ? colors.foreground : colors.mutedForeground, fontSize: 14 }}>
                {customFrom || "From date"}
              </Text>
            </Pressable>
            <Text style={[styles.dateSep, { color: colors.mutedForeground }]}>–</Text>
            <Pressable
              onPress={() => {
                setPickerMode("to");
                setPickerDate(customTo ? new Date(customTo) : new Date());
                setShowDatePicker(true);
              }}
              style={[styles.dateInput, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={{ color: customTo ? colors.foreground : colors.mutedForeground, fontSize: 14 }}>
                {customTo || "To date"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Active date chip summary (non-custom) */}
        {hasDateFilter && datePreset !== "custom" && (
          <View style={{ marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.activeDateChip, { backgroundColor: "#6366f112", borderColor: "#6366f140" }]}
              onPress={() => setDatePreset(null)}
            >
              <Feather name="calendar" size={12} color="#6366f1" />
              <Text style={[styles.activeDateChipText, { color: "#6366f1" }]}>
                {presetLabel(datePreset, customFrom, customTo)}
              </Text>
              <Feather name="x" size={12} color="#6366f1" />
            </TouchableOpacity>
          </View>
        )}

        {/* DateTimePicker — Android inline */}
        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display="default"
            themeVariant="dark"
            onValueChange={onDateChange}
            onDismiss={() => setShowDatePicker(false)}
          />
        )}

        {/* DateTimePicker — iOS modal */}
        {Platform.OS === "ios" && (
          <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                    <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Date</Text>
                  <Pressable
                    onPress={() => {
                      const iso = pickerDate.toISOString().split("T")[0];
                      if (pickerMode === "from") setCustomFrom(iso);
                      else setCustomTo(iso);
                      setShowDatePicker(false);
                    }}
                    hitSlop={8}
                  >
                    <Text style={[styles.modalDone, { color: colors.primary }]}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  onValueChange={(event, date) => date && setPickerDate(date)}
                  style={{ width: "100%" }}
                />
              </View>
            </View>
          </Modal>
        )}
      </View>

      {updatedLabel ? (
        <View style={styles.updatedRow}>
          <Feather name="clock" size={11} color="#9CA3AF" />
          <Text style={styles.updatedText}>{updatedLabel}</Text>
        </View>
      ) : null}

      {/* List */}
      <View style={styles.listContainer}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="file-text" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.foreground }]}>
              {hasActiveFilter ? "No reports match your filters" : "No daily reports yet"}
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              {hasActiveFilter
                ? "Try adjusting your project, date, or search filter"
                : "Reports submitted across all projects will appear here"}
            </Text>
          </View>
        ) : (
          filtered.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              onPressProject={() => router.push(`/project/${r.projectId}` as any)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginBottom: 8, alignSelf: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  countText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },

  filterRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  updatedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  updatedText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  listContainer: { paddingHorizontal: 16, paddingTop: 8 },
  loader: { paddingVertical: 40 },

  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },

  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 },
  subject: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  date: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  rowMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  projectChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  projectChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", maxWidth: 120 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaDot: { fontSize: 12 },

  notesPreview: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 4 },

  issueRow: {
    marginTop: 6, paddingLeft: 8, borderLeftWidth: 2,
  },
  issueText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },

  emptyContainer: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6, lineHeight: 20 },

  dateFilterLabel: {
    width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  customDateRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
  },
  dateInput: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
  },
  dateSep: { fontSize: 14, fontFamily: "Inter_400Regular" },
  activeDateChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  activeDateChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalDone: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
