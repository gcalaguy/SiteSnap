import { useListProjects, useListTasks, useUpdateTask, useCreateTask, useGetMe, customFetch } from "@workspace/api-client-react";
import { TaskFormSheet, type TaskFormValues } from "@/components/sheets/TaskFormSheet";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import {
  ActivityIndicator,
  Alert,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Chip } from "@/components/ui";

type Task = {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  assignedToUserId?: number | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
};

type FilterMode = "all" | "mine";
type StatusFilter = "all" | "todo" | "in_progress" | "done" | "overdue";

// Same "overdue" definition the Home dashboard's "Overdue Tasks" tile uses, so
// the count it shows matches what this filtered list shows.
function isOverdueTask(t: Task): boolean {
  return t.status !== "done" && !!t.dueDate && new Date(t.dueDate) < new Date();
}

const PRIORITY_CONFIG = {
  high: { color: "#EF4444", label: "High" },
  medium: { color: "#F59E0B", label: "Medium" },
  low: { color: "#6B7280", label: "Low" },
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const STATUS_FILTER_EMPTY_LABEL: Record<StatusFilter, string> = {
  all: "",
  overdue: "overdue",
  todo: "to do",
  in_progress: "in-progress",
  done: "done",
};

function FilterToggle({
  mode,
  onChange,
  mineCount,
}: {
  mode: FilterMode;
  onChange: (m: FilterMode) => void;
  mineCount: number;
}) {
  return (
    <View style={styles.filterRow}>
      <Chip label="All Tasks" selected={mode === "all"} onPress={() => onChange("all")} />
      <Chip
        label="Assigned to Me"
        selected={mode === "mine"}
        onPress={() => onChange("mine")}
        count={mineCount > 0 ? mineCount : undefined}
      />
    </View>
  );
}

function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
      <View style={[styles.filterRow, { marginBottom: 0 }]}>
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <Chip key={opt.value} label={opt.label} selected={value === opt.value} onPress={() => onChange(opt.value)} />
        ))}
      </View>
    </ScrollView>
  );
}

