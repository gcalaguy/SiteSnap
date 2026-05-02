import { useListProjects, useListTasks, useUpdateTask } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

type Task = {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string | null;
};

const PRIORITY_CONFIG = {
  high: { color: "#EF4444", label: "High" },
  medium: { color: "#F59E0B", label: "Medium" },
  low: { color: "#6B7280", label: "Low" },
};

const STATUS_CONFIG = {
  todo: { label: "To Do", icon: "circle" as const },
  in_progress: { label: "In Progress", icon: "clock" as const },
  done: { label: "Done", icon: "check-circle" as const },
};

function TaskRow({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
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
      <View style={[styles.checkbox, {
        backgroundColor: isDone ? colors.primary : "transparent",
        borderColor: isDone ? colors.primary : colors.border,
      }]}>
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
          <Text style={[styles.priorityText, { color: priorityConf.color }]}>{priorityConf.label}</Text>
          {!!task.dueDate && (
            <>
              <Text style={[styles.metaDivider, { color: colors.border }]}>·</Text>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {" "}{new Date(task.dueDate).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 14 },
  projectSelector: { flexDirection: "row", gap: 8 },
  projectTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  projectTabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
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
  taskMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  metaDivider: { fontSize: 12 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyContainer: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 10 },
  loader: { paddingVertical: 40 },
  noProjectBanner: { marginHorizontal: 20, marginTop: 40, alignItems: "center" },
  noProjectText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 12 },
  noProjectSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
});

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const resolvedProjectId = selectedProjectId ?? ((projects ?? [])[0]?.id ?? 0);

  const { data: tasks, isLoading: tasksLoading, refetch } = useListTasks(resolvedProjectId);
  const updateTask = useUpdateTask();

  const handleToggle = (task: Task) => {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask.mutate(
      { projectId: task.projectId, taskId: task.id, data: { status: nextStatus } },
      { onSuccess: () => refetch() }
    );
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const todo = (tasks ?? []).filter(t => t.status === "todo");
  const inProgress = (tasks ?? []).filter(t => t.status === "in_progress");
  const done = (tasks ?? []).filter(t => t.status === "done");

  const activeProjects = (projects ?? []).filter(p => p.status === "active");

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={refetch} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90, flexGrow: 1 }}
    >
      <View style={[styles.header, { paddingTop: topInsets + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Tasks</Text>

        {/* Project selector */}
        {projectsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.projectSelector}>
              {activeProjects.map(p => {
                const active = resolvedProjectId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.projectTab, {
                      backgroundColor: active ? colors.primary : colors.muted,
                      borderColor: active ? colors.primary : colors.border,
                    }]}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text style={[styles.projectTabText, { color: active ? "#FFFFFF" : colors.mutedForeground }]}>
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
          <Text style={[styles.noProjectText, { color: colors.foreground }]}>No active projects</Text>
          <Text style={[styles.noProjectSub, { color: colors.mutedForeground }]}>
            Create a project on the web dashboard to manage tasks
          </Text>
        </View>
      ) : tasksLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (tasks ?? []).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="check-square" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks for this project</Text>
        </View>
      ) : (
        <>
          {inProgress.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>In Progress</Text>
              </View>
              {inProgress.map(t => <TaskRow key={t.id} task={t as Task} onToggle={handleToggle} />)}
            </>
          )}

          {todo.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>To Do</Text>
              </View>
              {todo.map(t => <TaskRow key={t.id} task={t as Task} onToggle={handleToggle} />)}
            </>
          )}

          {done.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Done</Text>
              </View>
              {done.map(t => <TaskRow key={t.id} task={t as Task} onToggle={handleToggle} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
