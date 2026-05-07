import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListProjects } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  useOfflineQueue,
  type QueuedReport,
  type SyncedReport,
} from "@/context/OfflineQueueContext";
import { useMediaQueue, type QueuedMedia } from "@/context/MediaQueueContext";
import { useNoteQueue, type QueuedNote } from "@/context/NoteQueueContext";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {action}
    </View>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  const colors = useColors();
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={22} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

function StatusPill({ status, retries }: { status: string; retries?: number }) {
  const isFailed = status === "failed";
  return (
    <View style={[styles.statusPill, { backgroundColor: isFailed ? "#FEF2F2" : "#FFFBEB" }]}>
      <Text style={[styles.statusPillText, { color: isFailed ? "#DC2626" : "#D97706" }]}>
        {isFailed ? `Failed${retries ? ` · ${retries} tries` : ""}` : "Pending"}
      </Text>
    </View>
  );
}

function CardActions({
  onRetry,
  onDiscard,
}: {
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.cardActions}>
      <TouchableOpacity
        style={[styles.cardBtn, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
        onPress={onRetry}
        activeOpacity={0.75}
      >
        <Feather name="refresh-cw" size={13} color={colors.primary} />
        <Text style={[styles.cardBtnText, { color: colors.primary }]}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.cardBtn, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}
        onPress={onDiscard}
        activeOpacity={0.75}
      >
        <Feather name="trash-2" size={13} color="#DC2626" />
        <Text style={[styles.cardBtnText, { color: "#DC2626" }]}>Discard</Text>
      </TouchableOpacity>
    </View>
  );
}

function ReportCard({
  item,
  projectName,
  onRetry,
  onDiscard,
}: {
  item: QueuedReport;
  projectName: string;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const colors = useColors();
  const isFailed = item.status === "failed";
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isFailed ? "#FECACA" : colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.statusDot, { backgroundColor: isFailed ? "#EF4444" : "#F59E0B" }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardProject, { color: colors.foreground }]} numberOfLines={1}>{projectName}</Text>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {formatDate(item.reportData.reportDate)} · saved {timeAgo(item.createdAt)}
          </Text>
        </View>
        <StatusPill status={item.status} retries={item.retries} />
      </View>
      <Text style={[styles.cardNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
        {item.reportData.workPerformed}
      </Text>
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaItem}>
          <Feather name="users" size={12} color={colors.mutedForeground} />
          <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>{item.reportData.crewCount} crew</Text>
        </View>
        {item.photos.length > 0 && (
          <View style={styles.cardMetaItem}>
            <Feather name="image" size={12} color={colors.mutedForeground} />
            <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
              {item.photos.length} photo{item.photos.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </View>
      {isFailed && onRetry && onDiscard && (
        <CardActions onRetry={onRetry} onDiscard={onDiscard} />
      )}
    </View>
  );
}

function SyncedCard({ item, projectName }: { item: SyncedReport; projectName: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.statusDot, { backgroundColor: "#22C55E" }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardProject, { color: colors.foreground }]} numberOfLines={1}>{projectName}</Text>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {formatDate(item.reportData.reportDate)} · synced {timeAgo(item.syncedAt)}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: "#DCFCE7" }]}>
          <Text style={[styles.statusPillText, { color: "#16A34A" }]}>Synced</Text>
        </View>
      </View>
      <Text style={[styles.cardNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
        {item.reportData.workPerformed}
      </Text>
    </View>
  );
}

function MediaCard({
  item,
  onRetry,
  onDiscard,
}: {
  item: QueuedMedia;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const colors = useColors();
  const isFailed = item.status === "failed";
  const icon = item.type === "photo" ? "image" : "file";
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isFailed ? "#FECACA" : colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.statusDot, { backgroundColor: isFailed ? "#EF4444" : "#F59E0B" }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardProject, { color: colors.foreground }]} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {item.fileName} · saved {timeAgo(item.createdAt)}
          </Text>
        </View>
        <StatusPill status={item.status} retries={item.retries} />
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaItem}>
          <Feather name={icon as any} size={12} color={colors.mutedForeground} />
          <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
            {item.type === "photo" ? "Photo" : "Document"}
          </Text>
        </View>
        <View style={styles.cardMetaItem}>
          <Feather name="hard-drive" size={12} color={colors.mutedForeground} />
          <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
            {(item.fileSize / 1024).toFixed(0)} KB stored locally
          </Text>
        </View>
      </View>
      {isFailed && onRetry && onDiscard && (
        <CardActions onRetry={onRetry} onDiscard={onDiscard} />
      )}
    </View>
  );
}

