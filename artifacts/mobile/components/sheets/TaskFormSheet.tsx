import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useGetMe, useListCompanyMembers, useListProjects } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { radius, spacing } from "@/constants/theme";
import { BottomSheet, Button, Chip } from "@/components/ui";

export interface TaskFormValues {
  projectId: number;
  title: string;
  description: string | null;
  assignedToUserId: number | null;
  priority: "low" | "medium" | "high";
  dueDate: string | null;
}

interface TaskFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void;
  submitting?: boolean;
  /** Lock the project selector to a single project (e.g. when adding a task from a project detail screen). */
  projectId?: number;
  projectName?: string;
}

const PRIORITY_OPTIONS: { value: TaskFormValues["priority"]; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function TaskFormSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  projectId: fixedProjectId,
  projectName,
}: TaskFormSheetProps) {
  const colors = useColors();
  const { data: me } = useGetMe();
  const { data: projects = [] } = useListProjects();
  const { data: members = [] } = useListCompanyMembers(me?.activeCompanyId ?? 0);

  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<number | null>(null);
  const [priority, setPriority] = useState<TaskFormValues["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (visible) {
      setProjectId(fixedProjectId ?? projects[0]?.id ?? null);
      setTitle("");
      setDescription("");
      setAssignedToUserId(null);
      setPriority("medium");
      setDueDate("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSubmit() {
    if (!projectId) {
      Alert.alert("Select a project");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Enter a task title");
      return;
    }
    onSubmit({
      projectId,
      title: title.trim(),
      description: description.trim() || null,
      assignedToUserId,
      priority,
      dueDate: dueDate.trim() || null,
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New Task">
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
      {fixedProjectId != null ? (
        <Text style={[styles.readOnlyValue, { color: colors.foreground }]}>{projectName ?? `Project #${fixedProjectId}`}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {projects.map((p) => (
            <Chip key={p.id} label={p.name} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
          ))}
        </ScrollView>
      )}

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Title</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. Frame the north wall"
        placeholderTextColor={colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Description</Text>
      <TextInput
        style={[styles.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="Describe the task (optional)..."
        placeholderTextColor={colors.mutedForeground}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Assign To</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Unassigned" selected={assignedToUserId === null} onPress={() => setAssignedToUserId(null)} />
        {members.map((m: any) => {
          const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
          return (
            <Chip key={m.id} label={name} selected={assignedToUserId === m.id} onPress={() => setAssignedToUserId(m.id)} />
          );
        })}
      </ScrollView>

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Priority</Text>
      <View style={styles.chipRow}>
        {PRIORITY_OPTIONS.map((opt) => (
          <Chip key={opt.value} label={opt.label} selected={priority === opt.value} onPress={() => setPriority(opt.value)} />
        ))}
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Due Date</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="YYYY-MM-DD (optional)"
        placeholderTextColor={colors.mutedForeground}
        value={dueDate}
        onChangeText={setDueDate}
      />

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={submitting ? "Creating…" : "Create Task"}
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingRight: spacing.lg },
  readOnlyValue: { fontSize: 15, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 15, fontFamily: "Inter_400Regular" },
  textarea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 84,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    textAlignVertical: "top",
  },
});
