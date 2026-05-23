import {
  useListAllRFIs,
  useCreateRFI,
  useListProjects,
  getListAllRFIsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import type { RFIListItem } from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────

type RFIStatus = "open" | "in_review" | "answered" | "closed";
type RFIPriority = "low" | "medium" | "high" | "urgent";

const STATUS_CONFIG: Record<RFIStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#3b82f6", bg: "#eff6ff" },
  in_review: { label: "In Review", color: "#f59e0b", bg: "#fffbeb" },
  answered: { label: "Answered", color: "#22c55e", bg: "#f0fdf4" },
  closed: { label: "Closed", color: "#6b7280", bg: "#f3f4f6" },
};

const PRIORITY_CONFIG: Record<RFIPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "#6b7280" },
  medium: { label: "Medium", color: "#f59e0b" },
  high: { label: "High", color: "#ef4444" },
  urgent: { label: "Urgent", color: "#dc2626" },
};

const PRIORITIES: { label: string; value: RFIPriority }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const STATUS_FILTERS: { label: string; value: RFIStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Review", value: "in_review" },
  { label: "Answered", value: "answered" },
  { label: "Closed", value: "closed" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// ── RFI Row ───────────────────────────────────────────────────────────────────

function RFIRow({ rfi, onPressProject }: { rfi: RFIListItem; onPressProject: () => void }) {
  const colors = useColors();
  const status = (rfi.status as RFIStatus) ?? "open";
  const priority = (rfi.priority as RFIPriority) ?? "medium";
  const statusConf = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  const priorityConf = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const overdue = isOverdue(rfi.dueDate) && status !== "closed" && status !== "answered";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: overdue ? "#fca5a5" : colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPressProject}
    >
      <View style={[styles.priorityBar, { backgroundColor: priorityConf.color }]} />

      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.rfiNumber, { color: colors.mutedForeground }]}>{rfi.rfiNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.bg }]}>
            <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
          </View>
        </View>

        <Text style={[styles.subject, { color: colors.foreground }]} numberOfLines={2}>
          {rfi.subject}
        </Text>

        <View style={styles.rowMeta}>
          {!!rfi.projectName && (
            <View style={[styles.projectChip, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}30` }]}>
              <Feather name="folder" size={10} color={colors.primary} />
              <Text style={[styles.projectChipText, { color: colors.primary }]} numberOfLines={1}>
                {rfi.projectName}
              </Text>
            </View>
          )}
          <View style={[styles.priorityChip, { backgroundColor: `${priorityConf.color}15` }]}>
            <Text style={[styles.priorityChipText, { color: priorityConf.color }]}>
              {priorityConf.label}
            </Text>
          </View>
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {rfi.submittedByName}
          </Text>
        </View>

        {rfi.dueDate && (
          <View style={styles.dueDateRow}>
            <Feather
              name="calendar"
              size={11}
              color={overdue ? "#ef4444" : colors.mutedForeground}
            />
            <Text style={[styles.dueDateText, { color: overdue ? "#ef4444" : colors.mutedForeground }]}>
              {overdue ? "Overdue · " : "Due "}
              {formatDate(rfi.dueDate)}
            </Text>
          </View>
        )}
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

// ── New RFI Modal ─────────────────────────────────────────────────────────────

function NewRFIModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: projectsData } = useListProjects();
  const projects: { id: number; name: string }[] = Array.isArray(projectsData)
    ? (projectsData as any[])
    : (projectsData as any)?.projects ?? [];

  const [projectId, setProjectId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<RFIPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const createMutation = useCreateRFI({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAllRFIsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleClose();
      },
      onError: () => Alert.alert("Error", "Failed to create RFI. Please try again."),
    },
  });

  function handleClose() {
    onClose();
    setProjectId(null);
    setSubject("");
    setDescription("");
    setPriority("medium");
    setDueDate("");
  }

  const isValid = projectId !== null && subject.trim().length > 0 && description.trim().length > 0;
  const selectedProject = projects.find((p) => p.id === projectId);

  function handleSubmit() {
    if (!isValid || !projectId) return;
    createMutation.mutate({
      projectId,
      data: {
        subject: subject.trim(),
        description: description.trim(),
        priority,
        ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
      },
    });
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.background }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New RFI</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!isValid || createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={[styles.modalSave, { color: isValid ? colors.primary : colors.mutedForeground }]}>
                    Submit
                  </Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
            {/* Project */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Project <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <Pressable
                style={[styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowProjectPicker(true)}
              >
                <Feather name="folder" size={14} color={selectedProject ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.pickerBtnText, { color: selectedProject ? colors.foreground : colors.mutedForeground }]}>
                  {selectedProject?.name ?? "Select a project"}
                </Text>
                <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Subject */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Subject <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={subject}
                onChangeText={setSubject}
                placeholder="Brief summary of the request"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
                maxLength={255}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Description <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue, question, or request in detail…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            {/* Priority */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Priority</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {PRIORITIES.map((p) => (
                  <Pressable
                    key={p.value}
                    style={[
                      styles.priorityPill,
                      priority === p.value
                        ? { backgroundColor: PRIORITY_CONFIG[p.value].color, borderColor: PRIORITY_CONFIG[p.value].color }
                        : { backgroundColor: colors.muted, borderColor: colors.border },
                    ]}
                    onPress={() => setPriority(p.value)}
                  >
                    <Text style={[
                      styles.priorityPillText,
                      { color: priority === p.value ? "#fff" : colors.mutedForeground },
                    ]}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Due date */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Due Date (optional)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Project picker sheet */}
      <Modal visible={showProjectPicker} transparent animationType="slide" onRequestClose={() => setShowProjectPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowProjectPicker(false)} />
        <View style={[styles.pickerSheet, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.pickerSheetTitle, { color: colors.foreground }]}>Select Project</Text>
          <ScrollView>
            {projects.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>No projects available</Text>
              </View>
            ) : projects.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.pickerRow, { borderBottomColor: colors.border }, p.id === projectId && { backgroundColor: `${colors.primary}10` }]}
                onPress={() => { setProjectId(p.id); setShowProjectPicker(false); }}
              >
                <Text style={[styles.pickerRowText, { color: colors.foreground }]}>{p.name}</Text>
                {p.id === projectId && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AllRFIsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, refetch } = useListAllRFIs();

  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<RFIStatus | "all">("all");
  const [showNewRFI, setShowNewRFI] = useState(false);

  const rfis = (data ?? []) as RFIListItem[];

  const projects = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of rfis) {
      if (!seen.has(r.projectId) && r.projectName) {
        seen.set(r.projectId, r.projectName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rfis]);

  const filtered = useMemo(() => {
    let list = rfis;
    if (selectedProject !== null) {
      list = list.filter((r) => r.projectId === selectedProject);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.subject.toLowerCase().includes(q) ||
          r.rfiNumber.toLowerCase().includes(q) ||
          (r.projectName ?? "").toLowerCase().includes(q) ||
          r.submittedByName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rfis, search, selectedProject, statusFilter]);

  const openCount = rfis.filter((r) => r.status === "open" || r.status === "in_review").length;
  const overdueCount = rfis.filter((r) => isOverdue(r.dueDate) && r.status !== "closed" && r.status !== "answered").length;

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>RFIs</Text>
              {filtered.length > 0 && (
                <Text style={[styles.countText, { color: colors.mutedForeground }]}>
                  {filtered.length} {filtered.length === 1 ? "RFI" : "RFIs"}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowNewRFI(true);
              }}
            >
              <Feather name="plus" size={15} color="#fff" />
              <Text style={styles.newBtnText}>New RFI</Text>
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          {!isLoading && rfis.length > 0 && (
            <View style={styles.statsRow}>
              <View style={[styles.statChip, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
                <Text style={[styles.statValue, { color: "#3b82f6" }]}>{openCount}</Text>
                <Text style={[styles.statLabel, { color: "#3b82f6" }]}>Open</Text>
              </View>
              {overdueCount > 0 && (
                <View style={[styles.statChip, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                  <Feather name="alert-triangle" size={12} color="#ef4444" />
                  <Text style={[styles.statValue, { color: "#ef4444" }]}>{overdueCount}</Text>
                  <Text style={[styles.statLabel, { color: "#ef4444" }]}>Overdue</Text>
                </View>
              )}
            </View>
          )}

          {/* Search */}
          <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search RFIs..."
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

          {/* Status filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((sf) => (
                <Pressable
                  key={sf.value}
                  onPress={() => setStatusFilter(sf.value)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: statusFilter === sf.value ? colors.primary : colors.muted,
                      borderColor: statusFilter === sf.value ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: statusFilter === sf.value ? "#fff" : colors.mutedForeground }]}>
                    {sf.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Project filter */}
          {projects.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => setSelectedProject(null)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: selectedProject === null ? colors.foreground : colors.muted,
                      borderColor: selectedProject === null ? colors.foreground : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: selectedProject === null ? colors.background : colors.mutedForeground }]}>
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
                        backgroundColor: selectedProject === p.id ? colors.foreground : colors.muted,
                        borderColor: selectedProject === p.id ? colors.foreground : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterPillText, { color: selectedProject === p.id ? colors.background : colors.mutedForeground }]}>
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
              <Feather name="alert-circle" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.foreground }]}>
                {search || selectedProject !== null || statusFilter !== "all"
                  ? "No RFIs match your filters"
                  : "No RFIs yet"}
              </Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
                {search || selectedProject !== null || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "RFIs submitted across all projects will appear here"}
              </Text>
              {!search && selectedProject === null && statusFilter === "all" && (
                <TouchableOpacity
                  style={[styles.emptyNewBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowNewRFI(true)}
                >
                  <Feather name="plus" size={15} color="#fff" />
                  <Text style={styles.newBtnText}>New RFI</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filtered.map((r) => (
              <RFIRow
                key={r.id}
                rfi={r}
                onPressProject={() => router.push(`/project/${r.projectId}` as any)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <NewRFIModal visible={showNewRFI} onClose={() => setShowNewRFI(false)} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginBottom: 8, alignSelf: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  countText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyNewBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 12,
  },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },

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
    flexDirection: "row", alignItems: "flex-start", gap: 0,
    marginBottom: 10, borderRadius: 12, borderWidth: 1, overflow: "hidden",
  },
  priorityBar: { width: 4, alignSelf: "stretch" },

  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4, paddingRight: 4, paddingTop: 12, paddingLeft: 12 },
  rfiNumber: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  subject: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20, paddingHorizontal: 12, marginBottom: 8 },

  rowMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, marginBottom: 8 },
  projectChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  projectChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", maxWidth: 120 },
  priorityChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  priorityChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  dueDateRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingBottom: 12 },
  dueDateText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  emptyContainer: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6, lineHeight: 20 },

  // Modal
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: Platform.OS === "ios" ? 54 : 14,
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  textInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  textArea: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 120,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
  },
  pickerBtnText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  priorityPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  priorityPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Project picker sheet
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  pickerSheet: {
    borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40, maxHeight: "60%",
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginVertical: 10 },
  pickerSheetTitle: { fontSize: 15, fontFamily: "Inter_700Bold", paddingHorizontal: 16, marginBottom: 8 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
