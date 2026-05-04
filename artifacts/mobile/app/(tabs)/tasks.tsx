import { useListProjects, useListTasks, useUpdateTask, useGetMe, customFetch } from "@workspace/api-client-react";
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

const PRIORITY_CONFIG = {
  high: { color: "#EF4444", label: "High" },
  medium: { color: "#F59E0B", label: "Medium" },
  low: { color: "#6B7280", label: "Low" },
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
  const colors = useColors();
  return (
    <View style={styles.filterRow}>
      {(["all", "mine"] as FilterMode[]).map((m) => {
        const active = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[
              styles.filterPill,
              {
                backgroundColor: active ? colors.primary : colors.muted,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: active ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              {m === "all" ? "All Tasks" : "Assigned to Me"}
            </Text>
            {m === "mine" && mineCount > 0 && (
              <View
                style={[
                  styles.filterBadge,
                  { backgroundColor: active ? "rgba(255,255,255,0.3)" : colors.primary },
                ]}
              >
                <Text style={styles.filterBadgeText}>{mineCount}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function TaskRow({ task, projectName, onToggle }: { task: Task; projectName?: string; onToggle: (task: Task) => void }) {
  const colors = useColors();
  const isDone = task.status === "done";
  const priorityConf = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

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
  filterPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  filterBadgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },
  projectSelector: { flexDirection: "row", gap: 8 },
  projectTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  projectTabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
  noProjectBanner: { marginHorizontal: 20, marginTop: 40, alignItems: "center" },
  noProjectText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  noProjectSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
});

// ── Worker view: all tasks assigned to me across all projects ──────────────
function WorkerTasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data: projects } = useListProjects();
  const projectMap: Record<number, string> = {};
  (projects ?? []).forEach((p) => { projectMap[p.id] = p.name; });

  const { data: tasks, isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["my-tasks"],
    queryFn: () => customFetch<Task[]>("/api/dashboard/my-tasks"),
  });

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

  const allTasks = tasks ?? [];
  const inProgress = allTasks.filter((t) => t.status === "in_progress");
  const todo = allTasks.filter((t) => t.status === "todo");
  const done = allTasks.filter((t) => t.status === "done");
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Tasks</Text>
          {allTasks.length > 0 && (
            <Text style={[styles.sectionCount, { color: colors.mutedForeground, fontSize: 14 }]}>
              {allTasks.length} total
            </Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : allTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-square" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.foreground }]}>No tasks assigned to you</Text>
          <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
            When a foreman assigns a task to you, it will appear here.
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

  // Use all projects in selector (not just "active")
  const allProjects = projects ?? [];
  const resolvedProjectId = selectedProjectId ?? (allProjects[0]?.id ?? 0);

  const { data: tasks, isLoading: tasksLoading, refetch } = useListTasks(resolvedProjectId);
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

  const allTasks = (tasks ?? []) as Task[];
  const myUserId = me?.id;
  const myTasksAll = myUserId ? allTasks.filter((t) => t.assignedToUserId === myUserId) : [];
  const visibleTasks = filterMode === "mine" ? myTasksAll : allTasks;

  const inProgress = visibleTasks.filter((t) => t.status === "in_progress");
  const todo = visibleTasks.filter((t) => t.status === "todo");
  const done = visibleTasks.filter((t) => t.status === "done");

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const projectMap: Record<number, string> = {};

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Tasks</Text>
        </View>

        <FilterToggle mode={filterMode} onChange={setFilterMode} mineCount={myTasksAll.length} />

        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.projectSelector}>
              {allProjects.map((p) => {
                const active = resolvedProjectId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.projectTab,
                      {
                        backgroundColor: active ? colors.card : colors.muted,
                        borderColor: active ? colors.foreground + "40" : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text
                      style={[
                        styles.projectTabText,
                        { color: active ? colors.foreground : colors.mutedForeground },
                      ]}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {!resolvedProjectId ? (
        <View style={styles.noProjectBanner}>
          <Feather name="layers" size={44} color={colors.border} />
          <Text style={[styles.noProjectText, { color: colors.foreground }]}>No projects yet</Text>
          <Text style={[styles.noProjectSub, { color: colors.mutedForeground }]}>
            Create a project on the web dashboard to manage tasks.
          </Text>
        </View>
      ) : tasksLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : visibleTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name={filterMode === "mine" ? "user-check" : "check-square"} size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.foreground }]}>
            {filterMode === "mine" ? "Nothing assigned to you" : "No tasks for this project"}
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

// ── Entry point: routes to correct view based on role ─────────────────────
export default function TasksScreen() {
  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";

  if (isWorker) return <WorkerTasksScreen />;
  return <OwnerTasksScreen />;
}