function NoteCard({
  item,
  onRetry,
  onDiscard,
}: {
  item: QueuedNote;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const colors = useColors();
  const isFailed = item.status === "failed";
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isFailed ? "#FECACA" : colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.statusDot, { backgroundColor: isFailed ? "#EF4444" : "#F59E0B" }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardProject, { color: colors.foreground }]} numberOfLines={1}>
            {item.projectName}
          </Text>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            Note · saved {timeAgo(item.createdAt)}
          </Text>
        </View>
        <StatusPill status={item.status} retries={item.retries} />
      </View>
      <Text style={[styles.cardNotes, { color: colors.mutedForeground }]} numberOfLines={3}>
        {item.content}
      </Text>
      {isFailed && onRetry && onDiscard && (
        <CardActions onRetry={onRetry} onDiscard={onDiscard} />
      )}
    </View>
  );
}

export default function SyncQueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    isOnline,
    isSyncing: reportsSyncing,
    pendingCount: reportPending,
    failedCount: reportFailed,
    queue,
    syncedHistory,
    lastSyncedAt,
    syncQueue: syncReports,
    retryFailed: retryReports,
    clearFailed: clearReportsFailed,
    clearHistory,
  } = useOfflineQueue();

  const {
    isSyncing: mediaSyncing,
    pendingCount: mediaPending,
    failedCount: mediaFailed,
    queue: mediaQueue,
    syncQueue: syncMedia,
    retryFailed: retryMedia,
    clearFailed: clearMediaFailed,
  } = useMediaQueue();

  const {
    isSyncing: notesSyncing,
    pendingCount: notesPending,
    failedCount: notesFailed,
    queue: noteQueue,
    syncQueue: syncNotes,
    retryFailed: retryNotes,
    clearFailed: clearNotesFailed,
  } = useNoteQueue();

  const { data: projects } = useListProjects();

  const topInsets = Platform.OS === "web" ? 20 : insets.top;
  const totalPending = reportPending + mediaPending + notesPending;
  const totalFailed = reportFailed + mediaFailed + notesFailed;
  const isSyncing = reportsSyncing || mediaSyncing || notesSyncing;

  function getProjectName(projectId: number): string {
    return (projects ?? []).find((p) => p.id === projectId)?.name ?? `Project #${projectId}`;
  }

  function syncAll() {
    syncReports();
    syncMedia();
    syncNotes();
  }

  const pendingReports = queue.filter((r) => r.status === "pending");
  const failedReports = queue.filter((r) => r.status === "failed");
  const pendingMedia = mediaQueue.filter((m) => m.status === "pending");
  const failedMedia = mediaQueue.filter((m) => m.status === "failed");
  const pendingNotes = noteQueue.filter((n) => n.status === "pending");
  const failedNotes = noteQueue.filter((n) => n.status === "failed");

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: colors.muted }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sync Queue</Text>
      </View>

      {/* Connection status bar */}
      <View
        style={[
          styles.statusBar,
          {
            backgroundColor: isOnline ? `${colors.primary}10` : "#1C1407",
            borderColor: isOnline ? `${colors.primary}30` : "#92400E44",
          },
        ]}
      >
        <Feather name={isOnline ? "wifi" : "wifi-off"} size={15} color={isOnline ? colors.primary : "#D97706"} />
        <Text style={[styles.statusText, { color: isOnline ? colors.primary : "#D97706" }]}>
          {isOnline
            ? isSyncing
              ? `Syncing ${totalPending} item${totalPending !== 1 ? "s" : ""}…`
              : lastSyncedAt
              ? `Online · last synced ${timeAgo(lastSyncedAt)}`
              : "Online"
            : "Offline — data saved locally"}
        </Text>
        {isOnline && !isSyncing && totalPending > 0 && (
          <TouchableOpacity
            style={[styles.syncBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}15` }]}
            onPress={syncAll}
            activeOpacity={0.75}
          >
            <Text style={[styles.syncBtnText, { color: colors.primary }]}>Sync now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        {[
          { label: "Reports", pending: reportPending, failed: reportFailed, icon: "file-text" },
          { label: "Media", pending: mediaPending, failed: mediaFailed, icon: "image" },
          { label: "Notes", pending: notesPending, failed: notesFailed, icon: "edit-3" },
        ].map((s) => (
          <View key={s.label} style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon as any} size={14} color={colors.primary} />
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>
              {s.pending > 0 ? `${s.pending} pending` : s.failed > 0 ? `${s.failed} failed` : "All synced"}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Pending ── */}
      {(pendingReports.length > 0 || pendingMedia.length > 0 || pendingNotes.length > 0) && (
        <View style={styles.section}>
          <SectionHeader title={`Pending · ${totalPending}`} />
          <View style={styles.cardList}>
            {pendingReports.map((item) => (
              <ReportCard key={item.id} item={item} projectName={getProjectName(item.projectId)} />
            ))}
            {pendingMedia.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
            {pendingNotes.map((item) => (
              <NoteCard key={item.id} item={item} />
            ))}
          </View>
        </View>
      )}

      {/* ── Failed ── */}
      {totalFailed > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title={`Failed · ${totalFailed}`}
            action={
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Clear All Failed", "Permanently discard all failed items?", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Discard All",
                      style: "destructive",
                      onPress: () => {
                        clearReportsFailed();
                        clearMediaFailed();
                        clearNotesFailed();
                      },
                    },
                  ])
                }
              >
                <Text style={[styles.sectionAction, { color: "#DC2626" }]}>Clear all</Text>
              </TouchableOpacity>
            }
          />
          <View style={styles.cardList}>
            {failedReports.map((item) => (
              <ReportCard
                key={item.id}
                item={item}
                projectName={getProjectName(item.projectId)}
                onRetry={() => retryReports()}
                onDiscard={() =>
                  Alert.alert("Discard Report", "This report will be permanently deleted.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Discard", style: "destructive", onPress: clearReportsFailed },
                  ])
                }
              />
            ))}
            {failedMedia.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onRetry={() => retryMedia()}
                onDiscard={() =>
                  Alert.alert("Discard File", "The locally saved file will be permanently deleted.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Discard", style: "destructive", onPress: clearMediaFailed },
                  ])
                }
              />
            ))}
            {failedNotes.map((item) => (
              <NoteCard
                key={item.id}
                item={item}
                onRetry={() => retryNotes()}
                onDiscard={() =>
                  Alert.alert("Discard Note", "This note will be permanently deleted.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Discard", style: "destructive", onPress: clearNotesFailed },
                  ])
                }
              />
            ))}
          </View>
        </View>
      )}

      {/* ── All clear ── */}
      {totalPending === 0 && totalFailed === 0 && (
        <EmptyState icon="check-circle" message="Everything is synced — nothing waiting." />
      )}

      {/* ── Synced history (reports only) ── */}
      <View style={styles.section}>
        <SectionHeader
          title={`Synced Reports · ${syncedHistory.length}`}
          action={
            syncedHistory.length > 0 ? (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Clear History", "Remove all synced records from this list?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", onPress: clearHistory },
                  ])
                }
              >
                <Text style={[styles.sectionAction, { color: colors.mutedForeground }]}>Clear</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        {syncedHistory.length === 0 ? (
          <EmptyState icon="clock" message="Reports synced from offline mode will appear here." />
        ) : (
          <View style={styles.cardList}>
            {syncedHistory.map((item) => (
              <SyncedCard key={item.id} item={item} projectName={getProjectName(item.projectId)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  syncBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  syncBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
    alignItems: "center",
  },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  summaryVal: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionAction: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { marginBottom: 28 },
  cardList: { paddingHorizontal: 20, gap: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  cardProject: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardNotes: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  cardMeta: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  cardMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  cardBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyCard: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
});
