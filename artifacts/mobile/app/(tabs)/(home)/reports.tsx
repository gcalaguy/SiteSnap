import { useListAllDailyReports } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import type { DailyReportListItem } from "@workspace/api-client-react";

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
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {report.submittedByName}
          </Text>
          <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
          <Feather name="users" size={11} color={colors.mutedForeground} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{report.crewCount}</Text>
          {!!report.weather && (
            <>
              <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
              <Feather name="cloud" size={11} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>{report.weather}</Text>
            </>
          )}
        </View>

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

  const { data, isLoading, refetch } = useListAllDailyReports();

  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const reports = (data ?? []) as DailyReportListItem[];

  const projects = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of reports) {
      if (!seen.has(r.projectId) && r.projectName) {
        seen.set(r.projectId, r.projectName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [reports]);

  const filtered = useMemo(() => {
    let list = reports;
    if (selectedProject !== null) {
      list = list.filter((r) => r.projectId === selectedProject);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.workPerformed.toLowerCase().includes(q) ||
          (r.projectName ?? "").toLowerCase().includes(q) ||
          r.submittedByName.toLowerCase().includes(q) ||
          (r.issues ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [reports, search, selectedProject]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
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
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="file-text" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.foreground }]}>
              {search || selectedProject !== null ? "No reports match your search" : "No daily reports yet"}
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              {search || selectedProject !== null
                ? "Try adjusting your search or project filter"
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

  issueRow: {
    marginTop: 6, paddingLeft: 8, borderLeftWidth: 2,
  },
  issueText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },

  emptyContainer: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6, lineHeight: 20 },
});