function TaskRow({ task, projectName, onToggle }: { task: Task; projectName?: string; onToggle: (task: Task) => void }) {
  const colors = useColors();
  const isDone = task.status === "done";
  const priorityConf = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

  const nextStatus: Task["status"] =
    task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
  const nextLabel =
    task.status === "done" ? "Mark as to do" : task.status === "todo" ? "Start task" : "Mark as done";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.taskRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={() => onToggle(task)}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${projectName ? ` — ${projectName}` : ""}, ${task.status === "done" ? "completed" : task.status === "in_progress" ? "in progress" : "to do"}`}
      accessibilityHint={nextLabel}
      accessibilityState={{ checked: isDone }}
    >
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: isDone ? colors.primary : "transparent",
            borderColor: isDone ? colors.primary : colors.border,
          },
        ]}
      >
        {isDone && <Feather name="check" size={12} color="#FFFFFF" />}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.taskTitle,
            { color: isDone ? colors.mutedForeground : colors.foreground },
            isDone && styles.taskDone,
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>

        <View style={styles.taskMeta}>
          <View style={[styles.priorityDot, { backgroundColor: priorityConf.color }]} />
          <Text style={[styles.priorityText, { color: priorityConf.color }]}>
            {priorityConf.label}
          </Text>
          {!!projectName && (
            <>
              <Text style={[styles.metaDivider, { color: colors.border }]}>·</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {projectName}
              </Text>
            </>
          )}
          {!!task.dueDate && (
            <>
              <Text style={[styles.metaDivider, { color: colors.border }]}>·</Text>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {" "}
                {new Date(task.dueDate).toLocaleDateString("en-CA", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </>
          )}
          {task.status === "in_progress" && (
            <>
              <Text style={[styles.metaDivider, { color: colors.border }]}>·</Text>
              <Text style={[styles.metaText, { color: colors.primary }]}>In progress</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function TaskSection({
  label,
  tasks,
  projectMap,
  onToggle,
  labelColor,
}: {
  label: string;
  tasks: Task[];
  projectMap: Record<number, string>;
  onToggle: (t: Task) => void;
  labelColor: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.sectionCount, { color: labelColor }]}>{tasks.length}</Text>
      </View>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} projectName={projectMap[t.projectId]} onToggle={onToggle} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  projectSelector: { flexDirection: "row", gap: 8 },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 4 },
  updatedText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  taskTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  taskDone: { textDecorationLine: "line-through" },
  taskMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4, flexWrap: "wrap" },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  metaDivider: { fontSize: 12 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyContainer: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 10 },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  loader: { paddingVertical: 40 },
  voiceMicBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noProjectBanner: { marginHorizontal: 20, marginTop: 40, alignItems: "center" },
  noProjectText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  noProjectSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  fabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ── Simple fuzzy match for voice task lookup ───────────────────────────────
function fuzzyTaskMatch(query: string, tasks: Task[]): Task | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const q = norm(query);
  // Exact match first
  let match = tasks.find((t) => norm(t.title) === q);
  if (match) return match;
  // Substring match
  match = tasks.find((t) => norm(t.title).includes(q) || q.includes(norm(t.title)));
  if (match) return match;
  // Word overlap (≥50%)
  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  let best: Task | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    const tWords = new Set(norm(t.title).split(/\s+/).filter(Boolean));
    let overlap = 0;
    for (const w of qWords) if (tWords.has(w)) overlap++;
    const score = overlap / Math.max(qWords.size, tWords.size);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore >= 0.5 ? best : null;
}

// ── Worker view: all tasks assigned to me across all projects ──────────────
function WorkerTasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  // The Home dashboard's "Overdue Tasks" tile deep-links here with ?filter=overdue
  // so the list it navigates to matches the count it showed.
  const params = useLocalSearchParams<{ filter?: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    params.filter === "overdue" ? "overdue" : "all",
  );
  // tasks.tsx is a persistent Tabs.Screen, not pushed fresh each time — the
  // useState initializer above only runs on first mount, so re-sync whenever
  // the Home tile deep-links here again with a new ?filter value.
  useEffect(() => {
    if (params.filter === "overdue") setStatusFilter("overdue");
  }, [params.filter]);

  const { data: projects } = useListProjects();
  const projectMap: Record<number, string> = {};
  (projects ?? []).forEach((p) => { projectMap[p.id] = p.name; });

  const { data: tasks, isLoading, refetch, dataUpdatedAt } = useQuery<Task[]>({
    queryKey: ["my-tasks"],
    // limit=200 is the endpoint's max — without it the default cap (100) can
    // silently undercount tasks/hide overdue ones for large task lists.
    queryFn: () => customFetch<Task[]>("/api/dashboard/my-tasks?limit=200"),
  });

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);
  const relativeTime = useRelativeTime(dataUpdatedAt || null);
  const updatedLabel = refreshing ? "Refreshing…" : relativeTime;

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const updateTask = useUpdateTask();

  const handleToggle = (task: Task) => {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask.mutate(
      { projectId: task.projectId, taskId: task.id, data: { status: nextStatus } },
      { onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["my-tasks"] }); } },
    );
  };

  // Voice "mark done" — say "Mark framing as done" or just a task name
  const voiceMark = useVoiceRecorder((transcript) => {
    if (!transcript.trim()) return;
    const allTasks = tasks ?? [];
    // Strip common voice prefixes before fuzzy-matching the task name
    const cleaned = transcript
      .replace(/^(?:mark|complete|finish|done with|close)\s+/i, "")
      .replace(/\s+(?:as\s+)?(?:done|complete|finished|closed)$/i, "")
      .trim();
    const found = fuzzyTaskMatch(cleaned || transcript, allTasks.filter((t) => t.status !== "done"));
    if (!found) {
      Alert.alert("Task not found", `Couldn't find a task matching "${transcript}". Try saying the task name more clearly.`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTask.mutate(
      { projectId: found.projectId, taskId: found.id, data: { status: "done" } },
      {
        onSuccess: () => {
          refetch();
          qc.invalidateQueries({ queryKey: ["my-tasks"] });
          Alert.alert("✓ Done", `"${found.title}" marked as complete.`);
        },
        onError: () => Alert.alert("Error", "Failed to update task."),
      },
    );
  });

  const allTasks = tasks ?? [];
  const visible =
    statusFilter === "all"
      ? allTasks
      : statusFilter === "overdue"
      ? allTasks.filter(isOverdueTask)
      : allTasks.filter((t) => t.status === statusFilter);
  const inProgress = visible.filter((t) => t.status === "in_progress");
  const todo = visible.filter((t) => t.status === "todo");
  const done = visible.filter((t) => t.status === "done");
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Tasks</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {allTasks.length > 0 && (
              <Text style={[styles.sectionCount, { color: colors.mutedForeground, fontSize: 14 }]}>
                {allTasks.length} total
              </Text>
            )}
            {/* Voice "mark done" mic button */}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void voiceMark.toggle();
              }}
              accessibilityRole="button"
              accessibilityLabel={voiceMark.state === "recording" ? "Stop recording" : "Mark task done by voice"}
              accessibilityHint='Say the task name to mark it complete, e.g. "framing inspection"'
              style={[
                styles.voiceMicBtn,
                {
                  backgroundColor: voiceMark.state === "recording"
                    ? "#EF444420"
                    : voiceMark.state === "transcribing"
                    ? `${colors.primary}15`
                    : `${colors.primary}15`,
                  borderColor: voiceMark.state === "recording" ? "#EF4444" : colors.border,
                },
              ]}
            >
              {voiceMark.state === "transcribing" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather
                  name={voiceMark.state === "recording" ? "mic-off" : "mic"}
                  size={15}
                  color={voiceMark.state === "recording" ? "#EF4444" : colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <StatusFilterPills value={statusFilter} onChange={setStatusFilter} />
      </View>

      {updatedLabel ? (
        <View style={styles.updatedRow}>
          <Feather name="clock" size={11} color="#9CA3AF" />
          <Text style={styles.updatedText}>{updatedLabel}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : visible.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-square" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.foreground }]}>
            {statusFilter !== "all" ? `No ${STATUS_FILTER_EMPTY_LABEL[statusFilter]} tasks` : "No tasks assigned to you"}
          </Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            {statusFilter !== "all"
              ? "Try a different filter above."
              : "When a foreman assigns a task to you, it will appear here."}
          </Text>
        </View>
      ) : (
        <>
          <TaskSection label="In Progress" tasks={inProgress} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.primary} />
          <TaskSection label="To Do" tasks={todo} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.mutedForeground} />
          <TaskSection label="Done" tasks={done} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.mutedForeground} />
        </>
      )}
    </ScrollView>
  );
}

