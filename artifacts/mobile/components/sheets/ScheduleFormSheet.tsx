import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useGetMe, useListCompanyMembers, useListProjects } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { radius, spacing } from "@/constants/theme";
import { BottomSheet, Button, Chip } from "@/components/ui";

export interface ScheduleFormValues {
  projectId: number;
  userId: number;
  startDate: string;
  endDate: string;
  notes: string | null;
}

interface ScheduleFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: ScheduleFormValues) => void;
  submitting?: boolean;
  /** Lock the project selector to a single project (e.g. when assigning from a project detail screen). */
  projectId?: number;
  projectName?: string;
}

export function ScheduleFormSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  projectId: fixedProjectId,
  projectName,
}: ScheduleFormSheetProps) {
  const colors = useColors();
  const { data: me } = useGetMe();
  const { data: projects = [] } = useListProjects();
  const { data: members = [] } = useListCompanyMembers(me?.activeCompanyId ?? 0);

  const [projectId, setProjectId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setProjectId(fixedProjectId ?? projects[0]?.id ?? null);
      setUserId(null);
      setStartDate("");
      setEndDate("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSubmit() {
    if (!projectId) {
      Alert.alert("Select a project");
      return;
    }
    if (!userId) {
      Alert.alert("Select a worker to assign");
      return;
    }
    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert("Enter a start and end date");
      return;
    }
    onSubmit({
      projectId,
      userId,
      startDate: startDate.trim(),
      endDate: endDate.trim(),
      notes: notes.trim() || null,
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Assign Worker">
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

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Worker</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {members.length === 0 ? (
          <Text style={[styles.readOnlyValue, { color: colors.mutedForeground }]}>No team members found</Text>
        ) : (
          members.map((m: any) => {
            const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
            return <Chip key={m.id} label={name} selected={userId === m.id} onPress={() => setUserId(m.id)} />;
          })
        )}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Start Date</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            value={startDate}
            onChangeText={setStartDate}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>End Date</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            value={endDate}
            onChangeText={setEndDate}
          />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Notes</Text>
      <TextInput
        style={[styles.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="Internal notes (optional)..."
        placeholderTextColor={colors.mutedForeground}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={2}
      />

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={submitting ? "Assigning…" : "Assign Worker"}
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
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.lg },
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
