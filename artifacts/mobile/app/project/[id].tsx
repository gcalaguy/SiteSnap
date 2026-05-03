import {
  useGetProject,
  useGetProjectSummary,
  useListDailyReports,
  useListRFIs,
  useListTasks,
  useUpdateTask,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  completed: "#6B7280",
  on_hold: "#F59E0B",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
};

const TABS = ["Overview", "Reports", "Tasks", "RFIs"] as const;
type Tab = (typeof TABS)[number];

const RFI_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#F59E0B", bg: "#FEF3C7" },
  in_review: { label: "In Review", color: "#3B82F6", bg: "#DBEAFE" },
  resolved: { label: "Resolved", color: "#22C55E", bg: "#DCFCE7" },
  closed: { label: "Closed", color: "#6B7280", bg: "#F3F4F6" },
};

function StatPill({ label, value, icon }: { label: string; value: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[stat.pill, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={14} color={colors.primary} />
      <Text style={[stat.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[stat.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const stat = StyleSheet.create({
  pill: { flex: 1, alignItems: "center", padding: 12, borderRadius: 10, gap: 4, borderWidth: 1 },
  value: { fontSize: 18, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

function ReportRow({ report }: { report: any }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const dateLabel = new Date(report.reportDate).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const submittedBy = report.submittedBy
    ? `${(report.submittedBy.firstName ?? "")} ${(report.submittedBy.lastName ?? "")}`.trim() || report.submittedBy.email || null
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.reportRow,
        { backgroundColor: colors.card, borderColor: expanded ? colors.primary : colors.border, opacity: pressed ? 0.92 : 1 },
      ]}
      onPress={() => setExpanded((v) => !v)}
    >
      {/* Date badge */}
      <View style={[styles.reportDateBadge, { backgroundColor: `${colors.primary}15` }]}>
        <Text style={[styles.reportDateText, { color: colors.primary }]}>
          {new Date(report.reportDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
        </Text>
        <Text style={[{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.primary, textAlign: "center" }]}>
          {new Date(report.reportDate).toLocaleDateString("en-CA", { weekday: "short" })}
        </Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {/* Summary line always visible */}
        <Text
          style={[styles.reportMeta, { color: colors.foreground }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {report.workPerformed}
        </Text>

        {/* Meta row */}
        <View style={styles.reportMetaRow}>
          {report.crewCount != null && (
            <View style={styles.reportMetaChip}>
              <Feather name="users" size={11} color={colors.mutedForeground} />
              <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
                {report.crewCount}
              </Text>
            </View>
          )}
          {!!report.weather && (
            <View style={styles.reportMetaChip}>
              <Feather name="cloud" size={11} color={colors.mutedForeground} />
              <Text style={[styles.reportSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {report.weather}
              </Text>
            </View>
          )}
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={[styles.reportExpanded, { borderTopColor: colors.border }]}>
            {!!report.materialsUsed && (
              <View style={styles.reportDetailRow}>
                <Feather name="package" size={13} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Materials Used</Text>
                  <Text style={[styles.reportDetailText, { color: colors.foreground }]}>{report.materialsUsed}</Text>
                </View>
              </View>
            )}
            {!!report.equipment && (
              <View style={styles.reportDetailRow}>
                <Feather name="tool" size={13} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Equipment</Text>
                  <Text style={[styles.reportDetailText, { color: colors.foreground }]}>{report.equipment}</Text>
                </View>
              </View>
            )}
            {!!report.issues && (
              <View style={styles.reportDetailRow}>
                <Feather name="alert-triangle" size={13} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Issues / Delays</Text>
                  <Text style={[styles.reportDetailText, { color: colors.foreground }]}>{report.issues}</Text>
                </View>
              </View>
            )}
            {!!report.aiSummary && (
              <View style={[styles.reportAiBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}30` }]}>
                <View style={styles.reportDetailRow}>
                  <Feather name="zap" size={13} color={colors.primary} />
                  <Text style={[styles.reportDetailLabel, { color: colors.primary }]}>AI Summary</Text>
                </View>
                <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>{report.aiSummary}</Text>
              </View>
            )}
            {!!submittedBy && (
              <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 6 }]}>
                Submitted by {submittedBy}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Expand chevron */}
      <Feather
        name={expanded ? "chevron-up" : "chevron-down"}
        size={16}
        color={expanded ? colors.primary : colors.border}
        style={{ marginTop: 2 }}
      />
    </Pressable>
  );
}

function TaskItem({ task, projectId, onUpdate }: { task: any; projectId: number; onUpdate: () => void }) {
  const colors = useColors();
  const updateTask = useUpdateTask();
  const isDone = task.status === "done";

  const toggle = () => {
    const nextStatus = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask.mutate(
      { projectId, taskId: task.id, data: { status: nextStatus } },
      { onSuccess: onUpdate }
    );
  };

  const priorityColors: Record<string, string> = { high: "#EF4444", medium: "#F59E0B", low: "#6B7280" };

  return (
    <Pressable
      style={({ pressed }) => [styles.taskItem, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      onPress={toggle}
    >
      <View style={[styles.taskCheck, { backgroundColor: isDone ? colors.primary : "transparent", borderColor: isDone ? colors.primary : colors.border }]}>
        {isDone && <Feather name="check" size={11} color="#FFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, { color: isDone ? colors.mutedForeground : colors.foreground }, isDone && { textDecorationLine: "line-through" }]} numberOfLines={2}>
          {task.title}
        </Text>
      </View>
      <View style={[styles.priorityDot, { backgroundColor: priorityColors[task.priority] ?? "#6B7280" }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { paddingHorizontal: 20, paddingBottom: 20 },
  projectName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 6 },
  projectLoc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginBottom: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 16, gap: 6 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  reportRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  reportDateBadge: { borderRadius: 6, padding: 8, minWidth: 44, alignItems: "center" },
  reportDateText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  reportMeta: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  reportSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  reportMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  reportMetaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  reportExpanded: { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 10 },
  reportDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  reportDetailLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  reportDetailText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  reportAiBox: { borderRadius: 8, borderWidth: 1, padding: 10, gap: 2 },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  taskCheck: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  taskTitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rfiBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 5 },
  rfiBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rfiEmpty: { alignItems: "center", paddingVertical: 32, gap: 8 },
});

function RFIRow({ rfi, onPress }: { rfi: any; onPress: () => void }) {
  const colors = useColors();
  const conf = RFI_STATUS_CONFIG[rfi.status] ?? RFI_STATUS_CONFIG.open;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.reportRow,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.reportDateBadge, { backgroundColor: `${colors.primary}15` }]}>
        <Feather name="alert-circle" size={16} color={colors.primary} />
        <Text style={[styles.reportDateText, { color: colors.primary }]}>{rfi.rfiNumber}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={2}>
          {rfi.subject}
        </Text>
        <View style={[styles.rfiBadge, { backgroundColor: conf.bg }]}>
          <Text style={[styles.rfiBadgeText, { color: conf.color }]}>{conf.label}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.border} />
    </Pressable>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const { data: project, isLoading } = useGetProject(projectId);
  const { data: summary } = useGetProjectSummary(projectId);
  const { data: reports, refetch: refetchReports } = useListDailyReports(projectId);
  const { data: tasks, refetch: refetchTasks } = useListTasks(projectId);
  const { data: rfis } = useListRFIs(projectId);

  const formatCurrency = (v?: number | null) => {
    if (v == null) return "—";
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    return `$${(v / 1_000).toFixed(0)}K`;
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
    >
      {/* Project header */}
      <View style={[styles.headerBg, { backgroundColor: colors.sidebar, paddingTop: topInsets + 20 }]}>
        <Text style={styles.projectName}>{project?.name ?? "Project"}</Text>
        {!!project?.location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
            <Feather name="map-pin" size={13} color="rgba(255,255,255,0.5)" />
            <Text style={styles.projectLoc}>{project.location}</Text>
          </View>
        )}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[project?.status ?? "active"] }]} />
          <Text style={styles.statusText}>{STATUS_LABELS[project?.status ?? "active"]}</Text>
        </View>
      </View>

      {/* Stats */}
      {summary && (
        <View style={styles.statsRow}>
          <StatPill label="Reports" value={String(summary.reportCount ?? 0)} icon="file-text" />
          <StatPill label="RFIs" value={String(summary.openRFIs ?? 0)} icon="alert-circle" />
          <StatPill label="Spend" value={formatCurrency(summary.totalSpend)} icon="dollar-sign" />
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(tab => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              style={[styles.tab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Overview tab */}
      {activeTab === "Overview" && (
        <View style={styles.section}>
          {project?.description && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Description</Text>
              <Text style={[styles.descText, { color: colors.foreground }]}>{project.description}</Text>
              <View style={{ height: 16 }} />
            </>
          )}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Details</Text>
          {project?.startDate && (
            <View style={styles.infoRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                Start: {new Date(project.startDate).toLocaleDateString("en-CA")}
              </Text>
            </View>
          )}
          {project?.endDate && (
            <View style={styles.infoRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                End: {new Date(project.endDate).toLocaleDateString("en-CA")}
              </Text>
            </View>
          )}
          {project?.budget != null && (
            <View style={styles.infoRow}>
              <Feather name="dollar-sign" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                Budget: {formatCurrency(project.budget)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Reports tab */}
      {activeTab === "Reports" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Daily Reports</Text>
          {(reports ?? []).length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No reports yet</Text>
          ) : (
            [...(reports ?? [])].sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime()).map(r => (
              <ReportRow key={r.id} report={r} />
            ))
          )}
        </View>
      )}

      {/* Tasks tab */}
      {activeTab === "Tasks" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Tasks</Text>
          {(tasks ?? []).length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks yet</Text>
          ) : (
            (tasks ?? []).map(t => (
              <TaskItem key={t.id} task={t} projectId={projectId} onUpdate={refetchTasks} />
            ))
          )}
        </View>
      )}

      {/* RFIs tab */}
      {activeTab === "RFIs" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Requests for Information
          </Text>
          {(rfis ?? []).length === 0 ? (
            <View style={styles.rfiEmpty}>
              <Feather name="alert-circle" size={32} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No RFIs for this project
              </Text>
            </View>
          ) : (
            [...(rfis ?? [])]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map(r => (
                <RFIRow
                  key={r.id}
                  rfi={r}
                  onPress={() =>
                    router.push(`/rfi/${r.id}?projectId=${projectId}`)
                  }
                />
              ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