// ── Owner / Foreman view: tasks per project ────────────────────────────────
function OwnerTasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  // The Home dashboard's "Overdue Tasks" tile deep-links here with ?filter=overdue
  // so the list it navigates to matches the count it showed.
  const params = useLocalSearchParams<{ filter?: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    params.filter === "overdue" ? "overdue" : "all",
  );
  // tasks.tsx is a persistent Tabs.Screen, not pushed fresh each time — the
  // useState initializer above only runs on first mount, so re-sync whenever
  // the Home tile deep-links here again with a new ?filter value.
  useEffect(() => {
    if (params.filter === "overdue") setStatusFilter("overdue");
  }, [params.filter]);

  const allProjects = projects ?? [];
  const resolvedProjectId = selectedProjectId;
  const projectIds = allProjects.map((p) => p.id);
  // "overdue" isn't a status the backend understands — fetch unfiltered and
  // apply the same overdue definition the Home tile uses, client-side below.
  const backendStatusFilter = statusFilter === "overdue" ? "all" : statusFilter;

  const { data: tasks, isLoading: tasksLoading, refetch, dataUpdatedAt: tasksUpdatedAt } = useQuery<Task[]>({
    queryKey: ["tasks", "accessible", backendStatusFilter],
    queryFn: async () => {
      const results = await Promise.all(
        projectIds.map((projectId) => {
          const url =
            backendStatusFilter !== "all"
              ? `/api/projects/${projectId}/tasks?status=${backendStatusFilter}`
              : `/api/projects/${projectId}/tasks`;
          return customFetch<Task[]>(url);
        }),
      );
      return results.flat();
    },
    enabled: projectIds.length > 0,
  });
  const [taskRefreshing, setTaskRefreshing] = useState(false);
  const handleTaskRefresh = useCallback(async () => {
    setTaskRefreshing(true);
    try { await refetch(); } finally { setTaskRefreshing(false); }
  }, [refetch]);
  const tasksRelTime = useRelativeTime(tasksUpdatedAt || null);
  const tasksUpdatedLabel = taskRefreshing ? "Refreshing…" : tasksRelTime;

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const updateTask = useUpdateTask();

  const handleToggle = (task: Task) => {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask.mutate(
      { projectId: task.projectId, taskId: task.id, data: { status: nextStatus } },
      { onSuccess: () => refetch() },
    );
  };

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        refetch();
        setShowCreateSheet(false);
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

  const fetchedTasks = (tasks ?? []) as Task[];
  const allTasks = statusFilter === "overdue" ? fetchedTasks.filter(isOverdueTask) : fetchedTasks;
  const myUserId = me?.id;
  const myTasksAll = myUserId ? allTasks.filter((t) => t.assignedToUserId === myUserId) : [];
  const visibleTasks = (filterMode === "mine" ? myTasksAll : allTasks).filter(
    (t) => resolvedProjectId === null || t.projectId === resolvedProjectId,
  );

  const inProgress = visibleTasks.filter((t) => t.status === "in_progress");
  const todo = visibleTasks.filter((t) => t.status === "todo");
  const done = visibleTasks.filter((t) => t.status === "done");

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  // Build project name lookup for TaskRow labels (was empty before — bug fix)
  const projectMap: Record<number, string> = {};
  allProjects.forEach((p) => { projectMap[p.id] = p.name; });

  // Voice "mark done" for owner/foreman — same fuzzy-match logic as worker view
  const voiceMark = useVoiceRecorder((transcript) => {
    if (!transcript.trim()) return;
    const openTasks = allTasks.filter((t) => t.status !== "done");
    const cleaned = transcript
      .replace(/^(?:mark|complete|finish|done with|close)\s+/i, "")
      .replace(/\s+(?:as\s+)?(?:done|complete|finished|closed)$/i, "")
      .trim();
    const found = fuzzyTaskMatch(cleaned || transcript, openTasks);
    if (!found) {
      Alert.alert("Task not found", `Couldn't find an open task matching "${transcript}". Try saying the task name more clearly.`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTask.mutate(
      { projectId: found.projectId, taskId: found.id, data: { status: "done" } },
      {
        onSuccess: () => {
          refetch();
          Alert.alert("✓ Done", `"${found.title}" marked as complete.`);
        },
        onError: () => Alert.alert("Error", "Failed to update task."),
      },
    );
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={taskRefreshing} onRefresh={handleTaskRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Tasks</Text>
          {/* Voice "mark done" mic button — same as worker view */}
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void voiceMark.toggle();
            }}
            accessibilityRole="button"
            accessibilityLabel={voiceMark.state === "recording" ? "Stop recording" : "Mark task done by voice"}
            accessibilityHint='Say the task name to mark it complete, e.g. "framing inspection"'
            style={[
              styles.voiceMicBtn,
              {
                backgroundColor: voiceMark.state === "recording" ? "#EF444420" : `${colors.primary}15`,
                borderColor: voiceMark.state === "recording" ? "#EF4444" : colors.border,
              },
            ]}
          >
            {voiceMark.state === "transcribing" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={voiceMark.state === "recording" ? "mic-off" : "mic"}
                size={15}
                color={voiceMark.state === "recording" ? "#EF4444" : colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>

        <FilterToggle mode={filterMode} onChange={setFilterMode} mineCount={myTasksAll.length} />
        <StatusFilterPills value={statusFilter} onChange={setStatusFilter} />

        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.projectSelector}>
              <Chip label="All Projects" selected={resolvedProjectId === null} onPress={() => setSelectedProjectId(null)} />
              {allProjects.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={resolvedProjectId === p.id}
                  onPress={() => setSelectedProjectId(p.id)}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {tasksUpdatedLabel ? (
        <View style={styles.updatedRow}>
          <Feather name="clock" size={11} color="#9CA3AF" />
          <Text style={styles.updatedText}>{tasksUpdatedLabel}</Text>
        </View>
      ) : null}

      {!allProjects.length ? (
        <View style={styles.noProjectBanner}>
          <Feather name="layers" size={44} color={colors.border} />
          <Text style={[styles.noProjectText, { color: colors.foreground }]}>No projects yet</Text>
          <Text style={[styles.noProjectSub, { color: colors.mutedForeground }]}>
            {isOwnerOrForeman ? "Create a project from the Projects tab to start adding tasks." : "Create a project on the web dashboard to manage tasks."}
          </Text>
        </View>
      ) : tasksLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : visibleTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name={filterMode === "mine" ? "user-check" : "check-square"} size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.foreground }]}>
            {filterMode === "mine" && statusFilter !== "all"
              ? `No ${STATUS_FILTER_EMPTY_LABEL[statusFilter]} tasks assigned to you`
              : filterMode === "mine"
              ? "Nothing assigned to you"
              : statusFilter !== "all"
              ? `No ${STATUS_FILTER_EMPTY_LABEL[statusFilter]} tasks`
              : "No tasks for this project"}
          </Text>
        </View>
      ) : (
        <>
          <TaskSection label="In Progress" tasks={inProgress} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.primary} />
          <TaskSection label="To Do" tasks={todo} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.mutedForeground} />
          <TaskSection label="Done" tasks={done} projectMap={projectMap} onToggle={handleToggle} labelColor={colors.mutedForeground} />
        </>
      )}
    </ScrollView>

      {isOwnerOrForeman && allProjects.length > 0 && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border, bottom: insets.bottom + 20 }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateSheet(true);
          }}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[styles.fabText, { color: colors.primary }]}>Task</Text>
        </Pressable>
      )}

      <TaskFormSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        onSubmit={handleCreateTask}
        submitting={creatingTask}
      />
    </View>
  );
}

// ── Entry point: routes to correct view based on role ─────────────────────
export default function TasksScreen() {
  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";

  if (isWorker) return <WorkerTasksScreen />;
  return <OwnerTasksScreen />;
}
