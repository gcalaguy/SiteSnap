import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useListUncategorizedEmails,
  getListUncategorizedEmailsQueryKey,
  useAssignEmailThreadToProject,
  useArchiveUncategorizedEmail,
  useIgnoreUncategorizedEmail,
  useBulkAssignUncategorizedEmails,
  useMergeUncategorizedEmailThreads,
  useCreateProjectAndAssignUncategorizedEmail,
  useListProjects,
  type EmailThread,
  type Project,
} from "@workspace/api-client-react";

type StatusFilter = "all" | "unassigned" | "suggested";

function relativeDateLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function ProjectPickerSheet({
  visible,
  projects,
  onClose,
  onSelect,
}: {
  visible: boolean;
  projects: Project[];
  onClose: () => void;
  onSelect: (projectId: number) => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[s.sheetTitle, { color: colors.foreground }]}>Select Project</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {projects.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No projects available</Text>
            </View>
          ) : (
            projects.map((p) => (
              <Pressable
                key={p.id}
                style={[s.sheetRow, { borderBottomColor: colors.border }]}
                onPress={() => onSelect(p.id)}
              >
                <Text style={[s.sheetRowText, { color: colors.foreground }]}>{p.name}</Text>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CreateProjectSheet({
  visible,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; address: string; city: string; province: string }) => void;
  submitting: boolean;
}) {
  const colors = useColors();
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [province, setProvince] = React.useState("");

  const isValid = name.trim() && address.trim() && city.trim() && province.trim();

  function handleSubmit() {
    if (!isValid) return;
    onSubmit({ name: name.trim(), address: address.trim(), city: city.trim(), province: province.trim() });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[s.sheetTitle, { color: colors.foreground }]}>New Project</Text>
        <View style={{ gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Project name"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Address"
            placeholderTextColor={colors.mutedForeground}
            value={address}
            onChangeText={setAddress}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[s.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="City"
              placeholderTextColor={colors.mutedForeground}
              value={city}
              onChangeText={setCity}
            />
            <TextInput
              style={[s.input, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Province"
              placeholderTextColor={colors.mutedForeground}
              value={province}
              onChangeText={setProvince}
            />
          </View>
          <Pressable
            onPress={handleSubmit}
            disabled={!isValid || submitting}
            style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: !isValid || submitting ? 0.6 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>Create & Assign</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ThreadRow({
  thread,
  projects,
  selectMode,
  selected,
  onToggleSelect,
  onRefetch,
}: {
  thread: EmailThread;
  projects: Project[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRefetch: () => void;
}) {
  const colors = useColors();
  const [showAssign, setShowAssign] = React.useState(false);
  const [showCreateProject, setShowCreateProject] = React.useState(false);

  const { mutateAsync: assignThread, isPending: assigning } = useAssignEmailThreadToProject();
  const { mutateAsync: archiveThread, isPending: archiving } = useArchiveUncategorizedEmail();
  const { mutateAsync: ignoreThread, isPending: ignoring } = useIgnoreUncategorizedEmail();
  const { mutateAsync: createProjectAndAssign, isPending: creatingProject } =
    useCreateProjectAndAssignUncategorizedEmail();

  const suggestedProject = projects.find((p) => p.id === thread.suggestedProjectId);

  async function handleAssign(projectId: number) {
    setShowAssign(false);
    try {
      await assignThread({ threadId: thread.id, data: { projectId } });
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not assign this thread. Please try again.");
    }
  }

  async function handleArchive() {
    try {
      await archiveThread({ threadId: thread.id });
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not archive this thread. Please try again.");
    }
  }

  async function handleIgnore() {
    try {
      await ignoreThread({ threadId: thread.id });
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not ignore this thread. Please try again.");
    }
  }

  async function handleCreateProject(data: { name: string; address: string; city: string; province: string }) {
    try {
      await createProjectAndAssign({ threadId: thread.id, data });
      setShowCreateProject(false);
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not create the project. Please try again.");
    }
  }

  const busy = assigning || archiving || ignoring || creatingProject;

  return (
    <>
      <Pressable
        onPress={selectMode ? onToggleSelect : undefined}
        style={[s.threadCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={s.threadTopRow}>
          {selectMode && (
            <Feather
              name={selected ? "check-square" : "square"}
              size={18}
              color={selected ? colors.primary : colors.mutedForeground}
              style={{ marginRight: 4 }}
            />
          )}
          <View style={[s.threadIcon, { backgroundColor: colors.muted }]}>
            <Feather name="mail" size={14} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.threadSubject, { color: colors.foreground }]} numberOfLines={1}>
              {thread.subject || "(no subject)"}
            </Text>
            <Text style={[s.threadMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {(thread.participantEmails ?? []).slice(0, 2).join(", ") || "Unknown participants"}
            </Text>
          </View>
          <Text style={[s.threadDate, { color: colors.mutedForeground }]}>
            {relativeDateLabel(thread.lastMessageAt)}
          </Text>
        </View>

        {thread.triageStatus === "suggested" && suggestedProject && (
          <View style={[s.suggestionBox, { backgroundColor: `${colors.primary}12`, borderColor: colors.primary }]}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={[s.suggestionText, { color: colors.primary }]} numberOfLines={3}>
              {thread.matchConfidence}% match — likely{" "}
              <Text style={{ fontFamily: "NunitoSans_700Bold" }}>{suggestedProject.name}</Text>
              {(thread.matchReasons ?? []).length > 0 && (
                <Text>
                  {" "}
                  (
                  {thread
                    .matchReasons!.map((r) => `${r.signal.replace(/_/g, " ")}: ${r.value}`)
                    .join(", ")}
                  )
                </Text>
              )}
            </Text>
          </View>
        )}

        {!selectMode && (
          <View style={s.actionsRow}>
            {thread.triageStatus === "suggested" && suggestedProject && (
              <Pressable
                onPress={() => handleAssign(suggestedProject.id)}
                disabled={busy}
                style={[s.actionBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="check" size={13} color="#FFFFFF" />
                <Text style={s.actionBtnPrimaryText}>Confirm</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setShowAssign(true)}
              disabled={busy}
              style={[s.actionBtn, { borderWidth: 1, borderColor: colors.border }]}
            >
              <Feather name="folder" size={13} color={colors.foreground} />
              <Text style={[s.actionBtnText, { color: colors.foreground }]}>Assign</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowCreateProject(true)}
              disabled={busy}
              style={[s.actionBtn, { borderWidth: 1, borderColor: colors.border }]}
            >
              <Feather name="plus" size={13} color={colors.foreground} />
              <Text style={[s.actionBtnText, { color: colors.foreground }]}>New Project</Text>
            </Pressable>
            <Pressable onPress={handleArchive} disabled={busy} style={[s.iconBtn, { borderColor: colors.border }]}>
              <Feather name="archive" size={14} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={handleIgnore} disabled={busy} style={[s.iconBtn, { borderColor: colors.border }]}>
              <Feather name="eye-off" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>
        )}
      </Pressable>

      <ProjectPickerSheet
        visible={showAssign}
        projects={projects}
        onClose={() => setShowAssign(false)}
        onSelect={handleAssign}
      />
      <CreateProjectSheet
        visible={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onSubmit={handleCreateProject}
        submitting={creatingProject}
      />
    </>
  );
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "suggested", label: "Suggested" },
  { value: "unassigned", label: "Unassigned" },
];

export default function UncategorizedEmailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showBulkAssign, setShowBulkAssign] = React.useState(false);

  const canView = permissions.viewProjectCommunications;

  const { data, isLoading, isError, refetch } = useListUncategorizedEmails(
    filter === "all" ? undefined : { status: filter },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: canView } } as any,
  );
  const projectsData = useListProjects();
  const projects = Array.isArray(projectsData.data) ? projectsData.data : [];

  const { mutateAsync: bulkAssign, isPending: bulkAssigning } = useBulkAssignUncategorizedEmails();
  const { mutateAsync: mergeThreads } = useMergeUncategorizedEmailThreads();

  function refetchInbox() {
    queryClient.invalidateQueries({ queryKey: getListUncategorizedEmailsQueryKey(filter === "all" ? undefined : { status: filter }) });
  }

  useFocusEffect(
    React.useCallback(() => {
      refetchInbox();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleBulkAssign(projectId: number) {
    setShowBulkAssign(false);
    try {
      await bulkAssign({ data: { threadIds: selectedIds, projectId } });
      setSelectedIds([]);
      setSelectMode(false);
      refetchInbox();
    } catch {
      Alert.alert("Failed", "Could not assign the selected threads. Please try again.");
    }
  }

  const threads = data?.data ?? [];
  void mergeThreads; // merge flow exposed via thread detail in a future iteration

  if (!canView) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[s.restrictedText, { color: colors.mutedForeground }]}>
          You don't have access to Project Communications.
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[s.header, { paddingTop: topInsets + 16, backgroundColor: colors.sidebar, borderBottomColor: colors.border }]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={s.headerTitle}>Uncategorized Emails</Text>
        <Pressable
          onPress={() => {
            setSelectMode((v) => !v);
            setSelectedIds([]);
          }}
          hitSlop={12}
          style={s.backBtn}
        >
          <Text style={s.headerAction}>{selectMode ? "Cancel" : "Select"}</Text>
        </Pressable>
      </View>

      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[
              s.filterChip,
              { backgroundColor: filter === f.value ? colors.primary : colors.muted, borderColor: colors.border },
            ]}
          >
            <Text style={[s.filterChipText, { color: filter === f.value ? "#FFFFFF" : colors.foreground }]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + (selectMode ? 90 : 24), gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : isError ? (
          <View style={[s.emptyBox, { borderColor: colors.border }]}>
            <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>Failed to load inbox</Text>
            <Pressable style={[s.retryBtn, { borderColor: colors.border }]} onPress={() => refetch()}>
              <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
              <Text style={[s.retryText, { color: colors.mutedForeground }]}>Retry</Text>
            </Pressable>
          </View>
        ) : threads.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: colors.border }]}>
            <Feather name="inbox" size={26} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>All caught up</Text>
            <Text style={[s.emptySubText, { color: colors.mutedForeground }]}>
              Nothing waiting to be filed right now.
            </Text>
          </View>
        ) : (
          threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projects={projects}
              selectMode={selectMode}
              selected={selectedIds.includes(thread.id)}
              onToggleSelect={() => toggleSelect(thread.id)}
              onRefetch={refetchInbox}
            />
          ))
        )}
      </ScrollView>

      {selectMode && selectedIds.length > 0 && (
        <View style={[s.bulkBar, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Text style={[s.bulkBarText, { color: colors.foreground }]}>{selectedIds.length} selected</Text>
          <Pressable
            onPress={() => setShowBulkAssign(true)}
            disabled={bulkAssigning}
            style={[s.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            {bulkAssigning ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>Bulk Assign</Text>
            )}
          </Pressable>
        </View>
      )}

      <ProjectPickerSheet
        visible={showBulkAssign}
        projects={projects}
        onClose={() => setShowBulkAssign(false)}
        onSelect={handleBulkAssign}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  restrictedText: { fontSize: 15, textAlign: "center", fontFamily: "NunitoSans_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: { minWidth: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  headerAction: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  filterChipText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8, borderWidth: 1, borderRadius: 16, borderStyle: "dashed" },
  emptyTitle: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "NunitoSans_400Regular", textAlign: "center", paddingHorizontal: 24, lineHeight: 17 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  threadCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  threadTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  threadIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  threadSubject: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  threadMeta: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 1 },
  threadDate: { fontSize: 11, fontFamily: "NunitoSans_400Regular" },
  suggestionBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", borderWidth: 1, borderRadius: 12, padding: 8 },
  suggestionText: { flex: 1, fontSize: 12, fontFamily: "NunitoSans_500Medium", lineHeight: 16 },
  actionsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  actionBtnText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  actionBtnPrimaryText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  iconBtn: { width: 30, height: 30, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bulkBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bulkBarText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 13 },
  primaryBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold", color: "#FFFFFF" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 20 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 15, fontFamily: "NunitoSans_600SemiBold", paddingHorizontal: 16, marginBottom: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetRowText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
});
