import {
  useGetProject,
  useGetProjectSummary,
  useListDailyReports,
  useListRFIs,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useCreateScheduleAssignment,
  useGetMe,
  useCreateDailyReport,
  useDeleteReportPhoto,
  getListDailyReportsQueryKey,
  useListChangeOrders,
  useListFormSubmissions,
  useUpdateProject,
  useDeleteProject,
  getListProjectsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { TaskFormSheet, type TaskFormValues } from "@/components/sheets/TaskFormSheet";
import { ScheduleFormSheet, type ScheduleFormValues } from "@/components/sheets/ScheduleFormSheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { DocumentsTab } from "@/components/DocumentsTab";
import { HoursTab } from "@/components/HoursTab";
import { QuotesTab } from "@/components/QuotesTab";
import { PermitsTab } from "@/components/PermitsTab";
import { TimesheetsTab } from "@/components/TimesheetsTab";
import { ClientMessagesTab } from "@/components/ClientMessagesTab";
import { CommunicationsTab } from "@/components/CommunicationsTab";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { Feather } from "@expo/vector-icons";
import { PhotoThumbnail, PhotoLightbox, CategoryPill, type PhotoCategory } from "@/components/PhotoThumbnail";
import { ListRow, BottomSheet, Card, Button, Badge, Chip, EmptyState, StatTile, StatusPill } from "@/components/ui";
import { safeNavigate } from "@/utils/safeNavigate";
import { BulletList } from "@/components/BulletList";
import { elevation, layout, radius, spacing, typography } from "@/constants/theme";
import type { PsiListRow } from "@/constants/psi";

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

const TABS = ["Overview", "Reports", "Tasks", "Schedules", "RFIs", "Quotes", "Documents", "Permits", "Hours", "Timesheets", "Messages", "Communications", "Safety"] as const;
type Tab = (typeof TABS)[number];

// Main tabs stay as top-level pills; everything else groups into a category
// that opens a bottom sheet, so the bar never overflows or needs horizontal
// scrolling regardless of how many tabs permissions leave visible.
const MAIN_TABS: Tab[] = ["Overview", "Tasks", "Reports"];
const TAB_LABELS: Partial<Record<Tab, string>> = { Reports: "Daily Reports" };
type CategoryKey = "financials" | "docs" | "safety";
const TAB_CATEGORIES: { key: CategoryKey; label: string; tabs: Tab[] }[] = [
  { key: "financials", label: "Financials", tabs: ["Quotes", "Hours", "Timesheets"] },
  { key: "docs", label: "Docs & Communication", tabs: ["RFIs", "Documents", "Messages", "Communications", "Permits"] },
  { key: "safety", label: "Safety & Team", tabs: ["Schedules", "Safety"] },
];

const RFI_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#F59E0B", bg: "#FEF3C7" },
  in_review: { label: "In Review", color: "#3B82F6", bg: "#DBEAFE" },
  resolved: { label: "Resolved", color: "#22C55E", bg: "#DCFCE7" },
  closed: { label: "Closed", color: "#6B7280", bg: "#F3F4F6" },
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function StatPill({ label, value, icon }: { label: string; value: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[stat.pill, elevation.card, { backgroundColor: colors.cardElevated, borderColor: colors.borderSoft }]}>
      <Feather name={icon as any} size={14} color={colors.primary} />
      <Text style={[typography.heading, { color: colors.foreground }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const stat = StyleSheet.create({
  pill: { flex: 1, alignItems: "center", padding: spacing.md, borderRadius: radius.md, gap: spacing.xs, borderWidth: 1 },
});

function ReportRow({ report, projectId, isOwnerOrForeman, onPhotoDeleted }: { report: any; projectId: number; isOwnerOrForeman: boolean; onPhotoDeleted: () => void }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<any | null>(null);
  const photos: any[] = report.photos ?? [];
  const deletePhoto = useDeleteReportPhoto({
    mutation: { onSuccess: onPhotoDeleted },
  });

  const dateLabel = new Date(report.reportDate).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const submittedBy = report.submittedBy
    ? `${(report.submittedBy.firstName ?? "")} ${(report.submittedBy.lastName ?? "")}`.trim() || report.submittedBy.email || null
    : null;

  return (
    <Card
      onPress={() => setExpanded((v) => !v)}
      elevated={false}
      style={[styles.rowCard, { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderColor: expanded ? colors.primary : colors.border }]}
    >
      {/* Date badge */}
      <View style={[styles.reportDateBadge, { backgroundColor: `${colors.primary}15` }]}>
        <Text style={[styles.reportDateText, { color: colors.primary }]}>
          {new Date(report.reportDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
        </Text>
        <Text style={[typography.label, { fontSize: 10, letterSpacing: 0, color: colors.primary, textAlign: "center" }]}>
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
          <Badge label={report.issues ? "Issues" : "On Track"} status={report.issues ? "warning" : "success"} />
        </View>

        {!expanded && !!report.aiSummary && (
          <Text style={[styles.reportSub, { color: colors.mutedForeground, marginTop: 4 }]} numberOfLines={2}>
            {report.aiSummary}
          </Text>
        )}

        {/* Expanded details */}
        {expanded && (
          <View style={[styles.reportExpanded, { borderTopColor: colors.border }]}>
            {!!report.materialsUsed && (
              <View style={styles.reportDetailRow}>
                <Feather name="package" size={13} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Materials Used</Text>
                  <BulletList text={report.materialsUsed} textStyle={[styles.reportDetailText, { color: colors.foreground }]} />
                </View>
              </View>
            )}
            {!!report.equipment && (
              <View style={styles.reportDetailRow}>
                <Feather name="tool" size={13} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Equipment</Text>
                  <BulletList text={report.equipment} textStyle={[styles.reportDetailText, { color: colors.foreground }]} />
                </View>
              </View>
            )}
            {!!report.issues && (
              <View style={styles.reportDetailRow}>
                <Feather name="alert-triangle" size={13} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Issues / Delays</Text>
                  <BulletList text={report.issues} textStyle={[styles.reportDetailText, { color: colors.foreground }]} />
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
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Notes / Next Steps</Text>
                  <BulletList text={report.notes} textStyle={[styles.reportDetailText, { color: colors.foreground }]} />
                </View>
              </View>
            )}

            {/* Photo thumbnails — grouped by category */}
            {photos.length > 0 && (
              <View style={{ marginTop: 10, gap: 10 }}>
                {[
                  { key: "progress", label: "Progress Photos" },
                  { key: "issue", label: "Issues / Defects" },
                  { key: "site_condition", label: "Site Conditions" },
                ].map(({ key, label }) => {
                  const group = photos.filter((p: any) => (p.category ?? "progress") === key);
                  if (group.length === 0) return null;
                  return (
                    <View key={key}>
                      <View style={styles.reportDetailRow}>
                        <Feather name="camera" size={13} color={colors.primary} />
                        <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>
                          {label} ({group.length})
                        </Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        {group.map((photo: any) => (
                          <PhotoThumbnail
                            key={photo.id}
                            objectPath={photo.objectPath}
                            category={photo.category as PhotoCategory}
                            size={80}
                            onPress={() => setLightboxPhoto(photo)}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  );
                })}
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
        objectPath={lightboxPhoto?.objectPath ?? null}
        visible={lightboxPhoto !== null}
        onClose={() => setLightboxPhoto(null)}
        category={lightboxPhoto?.category as PhotoCategory}
        uploaderName={submittedBy}
        uploadedAt={lightboxPhoto?.uploadedAt}
        onDelete={isOwnerOrForeman && lightboxPhoto ? () => deletePhoto.mutate({ projectId, reportId: report.id, photoId: lightboxPhoto.id }) : undefined}
      />

      {/* Expand chevron */}
      <Feather
        name={expanded ? "chevron-up" : "chevron-down"}
        size={16}
        color={expanded ? colors.primary : colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
    </Card>
  );
}

function SafetySubmissionRow({ submission, colors }: { submission: any; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = submission.status === "approved" ? "#22C55E" : submission.status === "reviewed" ? "#F59E0B" : submission.status === "submitted" ? "#3B82F6" : "#6B7280";
  const statusLabel = submission.status === "approved" ? "Approved" : submission.status === "reviewed" ? "Reviewed" : submission.status === "submitted" ? "Submitted" : "Draft";

  return (
    <Card
      onPress={() => setExpanded((v) => !v)}
      elevated={false}
      style={[styles.rowCard, { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderColor: expanded ? colors.primary : colors.border }]}
    >
      <View style={[styles.reportDateBadge, { backgroundColor: `${statusColor}15` }]}>
        <Feather name="shield" size={16} color={statusColor} />
        <Text style={[styles.reportDateText, { color: statusColor, fontSize: 10 }]}>
          {statusLabel.toUpperCase().slice(0, 3)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={1}>
          {submission.templateName ?? "Untitled Form"}
        </Text>
        <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
          {submission.workerName ?? "Unknown"}
        </Text>
        {!!submission.createdAt && (
          <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
            {new Date(submission.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        )}
        {expanded && (
          <View style={{ marginTop: 8, gap: 8 }}>
            <View>
              <View style={styles.reportDetailRow}>
                <Feather name="calendar" size={13} color={colors.mutedForeground} />
                <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Status</Text>
              </View>
              <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>{statusLabel}</Text>
            </View>
            {!!submission.workerEmail && (
              <View>
                <View style={styles.reportDetailRow}>
                  <Feather name="mail" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Worker Email</Text>
                </View>
                <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>{submission.workerEmail}</Text>
              </View>
            )}
            {!!submission.reviewedAt && (
              <View>
                <View style={styles.reportDetailRow}>
                  <Feather name="check-circle" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Reviewed</Text>
                </View>
                <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>
                  {new Date(submission.reviewedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </View>
            )}
            {!!submission.reviewNotes && (
              <View>
                <View style={styles.reportDetailRow}>
                  <Feather name="message-square" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>Review Notes</Text>
                </View>
                <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>{submission.reviewNotes}</Text>
              </View>
            )}
            {!!submission.aiSummary && (
              <View style={[styles.reportAiBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}30` }]}>
                <View style={styles.reportDetailRow}>
                  <Feather name="zap" size={13} color={colors.primary} />
                  <Text style={[styles.reportDetailLabel, { color: colors.primary }]}>AI Summary</Text>
                </View>
                <Text style={[styles.reportDetailText, { color: colors.foreground, marginTop: 4 }]}>{submission.aiSummary}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={expanded ? colors.primary : colors.mutedForeground} />
    </Card>
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
    <Card
      onPress={() => setExpanded((v) => !v)}
      elevated={false}
      style={[styles.rowCard, { flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: expanded ? colors.primary : colors.border }]}
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
            <Button
              label={`Mark as ${task.status === "done" ? "To Do" : task.status === "todo" ? "In Progress" : "Done"}`}
              icon="refresh-cw"
              onPress={cycleStatus}
              fullWidth
            />
          </View>
        )}
      </View>

      {/* Expand chevron */}
      <Feather
        name={expanded ? "chevron-up" : "chevron-down"}
        size={16}
        color={expanded ? colors.primary : colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  archivedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: "rgba(107,114,128,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  archivedPillText: { ...typography.label, color: "#FFFFFF" },
  projectName: { ...typography.title, color: "#FFFFFF", marginBottom: spacing.sm },
  projectLocRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.md },
  projectLoc: { ...typography.caption, color: "rgba(255,255,255,0.6)" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...typography.captionMedium, color: "rgba(255,255,255,0.8)" },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: layout.gutter, marginTop: spacing.xl, marginBottom: spacing.xl },
  tabRow: { marginBottom: spacing.xl },
  tabRowContent: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: layout.gutter, gap: spacing.sm },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
  tabDropdown: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tabText: { ...typography.captionMedium },
  section: { paddingHorizontal: layout.gutter, marginBottom: layout.sectionGap },
  sectionTitle: { ...typography.label, textTransform: "uppercase", marginBottom: spacing.md },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  addBtnText: { ...typography.captionMedium },
  rowCard: { marginBottom: spacing.md },
  rowIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reportDateBadge: { borderRadius: radius.sm, padding: spacing.sm, minWidth: 44, alignItems: "center" },
  reportDateText: { ...typography.captionMedium, textAlign: "center" },
  reportMeta: { ...typography.caption, fontSize: 13, lineHeight: 18 },
  reportSub: { ...typography.caption, fontSize: 11, lineHeight: 14, marginTop: 3 },
  reportMetaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  reportMetaChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  reportExpanded: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  reportDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  reportDetailLabel: { ...typography.label, fontSize: 11, marginBottom: 2 },
  reportDetailText: { ...typography.caption, fontSize: 13, lineHeight: 19 },
  reportAiBox: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: 2 },
  reportInput: { ...typography.body, fontSize: 14, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: radius.sm - 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  taskTitle: { ...typography.body, fontSize: 14 },
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs, flexWrap: "wrap" },
  taskPriorityDot: { width: 6, height: 6, borderRadius: 3 },
  taskMetaText: { ...typography.captionMedium, fontSize: 11 },
  taskMetaSep: { fontSize: 12 },
  taskExpanded: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  taskDetailRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  taskDetailText: { ...typography.caption, fontSize: 13, lineHeight: 19, flex: 1 },
  taskChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  taskChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  taskChipText: { ...typography.label, fontSize: 11 },
  detailDivider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
});

const schedSt = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventTypeBar: {
    width: 3,
    alignSelf: "stretch",
    flexShrink: 0,
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
    <Card
      onPress={onPress}
      elevated={false}
      style={[styles.rowCard, { flexDirection: "row", alignItems: "center", gap: spacing.md }]}
    >
      <View style={[styles.reportDateBadge, { backgroundColor: `${colors.primary}15` }]}>
        <Feather name="alert-circle" size={16} color={colors.primary} />
        <Text style={[styles.reportDateText, { color: colors.primary }]}>{rfi.rfiNumber}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={2}>
          {rfi.subject}
        </Text>
        <View style={{ marginTop: spacing.xs }}>
          <Badge label={conf.label} status={rfi.status === "resolved" ? "success" : rfi.status === "closed" ? "neutral" : rfi.status === "in_review" ? "warning" : "critical"} />
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Card>
  );
}

function ReportsTabSection({
  projectId,
  projectName,
  reports,
  onReportAdded,
  isOwnerOrForeman,
}: {
  projectId: number;
  projectName: string | null;
  reports: any[];
  onReportAdded: () => void;
  isOwnerOrForeman: boolean;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("");
  const [crewCount, setCrewCount] = useState("1");
  const [issues, setIssues] = useState("");
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
    setWeather("");
    setCrewCount("1");
    setIssues("");
    setExpanded(false);
    setSubmitted(false);
  }

  async function handleSubmit() {
    if (!notes.trim()) {
      Alert.alert("Empty note", "Please record or type your work summary first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    createReport.mutate(
      {
        projectId,
        data: {
          reportDate: today,
          workPerformed: notes,
          notes: notes || undefined,
          weather: weather || undefined,
          issues: issues || undefined,
          crewCount: parseInt(crewCount, 10) || 1,
        },
      },
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>Daily Reports</Text>
        <Pressable
          onPress={() => {
            setExpanded((v) => !v);
            setSubmitted(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.addBtn, { backgroundColor: expanded ? `${colors.primary}18` : colors.muted, borderColor: expanded ? colors.primary : colors.border }]}
        >
          <Feather name={expanded ? "x" : "plus"} size={13} color={expanded ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.addBtnText, { color: expanded ? colors.primary : colors.mutedForeground }]}>
            {expanded ? "Cancel" : "Log Note"}
          </Text>
        </Pressable>
      </View>

      {/* Inline log panel */}
      {expanded && (
        <Card style={{ borderColor: colors.primary, marginBottom: spacing.lg }}>
          {/* Timestamp label */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
            <Feather name="clock" size={13} color={colors.mutedForeground} />
            <Text style={[typography.captionMedium, { color: colors.mutedForeground }]}>
              {nowLabel}
            </Text>
          </View>

          {/* Weather + Crew Count */}
          <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{ flex: 2 }}>
              <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>
                Weather Impact
              </Text>
              <TextInput
                style={[styles.reportInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                value={weather}
                onChangeText={setWeather}
                placeholder="Sunny, light rain..."
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground }]}>
                Crew Count
              </Text>
              <TextInput
                style={[styles.reportInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                value={crewCount}
                onChangeText={setCrewCount}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>

          {/* Mic + label row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              Work Summary
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Feather name="mic" size={12} color={colors.mutedForeground} />
              <Text style={[typography.caption, { fontSize: 11, color: colors.mutedForeground }]}>
                Use the global mic button below
              </Text>
            </View>
          </View>

          {/* Notes textarea */}
          <TextInput
            style={[styles.reportInput, { minHeight: 90, textAlignVertical: "top", borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Speak or type what happened today…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={true}
          />

          {/* Issues / Delays */}
          <Text style={[styles.reportDetailLabel, { color: colors.mutedForeground, marginTop: spacing.md }]}>
            Issues / Delays (Optional)
          </Text>
          <TextInput
            style={[styles.reportInput, { minHeight: 60, textAlignVertical: "top", borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
            value={issues}
            onChangeText={setIssues}
            placeholder="Anything blocking progress?"
            placeholderTextColor={colors.mutedForeground}
            multiline
          />

          {/* Submit / success */}
          {submitted ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: `${colors.success}1F`, borderRadius: radius.md, padding: spacing.md }}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={[typography.captionMedium, { color: colors.success }]}>Report saved!</Text>
            </View>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <Button label="Save Report" onPress={handleSubmit} loading={createReport.isPending} fullWidth />
            </View>
          )}
        </Card>
      )}

      {/* Existing reports list */}
      {reports.length === 0 && !expanded ? (
        <EmptyState icon="file-text" title="No reports yet" subtitle="Tap Log Note above to add your first daily report." />
      ) : (
        [...reports]
          .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime())
          .map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              projectId={projectId}
              isOwnerOrForeman={isOwnerOrForeman}
              onPhotoDeleted={() => {
                qc.invalidateQueries({ queryKey: getListDailyReportsQueryKey(projectId) });
                onReportAdded();
              }}
            />
          ))
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
  const [openCategory, setOpenCategory] = useState<CategoryKey | null>(null);
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
    Communications: "viewProjectCommunications",
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

  const visibleMainTabs = MAIN_TABS.filter((tab) => visibleTabs.includes(tab));
  const visibleCategories = TAB_CATEGORIES.map((cat) => ({
    ...cat,
    tabs: cat.tabs.filter((tab) => visibleTabs.includes(tab)),
  })).filter((cat) => cat.tabs.length > 0);
  const openCategoryData = visibleCategories.find((cat) => cat.key === openCategory) ?? null;

  const { data: project, isLoading, refetch: refetchProject, dataUpdatedAt: projectUpdatedAt } = useGetProject(projectId);
  const { data: summary, refetch: refetchSummary, dataUpdatedAt: summaryUpdatedAt } = useGetProjectSummary(projectId);
  const { data: reports, refetch: refetchReports, dataUpdatedAt: reportsUpdatedAt } = useListDailyReports(projectId);
  const { data: tasks, refetch: refetchTasks, dataUpdatedAt: tasksUpdatedAt } = useListTasks(projectId);
  const { data: rfis, refetch: refetchRfis, dataUpdatedAt: rfisUpdatedAt } = useListRFIs(
    projectId,
    rfiStatusFilter !== "all" ? { status: rfiStatusFilter as "open" | "in_review" | "answered" | "closed" } : undefined,
    { query: { enabled: perms.viewRFIs } as any },
  );
  const { data: changeOrders } = useListChangeOrders(
    isOwnerOrForeman ? { projectId } : undefined,
    { query: { enabled: isOwnerOrForeman } as any },
  );
  const { data: safetySubmissions, refetch: refetchSafety, dataUpdatedAt: safetyUpdatedAt } = useListFormSubmissions(
    { projectId },
    { query: { enabled: perms.viewSafetyTab } as any },
  );
  const { data: psiChecklists, refetch: refetchPsi, dataUpdatedAt: psiUpdatedAt } = useQuery<PsiListRow[]>({
    queryKey: ["psi-checklists", projectId],
    queryFn: () => customFetch(`/api/psi?projectId=${projectId}`),
    enabled: perms.viewSafetyTab,
  });

  const qc = useQueryClient();
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);
  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        refetchProject();
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setShowOptionsSheet(false);
      },
      onError: () => Alert.alert("Failed to update project"),
    },
  });
  const deleteProject = useDeleteProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setShowOptionsSheet(false);
        router.back();
      },
      onError: () => Alert.alert("Failed to delete project"),
    },
  });

  function handleArchiveToggle() {
    if (!project) return;
    const archiving = !(project as any).archivedAt;
    updateProject.mutate({ projectId, data: { archived: archiving } });
  }

  function handleDeleteProject() {
    if (!project) return;
    setShowOptionsSheet(false);
    Alert.alert(
      "Delete Project",
      `Permanently delete "${project.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteProject.mutate({ projectId }) },
      ],
    );
  }

  const [showTaskSheet, setShowTaskSheet] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        refetchTasks();
        setShowTaskSheet(false);
      },
      onError: () => Alert.alert("Failed to create task"),
      onSettled: () => setCreatingTask(false),
    },
  });
  function handleCreateTask(values: TaskFormValues) {
    setCreatingTask(true);
    createTask.mutate({
      projectId: values.projectId,
      data: {
        title: values.title,
        description: values.description ?? undefined,
        assignedToUserId: values.assignedToUserId ?? undefined,
        priority: values.priority,
        dueDate: values.dueDate ?? undefined,
      },
    });
  }

  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const createSchedule = useCreateScheduleAssignment({
    mutation: {
      onSuccess: () => {
        refetchSchedule();
        setShowScheduleSheet(false);
      },
      onError: () => Alert.alert("Failed to assign worker"),
      onSettled: () => setCreatingSchedule(false),
    },
  });
  function handleCreateSchedule(values: ScheduleFormValues) {
    setCreatingSchedule(true);
    createSchedule.mutate({
      data: {
        projectId: values.projectId,
        userId: values.userId,
        startDate: values.startDate,
        endDate: values.endDate,
        notes: values.notes ?? undefined,
      },
    });
  }

  // Only refetch on focus if that query's data is older than 60s — respects
  // staleTime instead of firing all 7 endpoints every time the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      const isStale = (updatedAt: number) => !updatedAt || Date.now() - updatedAt > 60_000;
      if (isStale(projectUpdatedAt)) refetchProject();
      if (isStale(summaryUpdatedAt)) refetchSummary();
      if (isStale(reportsUpdatedAt)) refetchReports();
      if (isStale(tasksUpdatedAt)) refetchTasks();
      if (perms.viewRFIs && isStale(rfisUpdatedAt)) refetchRfis();
      if (perms.viewSafetyTab) {
        if (isStale(safetyUpdatedAt)) refetchSafety();
        if (isStale(psiUpdatedAt)) refetchPsi();
      }
    }, [
      projectUpdatedAt, summaryUpdatedAt, reportsUpdatedAt, tasksUpdatedAt, rfisUpdatedAt, safetyUpdatedAt, psiUpdatedAt,
      refetchProject, refetchSummary, refetchReports, refetchTasks, refetchRfis, refetchSafety, refetchPsi,
      perms.viewRFIs, perms.viewSafetyTab,
    ]),
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
  const refetchSchedule = useCallback(() => {
    setScheduleLoading(true);
    return Promise.all([
      customFetch(`/api/projects/${projectId}/schedule`).catch(() => []),
      customFetch(`/api/schedule/events?projectId=${projectId}`).catch(() => []),
    ]).then(([assignments, events]) => {
      const myUserId = me?.id;
      // Owners/foremen manage the whole project's roster; workers only see their own schedule.
      setScheduleAssignments(
        Array.isArray(assignments)
          ? (isOwnerOrForeman ? assignments : myUserId ? assignments.filter((a: any) => a.userId === myUserId) : [])
          : [],
      );
      setScheduleEvents(
        Array.isArray(events)
          ? (isOwnerOrForeman
              ? events
              : myUserId
              ? events.filter((ev: any) =>
                  Array.isArray(ev.assignees) &&
                  ev.assignees.some((a: any) => a.resourceType === "user" && a.resourceId === myUserId),
                )
              : [])
          : [],
      );
    }).finally(() => setScheduleLoading(false));
  }, [projectId, me?.id, isOwnerOrForeman]);

  useEffect(() => {
    if (activeTab !== "Schedules") return;
    refetchSchedule();
  }, [activeTab, refetchSchedule]);

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
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
    >
      {/* Project header */}
      <View style={[styles.headerBg, { backgroundColor: colors.sidebar, paddingTop: topInsets + spacing.lg }]}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          {isOwnerOrForeman && (
            <Pressable
              hitSlop={12}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowOptionsSheet(true);
              }}
            >
              <Feather name="more-vertical" size={20} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
        {!!(project as any)?.archivedAt && (
          <View style={styles.archivedPill}>
            <Feather name="archive" size={11} color="#FFFFFF" />
            <Text style={styles.archivedPillText}>Archived</Text>
          </View>
        )}
        <Text style={styles.projectName}>{project?.name ?? "Project"}</Text>
        {!!(project as any)?.location && (
          <View style={styles.projectLocRow}>
            <Feather name="map-pin" size={13} color="rgba(255,255,255,0.55)" />
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

      {/* Tabs — Main tabs stay flat; the rest group into dropdown-style
          category pills (opened via bottom sheet) so the bar wraps instead
          of ever needing horizontal scrolling. */}
      <View style={styles.tabRow}>
        <View style={styles.tabRowContent}>
          {visibleMainTabs.map(tab => {
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[styles.tab, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>{TAB_LABELS[tab] ?? tab}</Text>
              </Pressable>
            );
          })}
          {visibleCategories.map(cat => {
            const active = cat.tabs.includes(activeTab);
            return (
              <Pressable
                key={cat.key}
                style={[styles.tab, styles.tabDropdown, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => setOpenCategory(cat.key)}
              >
                <Text style={[styles.tabText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>{cat.label}</Text>
                <Feather name="chevron-down" size={12} color={active ? "#FFFFFF" : colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Overview tab */}
      {activeTab === "Overview" && (
        <View style={styles.section}>

          {/* Description */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Description</Text>
          <Text style={[typography.body, { color: project?.description ? colors.foreground : colors.mutedForeground, lineHeight: 22 }]}>
            {project?.description ?? "No description added yet."}
          </Text>

          <View style={{ height: spacing.xl }} />

          {/* Activity summary — StatTile rows, two per line */}
          {summary && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Activity</Text>
              {chunk(
                [
                  { label: "Reports", value: summary.reportCount ?? 0 },
                  { label: "Open RFIs", value: summary.openRFICount ?? 0 },
                  ...(perms.viewRFIs ? [{ label: "Closed RFIs", value: summary.closedRFICount ?? 0 }] : []),
                  ...(perms.viewFinancials ? [{ label: "Total Spent", value: formatCurrency(summary.totalSpent) }] : []),
                ],
                2,
              ).map((row, i) => (
                <View key={i} style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
                  {row.map((item) => (
                    <StatTile key={item.label} label={item.label} value={item.value} />
                  ))}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ))}
              <View style={{ height: spacing.sm }} />
            </>
          )}

          {/* Inspections quick link — inspections moved off the tab bar into
              the Capture flow + this per-project entry point */}
          {perms.viewInspectTab && (
            <>
              <Card padding="none">
                <View style={{ paddingHorizontal: spacing.lg }}>
                  <ListRow
                    icon="check-square"
                    title="Inspections"
                    subtitle="View or start an inspection for this project"
                    showChevron
                    onPress={() => safeNavigate(router, `/inspect?projectId=${project?.id}`, "project-detail:inspections")}
                  />
                </View>
              </Card>
              <View style={{ height: spacing.xl }} />
            </>
          )}

          {/* Project details */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Details</Text>
          <Card padding="none">
            <View style={{ paddingHorizontal: spacing.lg }}>
              <ListRow
                icon="tag"
                title="Status"
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[project?.status ?? "active"] }]} />
                    <Text style={[typography.captionMedium, { color: colors.foreground }]}>
                      {STATUS_LABELS[project?.status ?? "active"]}
                    </Text>
                  </View>
                }
              />
              <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
              <ListRow
                icon="calendar"
                title="Start Date"
                trailing={
                  <Text style={[typography.captionMedium, { color: project?.startDate ? colors.foreground : colors.mutedForeground }]}>
                    {project?.startDate ? new Date(project.startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}
                  </Text>
                }
              />
              <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
              <ListRow
                icon="calendar"
                title="End Date"
                trailing={
                  <Text style={[typography.captionMedium, { color: project?.endDate ? colors.foreground : colors.mutedForeground }]}>
                    {project?.endDate ? new Date(project.endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}
                  </Text>
                }
              />
              <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
              <ListRow
                icon="dollar-sign"
                title="Budget"
                trailing={
                  <Text style={[typography.captionMedium, { color: project?.budget != null ? colors.foreground : colors.mutedForeground }]}>
                    {project?.budget != null ? formatCurrency(project.budget) : "Not set"}
                  </Text>
                }
              />
            </View>
          </Card>

          {/* Change Orders — Owner/Foreman only */}
          {isOwnerOrForeman && (
            <>
              <View style={{ height: spacing.xl }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>
                  Change Orders
                </Text>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  {(changeOrders ?? []).length}
                </Text>
              </View>
              {(changeOrders ?? []).length === 0 ? (
                <EmptyState icon="file-text" title="No change orders" subtitle="Change orders for this project will show up here." />
              ) : (
                (changeOrders ?? []).map((co: any) => {
                  const tone = co.status === "approved" ? "approved" : co.status === "rejected" ? "void" : "pending";
                  const amount = co.amount != null
                    ? (typeof co.amount === "string" ? parseFloat(co.amount) : Number(co.amount))
                    : null;
                  return (
                    <Card
                      key={co.id}
                      elevated={false}
                      style={styles.rowCard}
                      onPress={() => safeNavigate(router, `/change-order/${co.id}`, "project-detail:change-order")}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                        <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}1A` }]}>
                          <Feather name="file-text" size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodyMedium, { color: colors.foreground }]} numberOfLines={1}>
                            {co.title}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
                            {amount != null && (
                              <Text style={[typography.captionMedium, { color: colors.foreground }]}>
                                ${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Text>
                            )}
                            <StatusPill tone={tone} size="sm" />
                          </View>
                          {co.createdAt && (
                            <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}>
                              {new Date(co.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                            </Text>
                          )}
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </View>
                    </Card>
                  );
                })
              )}
            </>
          )}
        </View>
      )}

      {/* Reports tab */}
      {activeTab === "Reports" && (
        <ReportsTabSection projectId={projectId} projectName={project?.name ?? null} reports={reports ?? []} onReportAdded={refetchReports} isOwnerOrForeman={isOwnerOrForeman} />
      )}

      {/* Tasks tab */}
      {activeTab === "Tasks" && (
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>Tasks</Text>
            {isOwnerOrForeman && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTaskSheet(true);
                }}
                style={[styles.addBtn, { borderColor: colors.primary }]}
              >
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Task</Text>
              </Pressable>
            )}
          </View>
          {(tasks ?? []).length === 0 ? (
            <EmptyState icon="check-square" title="No tasks yet" subtitle={isOwnerOrForeman ? "Tap Add Task to create the first one." : "Tasks assigned to this project will show up here."} />
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
              {/* Summary stat tiles */}
              <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl }}>
                <StatTile label="Workers Scheduled" value={scheduleAssignments.length} />
                <StatTile label="Events" value={scheduleEvents.length} />
              </View>

              {/* Workers Scheduled */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>Workers Scheduled</Text>
                {isOwnerOrForeman && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowScheduleSheet(true);
                    }}
                    style={[styles.addBtn, { borderColor: colors.primary }]}
                  >
                    <Feather name="plus" size={14} color={colors.primary} />
                    <Text style={[styles.addBtnText, { color: colors.primary }]}>Assign Worker</Text>
                  </Pressable>
                )}
              </View>
              {scheduleAssignments.length === 0 ? (
                <EmptyState icon="user-x" title="No workers assigned" subtitle="Workers assigned to this project will show up here." />
              ) : (
                scheduleAssignments.map((a: any) => {
                  const name = [a.userFirstName, a.userLastName].filter(Boolean).join(" ") || a.userEmail || "Unknown";
                  const start = new Date(a.startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                  const end = new Date(a.endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
                  const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <Card key={a.id} elevated={false} style={[styles.rowCard, { flexDirection: "row", alignItems: "center", gap: spacing.md }]}>
                      <View style={[schedSt.avatar, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[typography.bodyMedium, { color: colors.primary }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodyMedium, { color: colors.foreground }]}>{name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 }}>
                          <Feather name="calendar" size={11} color={colors.mutedForeground} />
                          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{start} – {end}</Text>
                        </View>
                        {!!a.notes && (
                          <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={2}>{a.notes}</Text>
                        )}
                      </View>
                      <Badge label={a.userRole ?? "worker"} />
                    </Card>
                  );
                })
              )}

              <View style={{ height: spacing.xl }} />

              {/* Events */}
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Events</Text>
              {scheduleEvents.length === 0 ? (
                <EmptyState icon="calendar" title="No events scheduled" subtitle="Events scheduled for this project will show up here." />
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
                    <Card key={ev.id} elevated={false} padding="none" style={[styles.rowCard, { flexDirection: "row", overflow: "hidden" }]}>
                      <View style={[schedSt.eventTypeBar, { backgroundColor: evColor }]} />
                      <View style={{ flex: 1, padding: spacing.md }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
                          <Text style={[typography.bodyMedium, { color: colors.foreground, flex: 1, marginRight: spacing.sm }]} numberOfLines={2}>{ev.title}</Text>
                          <Badge label={evLabel} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 2 }}>
                          <Feather name="clock" size={11} color={colors.mutedForeground} />
                          <Text style={[typography.caption, { color: colors.mutedForeground }]}>{dateRange}</Text>
                        </View>
                        {!!ev.location && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                            <Text style={[typography.caption, { color: colors.mutedForeground }]}>{ev.location}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs }}>
                          <View style={[schedSt.statusDot, { backgroundColor: evStatusColor }]} />
                          <Text style={[typography.caption, { color: evStatusColor, textTransform: "capitalize" }]}>{(ev.status ?? "scheduled").replace("_", " ")}</Text>
                        </View>
                      </View>
                    </Card>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(["all", "open", "in_review", "answered", "closed"] as const).map((s) => {
                const label =
                  s === "all" ? "All" :
                  s === "open" ? "Open" :
                  s === "in_review" ? "In Review" :
                  s === "answered" ? "Answered" : "Closed";
                return (
                  <Chip key={s} label={label} selected={rfiStatusFilter === s} onPress={() => setRfiStatusFilter(s)} />
                );
              })}
            </View>
          </ScrollView>
          {(rfis ?? []).length === 0 ? (
            <EmptyState
              icon="alert-circle"
              title={
                rfiStatusFilter !== "all"
                  ? `No ${rfiStatusFilter === "open" ? "open" : rfiStatusFilter === "in_review" ? "in-review" : rfiStatusFilter === "answered" ? "answered" : "closed"} RFIs`
                  : "No RFIs for this project"
              }
            />
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

      {/* Project Communications tab (synced email threads) */}
      {activeTab === "Communications" && (
        <CommunicationsTab projectId={projectId} />
      )}

      {/* Safety & Compliance tab */}
      {activeTab === "Safety" && (
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginBottom: 0 }]}>
              Pre-Inspection Checklists
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/(home)/psi-checklist", params: { projectId: String(projectId) } })}
              style={[styles.addBtn, { borderColor: colors.primary }]}
            >
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>New</Text>
            </Pressable>
          </View>
          {(psiChecklists ?? []).length === 0 ? (
            <View style={{ marginBottom: spacing.xl }}>
              <EmptyState icon="clipboard" title="No pre-inspection checklists" subtitle="Checklists for this project will show up here." />
            </View>
          ) : (
            <View style={{ marginBottom: spacing.xl }}>
              {(psiChecklists ?? []).map((row) => {
                const isDraft = row.psi.status === "draft";
                const statusColor = isDraft ? colors.mutedForeground : colors.success;
                return (
                  <Card
                    key={row.psi.id}
                    onPress={() =>
                      router.push({
                        pathname: isDraft ? "/(tabs)/(home)/psi-checklist" : "/(tabs)/(home)/psi-detail",
                        params: { id: String(row.psi.id) },
                      })
                    }
                    elevated={false}
                    style={[styles.rowCard, { flexDirection: "row", alignItems: "center", gap: spacing.md }]}
                  >
                    <View style={[styles.reportDateBadge, { backgroundColor: `${statusColor}15` }]}>
                      <Feather name="clipboard" size={16} color={statusColor} />
                      <Text style={[styles.reportDateText, { color: statusColor, fontSize: 10 }]}>
                        {isDraft ? "DFT" : "SUB"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reportMeta, { color: colors.foreground }]} numberOfLines={1}>
                        {row.psi.tradeDescription || "Pre-Inspection Checklist"}
                      </Text>
                      <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>{row.psi.date}</Text>
                      <Text style={[styles.reportSub, { color: colors.mutedForeground }]}>
                        {row.signatureCount} signature{row.signatureCount === 1 ? "" : "s"} · {row.approvalCount} approval{row.approvalCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Safety & Compliance
          </Text>
          {(safetySubmissions ?? []).length === 0 ? (
            <EmptyState icon="shield" title="No safety submissions" subtitle="Safety submissions for this project will show up here." />
          ) : (
            (safetySubmissions ?? []).map((s: any) => (
              <SafetySubmissionRow key={s.id} submission={s} colors={colors} />
            ))
          )}
        </View>
      )}

    </ScrollView>

      <TaskFormSheet
        visible={showTaskSheet}
        onClose={() => setShowTaskSheet(false)}
        onSubmit={handleCreateTask}
        submitting={creatingTask}
        projectId={projectId}
        projectName={project?.name}
      />

      <ScheduleFormSheet
        visible={showScheduleSheet}
        onClose={() => setShowScheduleSheet(false)}
        onSubmit={handleCreateSchedule}
        submitting={creatingSchedule}
        projectId={projectId}
        projectName={project?.name}
      />

      <BottomSheet
        visible={openCategoryData !== null}
        onClose={() => setOpenCategory(null)}
        title={openCategoryData?.label}
        scrollable={false}
      >
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
          {openCategoryData?.tabs.map(tab => (
            <ListRow
              key={tab}
              title={TAB_LABELS[tab] ?? tab}
              onPress={() => { setActiveTab(tab); setOpenCategory(null); }}
              trailing={activeTab === tab ? <Feather name="check" size={18} color={colors.primary} /> : undefined}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showOptionsSheet}
        onClose={() => setShowOptionsSheet(false)}
        title="Project Options"
        scrollable={false}
      >
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
          <ListRow
            icon={(project as any)?.archivedAt ? "rotate-ccw" : "archive"}
            iconColor={(project as any)?.archivedAt ? "#22C55E" : "#F59E0B"}
            title={(project as any)?.archivedAt ? "Restore Project" : "Archive Project"}
            subtitle={(project as any)?.archivedAt ? "Move this project back to your active list" : "Hide this project from the default list"}
            onPress={handleArchiveToggle}
          />
          <ListRow
            icon="trash-2"
            iconColor={colors.destructive}
            title="Delete Project"
            subtitle="Permanently remove this project and its data"
            onPress={handleDeleteProject}
          />
        </View>
      </BottomSheet>
    </>
  );
}
