import {
  useGetProject,
  useGetProjectSummary,
  useListDailyReports,
  useListDocuments,
  useListRFIs,
  useListTasks,
  useUpdateTask,
  customFetch,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
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

function photoUrl(objectPath: string): string {
  const base = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  return `${base}${objectPath.replace(/^\/objects\//, "/api/storage/objects/")}`;
}

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

const TABS = ["Overview", "Reports", "Tasks", "RFIs", "Documents"] as const;
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
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const photos: any[] = report.photos ?? [];

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
          {photos.length > 0 && (
            <View style={styles.reportMetaChip}>
              <Feather name="camera" size={11} color={colors.mutedForeground} />
              <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
                {photos.length}
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

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.reportDetailRow}>
                  <Feather name="camera" size={13} color={colors.primary} />
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>
                    Site Photos ({photos.length})
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {photos.map((photo: any) => {
                    const uri = photoUrl(photo.objectPath);
                    return (
                      <Pressable
                        key={photo.id}
                        onPress={() => setLightboxPhoto(uri)}
                        style={{ marginRight: 8 }}
                      >
                        <Image
                          source={{ uri }}
                          style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                          resizeMode="cover"
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
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

      {/* Fullscreen photo lightbox */}
      <Modal visible={lightboxPhoto !== null} transparent animationType="fade" onRequestClose={() => setLightboxPhoto(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}
          onPress={() => setLightboxPhoto(null)}
        >
          {lightboxPhoto && (
            <Image
              source={{ uri: lightboxPhoto }}
              style={{ width: "95%", height: "75%", borderRadius: 10 }}
              resizeMode="contain"
            />
          )}
          <View style={{ position: "absolute", top: 52, right: 20 }}>
            <Feather name="x" size={28} color="#fff" />
          </View>
        </Pressable>
      </Modal>

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
  const [expanded, setExpanded] = useState(false);
  const isDone = task.status === "done";

  const priorityColors: Record<string, string> = { high: "#EF4444", medium: "#F59E0B", low: "#6B7280" };
  const priorityLabels: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
  const statusLabels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
  const statusColors: Record<string, string> = { todo: "#6B7280", in_progress: colors.primary, done: "#22C55E" };

  const cycleStatus = () => {
    const nextStatus = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask.mutate(
      { projectId, taskId: task.id, data: { status: nextStatus } },
      { onSuccess: onUpdate }
    );
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.taskItem,
        { backgroundColor: colors.card, borderColor: expanded ? colors.primary : colors.border, opacity: pressed ? 0.88 : 1 },
      ]}
      onPress={() => setExpanded((v) => !v)}
    >
      {/* Checkbox — tapping it cycles status without expanding */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); cycleStatus(); }}
        hitSlop={8}
        style={[styles.taskCheck, { backgroundColor: isDone ? colors.primary : "transparent", borderColor: isDone ? colors.primary : colors.border }]}
      >
        {isDone && <Feather name="check" size={11} color="#FFF" />}
        {task.status === "in_progress" && !isDone && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
        )}
      </Pressable>

      <View style={{ flex: 1 }}>
        {/* Title — always visible, unclamped when expanded */}
        <Text
          style={[
            styles.taskTitle,
            { color: isDone ? colors.mutedForeground : colors.foreground },
            isDone && { textDecorationLine: "line-through" },
          ]}
          numberOfLines={expanded ? undefined : 2}
        >
          {task.title}
        </Text>

        {/* Compact meta row (collapsed) */}
        {!expanded && (
          <View style={styles.taskMetaRow}>
            <View style={[styles.taskPriorityDot, { backgroundColor: priorityColors[task.priority] ?? "#6B7280" }]} />
            <Text style={[styles.taskMetaText, { color: priorityColors[task.priority] ?? "#6B7280" }]}>
              {priorityLabels[task.priority] ?? "Medium"}
            </Text>
            {!!task.dueDate && (
              <>
                <Text style={[styles.taskMetaSep, { color: colors.border }]}>·</Text>
                <Feather name="calendar" size={11} color={colors.mutedForeground} />
                <Text style={[styles.taskMetaText, { color: colors.mutedForeground }]}>
                  {new Date(task.dueDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                </Text>
              </>
            )}
            {task.status === "in_progress" && (
              <>
                <Text style={[styles.taskMetaSep, { color: colors.border }]}>·</Text>
                <Text style={[styles.taskMetaText, { color: colors.primary }]}>In Progress</Text>
              </>
            )}
          </View>
        )}

        {/* Expanded details */}
        {expanded && (
          <View style={[styles.taskExpanded, { borderTopColor: colors.border }]}>
            {/* Description */}
            {!!task.description && (
              <View style={styles.taskDetailRow}>
                <Feather name="align-left" size={13} color={colors.mutedForeground} />
                <Text style={[styles.taskDetailText, { color: colors.foreground }]}>{task.description}</Text>
              </View>
            )}

            {/* Status + Priority + Due Date chips */}
            <View style={styles.taskChipRow}>
              <View style={[styles.taskChip, { backgroundColor: `${statusColors[task.status]}18` }]}>
                <View style={[styles.taskPriorityDot, { backgroundColor: statusColors[task.status] }]} />
                <Text style={[styles.taskChipText, { color: statusColors[task.status] }]}>
                  {statusLabels[task.status] ?? task.status}
                </Text>
              </View>
              <View style={[styles.taskChip, { backgroundColor: `${priorityColors[task.priority] ?? "#6B7280"}18` }]}>
                <Text style={[styles.taskChipText, { color: priorityColors[task.priority] ?? "#6B7280" }]}>
                  {priorityLabels[task.priority] ?? "Medium"} priority
                </Text>
              </View>
              {!!task.dueDate && (
                <View style={[styles.taskChip, { backgroundColor: colors.muted }]}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.taskChipText, { color: colors.mutedForeground }]}>
                    Due {new Date(task.dueDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </Text>
                </View>
              )}
            </View>

            {/* Tap-to-cycle status hint */}
            <Pressable
              onPress={cycleStatus}
              style={[styles.taskCycleBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="refresh-cw" size={12} color="#FFF" />
              <Text style={styles.taskCycleBtnText}>
                Mark as {task.status === "done" ? "To Do" : task.status === "todo" ? "In Progress" : "Done"}
              </Text>
            </Pressable>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { paddingHorizontal: 20, paddingBottom: 20 },
  projectName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 6 },
  projectLoc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginBottom: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  tabRow: { marginBottom: 16 },
  tabRowContent: { flexDirection: "row", paddingHorizontal: 20, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  taskPriorityDot: { width: 6, height: 6, borderRadius: 3 },
  taskMetaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  taskMetaSep: { fontSize: 12 },
  taskExpanded: { borderTopWidth: 1, marginTop: 10, paddingTop: 10, gap: 10 },
  taskDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskDetailText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, flex: 1 },
  taskChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  taskChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  taskChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  taskCycleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8 },
  taskCycleBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rfiBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 5 },
  rfiBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rfiEmpty: { alignItems: "center", paddingVertical: 32, gap: 8 },
  clientUploadHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  clientUploadBadge: { backgroundColor: "#3B82F620", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  clientUploadBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#3B82F6" },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  overviewCell: {
    width: "50%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  overviewValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },
  overviewLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  detailCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
  docRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docFilename: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docSummary: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 17 },
  docStatusChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  docStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
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
  const { data: documents } = useListDocuments(projectId);

  const [clientUploads, setClientUploads] = useState<any[]>([]);
  useEffect(() => {
    customFetch(`/api/projects/${projectId}/portal/uploads`)
      .then((data: any) => setClientUploads(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [projectId]);

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

      {/* Tabs — horizontal scroll so all 5 fit on any screen width */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRow}
        contentContainerStyle={styles.tabRowContent}
      >
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
      </ScrollView>

      {/* Overview tab */}
      {activeTab === "Overview" && (
        <View style={styles.section}>

          {/* Description */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Description</Text>
          <Text style={[styles.descText, { color: project?.description ? colors.foreground : colors.mutedForeground }]}>
            {project?.description ?? "No description added yet."}
          </Text>

          <View style={{ height: 20 }} />

          {/* Activity summary */}
          {summary && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Activity</Text>
              <View style={[styles.overviewGrid, { borderColor: colors.border }]}>
                <View style={[styles.overviewCell, { borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]}>{summary.taskCount ?? 0}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Tasks</Text>
                </View>
                <View style={[styles.overviewCell, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]}>{summary.reportCount ?? 0}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Reports</Text>
                </View>
                <View style={[styles.overviewCell, { borderRightColor: colors.border }]}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]}>{summary.openRFIs ?? 0}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Open RFIs</Text>
                </View>
                <View style={styles.overviewCell}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]}>{formatCurrency(summary.totalSpend)}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Total Spend</Text>
                </View>
              </View>
              <View style={{ height: 20 }} />
            </>
          )}

          {/* Project details */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Details</Text>
          <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.detailRow}>
              <Feather name="tag" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Status</Text>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[project?.status ?? "active"], marginRight: 4 }]} />
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {STATUS_LABELS[project?.status ?? "active"]}
              </Text>
            </View>
            <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Start Date</Text>
              <Text style={[styles.detailValue, { color: project?.startDate ? colors.foreground : colors.mutedForeground }]}>
                {project?.startDate ? new Date(project.startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}
              </Text>
            </View>
            <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>End Date</Text>
              <Text style={[styles.detailValue, { color: project?.endDate ? colors.foreground : colors.mutedForeground }]}>
                {project?.endDate ? new Date(project.endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}
              </Text>
            </View>
            <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Feather name="dollar-sign" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Budget</Text>
              <Text style={[styles.detailValue, { color: project?.budget != null ? colors.foreground : colors.mutedForeground }]}>
                {project?.budget != null ? formatCurrency(project.budget) : "Not set"}
              </Text>
            </View>
          </View>
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

      {/* Documents tab */}
      {activeTab === "Documents" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Uploaded Files</Text>
          {(documents ?? []).length === 0 ? (
            <View style={styles.rfiEmpty}>
              <Feather name="folder" size={32} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No documents uploaded yet
              </Text>
            </View>
          ) : (
            [...(documents ?? [])]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((doc: any) => {
                const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(
                  (doc.fileType ?? "").toLowerCase()
                );
                const isPdf = doc.fileType === "application/pdf";
                const iconName = isImage ? "image" : isPdf ? "file-text" : "file";
                const fileUrl = `${
                  process.env.EXPO_PUBLIC_DOMAIN
                    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
                    : ""
                }${doc.objectPath.replace(/^\/objects\//, "/api/storage/objects/")}`;

                const statusColors: Record<string, string> = {
                  ready: "#22C55E",
                  processing: "#F59E0B",
                  pending: "#6B7280",
                  failed: "#EF4444",
                };
                const statusLabels: Record<string, string> = {
                  ready: "AI Ready",
                  processing: "Processing",
                  pending: "Pending",
                  failed: "Failed",
                };

                return (
                  <Pressable
                    key={doc.id}
                    onPress={() => Linking.openURL(fileUrl)}
                    style={({ pressed }) => [
                      styles.docRow,
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    {/* Icon */}
                    <View style={[styles.docIcon, { backgroundColor: `${colors.primary}15` }]}>
                      <Feather name={iconName as any} size={20} color={colors.primary} />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.docFilename, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {doc.filename}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        {doc.fileSize && (
                          <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                            {doc.fileSize > 1_000_000
                              ? `${(doc.fileSize / 1_000_000).toFixed(1)} MB`
                              : `${Math.round(doc.fileSize / 1024)} KB`}
                          </Text>
                        )}
                        {doc.status && (
                          <View style={[styles.docStatusChip, { backgroundColor: `${statusColors[doc.status] ?? "#6B7280"}18` }]}>
                            <Text style={[styles.docStatusText, { color: statusColors[doc.status] ?? "#6B7280" }]}>
                              {statusLabels[doc.status] ?? doc.status}
                            </Text>
                          </View>
                        )}
                      </View>
                      {doc.aiSummary && (
                        <Text style={[styles.docSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {doc.aiSummary}
                        </Text>
                      )}
                      <Text style={[styles.docMeta, { color: colors.mutedForeground, marginTop: 2 }]}>
                        {new Date(doc.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>

                    {/* Open arrow */}
                    <Feather name="external-link" size={15} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                  </Pressable>
                );
              })
          )}

          {/* Client uploads */}
          {clientUploads.length > 0 && (
            <>
              <View style={[styles.clientUploadHeader, { marginTop: (documents ?? []).length > 0 ? 20 : 0 }]}>
                <Feather name="user" size={14} color="#3B82F6" />
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>Client Uploads</Text>
                <View style={styles.clientUploadBadge}>
                  <Text style={styles.clientUploadBadgeText}>{clientUploads.length}</Text>
                </View>
              </View>
              {clientUploads.map((upload: any) => {
                const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(
                  (upload.fileType ?? "").toLowerCase()
                );
                const isPdf = upload.fileType === "application/pdf";
                const iconName = isImage ? "image" : isPdf ? "file-text" : "file";
                const fileUrl = `${
                  process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""
                }${upload.objectPath.replace(/^\/objects\//, "/api/storage/objects/")}`;
                return (
                  <Pressable
                    key={upload.id}
                    onPress={() => Linking.openURL(fileUrl)}
                    style={({ pressed }) => [
                      styles.docRow,
                      { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <View style={[styles.docIcon, { backgroundColor: "#3B82F618" }]}>
                      <Feather name={iconName as any} size={20} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.docFilename, { color: colors.foreground }]} numberOfLines={1}>
                        {upload.filename}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        {upload.fileSize && (
                          <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>
                            {upload.fileSize > 1_000_000
                              ? `${(upload.fileSize / 1_000_000).toFixed(1)} MB`
                              : `${Math.round(upload.fileSize / 1024)} KB`}
                          </Text>
                        )}
                        <View style={[styles.docStatusChip, { backgroundColor: "#3B82F618" }]}>
                          <Text style={[styles.docStatusText, { color: "#3B82F6" }]}>From Client</Text>
                        </View>
                      </View>
                      <Text style={[styles.docMeta, { color: colors.mutedForeground, marginTop: 2 }]}>
                        {new Date(upload.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <Feather name="external-link" size={15} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
