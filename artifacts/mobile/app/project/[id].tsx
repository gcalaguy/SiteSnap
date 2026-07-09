import {
  useGetProject,
  useGetProjectSummary,
  useListDailyReports,
  useListRFIs,
  useListTasks,
  useUpdateTask,
  useGetMe,
  useCreateDailyReport,
  useListChangeOrders,
  useListFormSubmissions,
  customFetch,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { DocumentsTab } from "@/components/DocumentsTab";
import { HoursTab } from "@/components/HoursTab";
import { QuotesTab } from "@/components/QuotesTab";
import { PermitsTab } from "@/components/PermitsTab";
import { TimesheetsTab } from "@/components/TimesheetsTab";
import { ClientMessagesTab } from "@/components/ClientMessagesTab";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
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
import { usePermissions } from "@/hooks/usePermissions";
import { Feather } from "@expo/vector-icons";
import { PhotoThumbnail, PhotoLightbox } from "@/components/PhotoThumbnail";
import { ListRow } from "@/components/ui";
import { safeNavigate } from "@/utils/safeNavigate";

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

const TABS = ["Overview", "Reports", "Tasks", "Schedules", "RFIs", "Quotes", "Documents", "Permits", "Hours", "Timesheets", "Messages", "Safety"] as const;
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
          {submittedBy && (
            <View style={styles.reportMetaChip}>
              <Feather name="user" size={11} color={colors.mutedForeground} />
              <Text style={[styles.reportSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {submittedBy}
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
            {!!report.notes && (
              <View style={styles.reportDetailRow}>
                <Feather name="mic" size={13} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Voice Notes</Text>
                  <Text style={[styles.reportDetailText, { color: colors.foreground }]}>{report.notes}</Text>
                </View>
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
                  {photos.map((photo: any) => (
                    <PhotoThumbnail
                      key={photo.id}
                      objectPath={photo.objectPath}
                      size={80}
                      onPress={() => setLightboxPhoto(photo.objectPath)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {!!submittedBy && (
              <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 6 }]}>
                Submitted by {submittedBy}
              </Text>
            )}
            {!!report.createdAt && (
              <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                {new Date(report.createdAt).toLocaleString("en-CA", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit", hour12: true,
                })}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Fullscreen photo lightbox */}
      <PhotoLightbox
        objectPath={lightboxPhoto}
        visible={lightboxPhoto !== null}
        onClose={() => setLightboxPhoto(null)}
      />

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
  emptySection: { borderWidth: 1, borderRadius: 12, borderStyle: "dashed", padding: 28, alignItems: "center", gap: 10 },
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

const schedSt = StyleSheet.create({
  statCard: {
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  workerName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  dateRange: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  assignNotes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
    lineHeight: 17,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  roleText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  eventRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    overflow: "hidden",
    padding: 12,
  },
  eventTypeBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: "stretch",
    flexShrink: 0,
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    marginRight: 8,
  },
  eventMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
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

function ReportsTabSection({
  projectId,
  projectName,
  reports,
  onReportAdded,
}: {
  projectId: number;
  projectName: string | null;
  reports: any[];
  onReportAdded: () => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const createReport = useCreateDailyReport();
  const qc = useQueryClient();

  const today = new Date().toISOString().split("T")[0];
  const nowLabel = new Date().toLocaleString("en-CA", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  function reset() {
    setNotes("");
    setExpanded(false);
    setSubmitted(false);
  }

  async function handleSubmit() {
    if (!notes.trim()) {
      Alert.alert("Empty note", "Please record or type your site note first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    createReport.mutate(
      { projectId, data: { reportDate: today, workPerformed: notes, notes: notes || undefined, crewCount: 1 } },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSubmitted(true);
          onReportAdded();
          setTimeout(reset, 2000);
        },
        onError: () => {
          Alert.alert("Error", "Could not save report. Please try again.");
        },
      }
    );
  }

  return (
    <View style={styles.section}>
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>Daily Reports</Text>
        <TouchableOpacity
          onPress={() => {
            setExpanded((v) => !v);
            setSubmitted(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            backgroundColor: expanded ? `${colors.primary}18` : colors.muted,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
            borderWidth: 1, borderColor: expanded ? colors.primary : colors.border,
          }}
        >
          <Feather name={expanded ? "x" : "plus"} size={13} color={expanded ? colors.primary : colors.mutedForeground} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: expanded ? colors.primary : colors.mutedForeground }}>
            {expanded ? "Cancel" : "Log Note"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inline log panel */}
      {expanded && (
        <View style={{
          borderWidth: 1, borderRadius: 12, borderColor: colors.primary,
          backgroundColor: colors.card, padding: 14, marginBottom: 14,
        }}>
          {/* Timestamp label */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Feather name="clock" size={13} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              {nowLabel}
            </Text>
          </View>

          {/* Mic + label row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0, fontSize: 11 }]}>
              WHAT HAPPENED TODAY?
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="mic" size={12} color={colors.mutedForeground} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                Use the global mic button below
              </Text>
            </View>
          </View>

          {/* Notes textarea */}
          <TextInput
            style={{
              borderRadius: 10, borderWidth: 1, borderColor: colors.border,
              backgroundColor: colors.background, color: colors.foreground,
              paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
              fontFamily: "Inter_400Regular", minHeight: 90, textAlignVertical: "top",
            }}
            value={notes}
            onChangeText={setNotes}
            placeholder="Speak or type your site notes…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={true}
          />

          {/* Submit / success */}
          {submitted ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: "#D1FAE5", borderRadius: 8, padding: 10 }}>
              <Feather name="check-circle" size={16} color="#16A34A" />
              <Text style={{ color: "#15803D", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Report saved!</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={createReport.isPending}
              style={{
                marginTop: 10, borderRadius: 10, paddingVertical: 12, alignItems: "center",
                backgroundColor: createReport.isPending ? colors.muted : colors.primary,
              }}
            >
              {createReport.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 }}>Save Report</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Existing reports list */}
      {reports.length === 0 && !expanded ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No reports yet — tap Log Note to add one</Text>
      ) : (
        [...reports]
          .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime())
          .map((r) => <ReportRow key={r.id} report={r} />)
      )}
    </View>
  );
}


export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [rfiStatusFilter, setRfiStatusFilter] = useState<"all" | "open" | "in_review" | "answered" | "closed">("all");

  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const perms = usePermissions();

  const TAB_PERMISSION_MAP: Partial<Record<Tab, keyof typeof perms>> = {
    Quotes: "viewQuotes",
    Timesheets: "viewTimesheets",
    Schedules: "viewSchedules",
    Documents: "viewDocuments",
    Hours: "viewTimesheets",
    Messages: "viewClientMessages",
    RFIs: "viewRFIs",
    Safety: "viewSafetyTab",
  };

  const visibleTabs = TABS.filter((tab) => {
    // Permits are owner/foreman only (workers have no view into them)
    if (tab === "Permits") return isOwnerOrForeman;
    const key = TAB_PERMISSION_MAP[tab];
    if (key) return perms[key];
    return true;
  });

  // If the currently selected tab gets hidden by permissions, default back to Overview
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab("Overview");
    }
  }, [visibleTabs, activeTab]);

  const { data: project, isLoading, refetch: refetchProject } = useGetProject(projectId);
  const { data: summary, refetch: refetchSummary } = useGetProjectSummary(projectId);
  const { data: reports, refetch: refetchReports } = useListDailyReports(projectId);
  const { data: tasks, refetch: refetchTasks } = useListTasks(projectId);
  const { data: rfis, refetch: refetchRfis } = useListRFIs(
    projectId,
    rfiStatusFilter !== "all" ? { status: rfiStatusFilter as "open" | "in_review" | "answered" | "closed" } : undefined,
  );
  const { data: changeOrders } = useListChangeOrders(
    isOwnerOrForeman ? { projectId } : undefined,
    { query: { enabled: isOwnerOrForeman } as any },
  );
  const { data: safetySubmissions, refetch: refetchSafety } = useListFormSubmissions(
    { projectId },
    { query: { enabled: perms.viewSafetyTab } as any },
  );

  useFocusEffect(
    useCallback(() => {
      refetchProject();
      refetchSummary();
      refetchReports();
      refetchTasks();
      refetchRfis();
      if (perms.viewSafetyTab) refetchSafety();
    }, [refetchProject, refetchSummary, refetchReports, refetchTasks, refetchRfis, refetchSafety, perms.viewSafetyTab]),
  );

  const [clientUploads, setClientUploads] = useState<any[]>([]);
  useEffect(() => {
    customFetch(`/api/projects/${projectId}/portal/uploads`)
      .then((data: any) => setClientUploads(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [projectId]);

  const [scheduleAssignments, setScheduleAssignments] = useState<any[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  useEffect(() => {
    if (activeTab !== "Schedules") return;
    setScheduleLoading(true);
    Promise.all([
      customFetch(`/api/projects/${projectId}/schedule`).catch(() => []),
      customFetch(`/api/schedule/events?projectId=${projectId}`).catch(() => []),
    ]).then(([assignments, events]) => {
      const myUserId = me?.id;
      setScheduleAssignments(
        Array.isArray(assignments)
          ? (myUserId ? assignments.filter((a: any) => a.userId === myUserId) : [])
          : [],
      );
      setScheduleEvents(
        Array.isArray(events)
          ? (myUserId
              ? events.filter((ev: any) =>
                  Array.isArray(ev.assignees) &&
                  ev.assignees.some((a: any) => a.resourceType === "user" && a.resourceId === myUserId),
                )
              : [])
          : [],
      );
    }).finally(() => setScheduleLoading(false));
  }, [projectId, activeTab, me?.id]);

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
        {!!(project as any)?.location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
            <Feather name="map-pin" size={13} color="rgba(255,255,255,0.5)" />
            <Text style={styles.projectLoc}>{(project as any).location}</Text>
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
          {perms.viewRFIs && <StatPill label="RFIs" value={String(summary.openRFICount ?? 0)} icon="alert-circle" />}
          {perms.viewFinancials && <StatPill label="Spend" value={formatCurrency(summary.totalSpent)} icon="dollar-sign" />}
        </View>
      )}

      {/* Tabs — horizontal scroll so all 5 fit on any screen width */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRow}
        contentContainerStyle={styles.tabRowContent}
      >
        {visibleTabs.map(tab => {
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
                <View style={[styles.overviewCell, { borderRightColor: colors.border, borderBottomColor: isWorker ? undefined : colors.border }]}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{summary.reportCount ?? 0}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Reports</Text>
                </View>
                <View style={[styles.overviewCell, { borderBottomColor: isWorker ? undefined : colors.border }]}>
                  <Text style={[styles.overviewValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{summary.openRFICount ?? 0}</Text>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Open RFIs</Text>
                </View>
                {perms.viewRFIs && (
                  <View style={[styles.overviewCell, { borderRightColor: colors.border }]}>
                    <Text style={[styles.overviewValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{summary.closedRFICount ?? 0}</Text>
                    <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Closed RFIs</Text>
                  </View>
                )}
                {perms.viewFinancials && (
                  <View style={styles.overviewCell}>
                    <Text style={[styles.overviewValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(summary.totalSpent)}</Text>
                    <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Total Spent</Text>
                  </View>
                )}
              </View>
              <View style={{ height: 20 }} />
            </>
          )}

          {/* Inspections quick link — inspections moved off the tab bar into
              the Capture flow + this per-project entry point */}
          {perms.viewInspectTab && (
            <>
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border, paddingHorizontal: 14 }]}>
                <ListRow
                  icon="check-square"
                  title="Inspections"
                  subtitle="View or start an inspection for this project"
                  showChevron
                  onPress={() => safeNavigate(router, `/(tabs)/inspect?projectId=${project?.id}`, "project-detail:inspections")}
                />
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

          {/* Change Orders — Owner/Foreman only */}
          {isOwnerOrForeman && (
            <>
              <View style={{ height: 20 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>
                  Change Orders
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                  {(changeOrders ?? []).length}
                </Text>
              </View>
              {(changeOrders ?? []).length === 0 ? (
                <View style={[styles.emptySection, { borderColor: colors.border }]}>
                  <Feather name="file-text" size={22} color={colors.border} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>
                    No change orders for this project
                  </Text>
                </View>
              ) : (
                (changeOrders ?? []).map((co: any) => {
                  const statusColor = co.status === "approved" ? "#22C55E" : co.status === "rejected" ? "#EF4444" : "#F59E0B";
                  const statusLabel = co.status === "approved" ? "Approved" : co.status === "rejected" ? "Rejected" : "Pending";
                  const amount = co.amount != null
                    ? (typeof co.amount === "string" ? parseFloat(co.amount) : Number(co.amount))
                    : null;
                  return (
                    <Pressable
                      key={co.id}
                      style={({ pressed }) => [
                        styles.reportRow,
                        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                      ]}
                      onPress={() => safeNavigate(router, `/change-order/${co.id}`, "project-detail:change-order")}
                    >
                      <View style={[styles.reportDateBadge, { backgroundColor: `${colors.primary}15` }]}>
                        <Feather name="file-text" size={16} color={colors.primary} />
                        <Text style={[styles.reportDateText, { color: colors.primary }]}>
                          {co.status?.slice(0, 3).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={1}>
                          {co.title}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                          {amount != null && (
                            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                              ${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                          )}
                          <View style={[styles.rfiBadge, { backgroundColor: `${statusColor}18` }]}>
                            <Text style={[styles.rfiBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                        </View>
                        {co.createdAt && (
                          <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                            {new Date(co.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                          </Text>
                        )}
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.border} />
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </View>
      )}

      {/* Reports tab */}
      {activeTab === "Reports" && (
        <ReportsTabSection projectId={projectId} projectName={project?.name ?? null} reports={reports ?? []} onReportAdded={refetchReports} />
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

      {/* Schedules tab */}
      {activeTab === "Schedules" && (
        <View style={styles.section}>
          {scheduleLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <>
              {/* Summary stat cards */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <View style={[schedSt.statCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
                  <Feather name="users" size={18} color={colors.primary} />
                  <Text style={[schedSt.statValue, { color: colors.foreground }]}>{scheduleAssignments.length}</Text>
                  <Text style={[schedSt.statLabel, { color: colors.mutedForeground }]}>Workers Scheduled</Text>
                </View>
                <View style={[schedSt.statCard, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
                  <Feather name="calendar" size={18} color={colors.primary} />
                  <Text style={[schedSt.statValue, { color: colors.foreground }]}>{scheduleEvents.length}</Text>
                  <Text style={[schedSt.statLabel, { color: colors.mutedForeground }]}>Events</Text>
                </View>
              </View>

              {/* Workers Scheduled */}
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 10 }]}>Workers Scheduled</Text>
              {scheduleAssignments.length === 0 ? (
                <View style={[schedSt.emptyBox, { borderColor: colors.border }]}>
                  <Feather name="user-x" size={28} color={colors.border} />
                  <Text style={[schedSt.emptyText, { color: colors.mutedForeground }]}>No workers assigned to this project yet</Text>
                </View>
              ) : (
                scheduleAssignments.map((a: any) => {
                  const name = [a.userFirstName, a.userLastName].filter(Boolean).join(" ") || a.userEmail || "Unknown";
                  const start = new Date(a.startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                  const end = new Date(a.endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
                  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <View key={a.id} style={[schedSt.assignRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[schedSt.avatar, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[schedSt.avatarText, { color: colors.primary }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[schedSt.workerName, { color: colors.foreground }]}>{name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                          <Feather name="calendar" size={11} color={colors.mutedForeground} />
                          <Text style={[schedSt.dateRange, { color: colors.mutedForeground }]}>{start} – {end}</Text>
                        </View>
                        {!!a.notes && (
                          <Text style={[schedSt.assignNotes, { color: colors.mutedForeground }]} numberOfLines={2}>{a.notes}</Text>
                        )}
                      </View>
                      <View style={[schedSt.roleBadge, { backgroundColor: `${colors.primary}15` }]}>
                        <Text style={[schedSt.roleText, { color: colors.primary }]}>{a.userRole ?? "worker"}</Text>
                      </View>
                    </View>
                  );
                })
              )}

              <View style={{ height: 20 }} />

              {/* Events */}
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 10 }]}>Events</Text>
              {scheduleEvents.length === 0 ? (
                <View style={[schedSt.emptyBox, { borderColor: colors.border }]}>
                  <Feather name="calendar" size={28} color={colors.border} />
                  <Text style={[schedSt.emptyText, { color: colors.mutedForeground }]}>No events scheduled for this project</Text>
                </View>
              ) : (
                scheduleEvents.map((ev: any) => {
                  const start = new Date(ev.startTime);
                  const end = new Date(ev.endTime);
                  const sameDay = start.toDateString() === end.toDateString();
                  const dateStr = start.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
                  const timeStr = start.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true })
                    + " – " + end.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true });
                  const dateRange = sameDay
                    ? `${dateStr} · ${timeStr}`
                    : `${dateStr} – ${end.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;

                  const typeColors: Record<string, string> = {
                    meeting: "#3B82F6",
                    site_visit: "#22C55E",
                    inspection: "#F59E0B",
                    equipment_booking: "#8B5CF6",
                    other: "#6B7280",
                  };
                  const typeLabels: Record<string, string> = {
                    meeting: "Meeting",
                    site_visit: "Site Visit",
                    inspection: "Inspection",
                    equipment_booking: "Equipment",
                    other: "Event",
                  };
                  const evColor = typeColors[ev.type] ?? "#6B7280";
                  const evLabel = typeLabels[ev.type] ?? ev.type;
                  const statusColors: Record<string, string> = {
                    scheduled: "#3B82F6",
                    in_progress: "#F59E0B",
                    completed: "#22C55E",
                    cancelled: "#EF4444",
                  };
                  const evStatusColor = statusColors[ev.status] ?? "#6B7280";

                  return (
                    <View key={ev.id} style={[schedSt.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[schedSt.eventTypeBar, { backgroundColor: evColor }]} />
                      <View style={{ flex: 1, paddingLeft: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={[schedSt.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{ev.title}</Text>
                          <View style={[schedSt.typeBadge, { backgroundColor: `${evColor}18` }]}>
                            <Text style={[schedSt.typeBadgeText, { color: evColor }]}>{evLabel}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <Feather name="clock" size={11} color={colors.mutedForeground} />
                          <Text style={[schedSt.eventMeta, { color: colors.mutedForeground }]}>{dateRange}</Text>
                        </View>
                        {!!ev.location && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                            <Text style={[schedSt.eventMeta, { color: colors.mutedForeground }]}>{ev.location}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <View style={[schedSt.statusDot, { backgroundColor: evStatusColor }]} />
                          <Text style={[schedSt.eventMeta, { color: evStatusColor, textTransform: "capitalize" }]}>{(ev.status ?? "scheduled").replace("_", " ")}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
      )}

      {/* RFIs tab */}
      {activeTab === "RFIs" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Requests for Information
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["all", "open", "in_review", "answered", "closed"] as const).map((s) => {
                const label =
                  s === "all" ? "All" :
                  s === "open" ? "Open" :
                  s === "in_review" ? "In Review" :
                  s === "answered" ? "Answered" : "Closed";
                const active = rfiStatusFilter === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setRfiStatusFilter(s)}
                    style={[
                      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        { fontSize: 13, fontFamily: "Inter_500Medium" },
                        { color: active ? "#FFFFFF" : colors.mutedForeground },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {(rfis ?? []).length === 0 ? (
            <View style={styles.rfiEmpty}>
              <Feather name="alert-circle" size={32} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {rfiStatusFilter !== "all"
                  ? `No ${rfiStatusFilter === "open" ? "open" : rfiStatusFilter === "in_review" ? "in-review" : rfiStatusFilter === "answered" ? "answered" : "closed"} RFIs`
                  : "No RFIs for this project"}
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
                    safeNavigate(router, `/rfi/${r.id}?projectId=${projectId}`, "project-detail:rfi")
                  }
                />
              ))
          )}
        </View>
      )}

      {/* Quotes tab */}
      {activeTab === "Quotes" && (
        <QuotesTab projectId={projectId} />
      )}

      {/* Documents tab */}
      {activeTab === "Documents" && (
        <DocumentsTab projectId={projectId} clientUploads={clientUploads} />
      )}

      {/* Permits tab */}
      {activeTab === "Permits" && (
        <PermitsTab projectId={projectId} />
      )}

      {/* Hours tab */}
      {activeTab === "Hours" && (
        <HoursTab projectId={projectId} />
      )}

      {/* Timesheets tab */}
      {activeTab === "Timesheets" && (
        <TimesheetsTab projectId={projectId} />
      )}


      {/* Client Messages tab */}
      {activeTab === "Messages" && (
        <ClientMessagesTab projectId={projectId} />
      )}

      {/* Safety & Compliance tab */}
      {activeTab === "Safety" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Safety & Compliance
          </Text>
          {(safetySubmissions ?? []).length === 0 ? (
            <View style={[styles.emptySection, { borderColor: colors.border }]}>
              <Feather name="shield" size={28} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>
                No safety submissions for this project
              </Text>
            </View>
          ) : (
            (safetySubmissions ?? []).map((s: any) => {
              const statusColor = s.status === "approved" ? "#22C55E" : s.status === "reviewed" ? "#F59E0B" : s.status === "submitted" ? "#3B82F6" : "#6B7280";
              const statusLabel = s.status === "approved" ? "Approved" : s.status === "reviewed" ? "Reviewed" : s.status === "submitted" ? "Submitted" : "Draft";
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.reportRow,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={() => {}}
                >
                  <View style={[styles.reportDateBadge, { backgroundColor: `${statusColor}15` }]}>
                    <Feather name="shield" size={16} color={statusColor} />
                    <Text style={[styles.reportDateText, { color: statusColor, fontSize: 10 }]}>
                      {statusLabel.toUpperCase().slice(0, 3)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={1}>
                      {s.templateName ?? "Untitled Form"}
                    </Text>
                    <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                      {s.workerName ?? "Unknown"}
                    </Text>
                    {s.createdAt && (
                      <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                        {new Date(s.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.border} />
                </Pressable>
              );
            })
          )}
        </View>
      )}

    </ScrollView>
  );
}
