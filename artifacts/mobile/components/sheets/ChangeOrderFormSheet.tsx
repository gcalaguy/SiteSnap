import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useListProjects } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { radius, spacing } from "@/constants/theme";
import { BottomSheet, Button, Chip } from "@/components/ui";

export interface ChangeOrderFormValues {
  projectId: number;
  title: string;
  description: string | null;
  amount: number;
  notes: string | null;
}

interface ChangeOrderFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: ChangeOrderFormValues) => void;
  submitting?: boolean;
}

// Replaces the old presentationStyle="pageSheet" full-page Modal — same
// fields, but reached with one swipe-down instead of a full navigation
// transition, and the project is a tappable chip (matches how Expenses
// already lets a field worker pick a project) instead of typing a raw
// project ID by hand.
export function ChangeOrderFormSheet({ visible, onClose, onSubmit, submitting = false }: ChangeOrderFormSheetProps) {
  const colors = useColors();
  const { data: projects = [] } = useListProjects();

  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setProjectId(projects[0]?.id ?? null);
      setTitle("");
      setDescription("");
      setAmount("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSubmit() {
    const amt = parseFloat(amount);
    if (!projectId) {
      Alert.alert("Select a project");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Enter a title");
      return;
    }
    if (!amount || isNaN(amt) || amt <= 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    onSubmit({
      projectId,
      title: title.trim(),
      description: description.trim() || null,
      amount: amt,
      notes: notes.trim() || null,
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New Change Order">
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {projects.map((p) => (
          <Chip key={p.id} label={p.name} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
        ))}
      </ScrollView>

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Title</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. Additional drywall scope"
        placeholderTextColor={colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Description</Text>
      <TextInput
        style={[styles.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="Describe the scope change..."
        placeholderTextColor={colors.mutedForeground}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Amount (CAD)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. 2500.00"
        placeholderTextColor={colors.mutedForeground}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

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
          label={submitting ? "Creating…" : "Create Change Order"}
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
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
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
