import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { radius, spacing } from "@/constants/theme";
import { BottomSheet, Button, Chip } from "@/components/ui";

export interface ProjectFormValues {
  name: string;
  address: string;
  city: string;
  province: string;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  description: string | null;
}

interface ProjectFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void;
  submitting?: boolean;
}

const STATUS_OPTIONS: { value: ProjectFormValues["status"]; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];

export function ProjectFormSheet({ visible, onClose, onSubmit, submitting = false }: ProjectFormSheetProps) {
  const colors = useColors();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [status, setStatus] = useState<ProjectFormValues["status"]>("planning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (visible) {
      setName("");
      setAddress("");
      setCity("");
      setProvince("");
      setStatus("planning");
      setStartDate("");
      setEndDate("");
      setShowStartPicker(false);
      setShowEndPicker(false);
      setBudget("");
      setDescription("");
    }
  }, [visible]);

  function toIsoDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Enter a project name");
      return;
    }
    if (!address.trim() || !city.trim() || !province.trim()) {
      Alert.alert("Enter an address, city, and province");
      return;
    }
    const budgetNum = budget.trim() ? parseFloat(budget) : null;
    if (budget.trim() && (isNaN(budgetNum!) || budgetNum! < 0)) {
      Alert.alert("Enter a valid budget");
      return;
    }
    onSubmit({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      province: province.trim(),
      status,
      startDate: startDate.trim() || null,
      endDate: endDate.trim() || null,
      budget: budgetNum,
      description: description.trim() || null,
    });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New Project">
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Project Name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. Maple Street Renovation"
        placeholderTextColor={colors.mutedForeground}
        value={name}
        onChangeText={setName}
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Address</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. 123 Maple St"
        placeholderTextColor={colors.mutedForeground}
        value={address}
        onChangeText={setAddress}
      />

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>City</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="e.g. Toronto"
            placeholderTextColor={colors.mutedForeground}
            value={city}
            onChangeText={setCity}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Province</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder="e.g. ON"
            placeholderTextColor={colors.mutedForeground}
            value={province}
            onChangeText={setProvince}
          />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Status</Text>
      <View style={styles.chipRow}>
        {STATUS_OPTIONS.map((opt) => (
          <Chip key={opt.value} label={opt.label} selected={status === opt.value} onPress={() => setStatus(opt.value)} />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Start Date</Text>
          <Pressable
            style={[styles.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => { setShowEndPicker(false); setShowStartPicker(true); }}
          >
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.dateText, { color: startDate ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {startDate
                ? new Date(startDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
                : "Select date"}
            </Text>
            {!!startDate && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setStartDate(""); }} hitSlop={8}>
                <Feather name="x" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>End Date</Text>
          <Pressable
            style={[styles.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => { setShowStartPicker(false); setShowEndPicker(true); }}
          >
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.dateText, { color: endDate ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {endDate
                ? new Date(endDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
                : "Select date"}
            </Text>
            {!!endDate && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setEndDate(""); }} hitSlop={8}>
                <Feather name="x" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </Pressable>
        </View>
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={startDate ? new Date(startDate) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={endDate ? new Date(endDate) : undefined}
          onChange={(_event, date) => {
            setShowStartPicker(Platform.OS === "ios");
            if (date) setStartDate(toIsoDate(date));
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate ? new Date(endDate) : startDate ? new Date(startDate) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={startDate ? new Date(startDate) : undefined}
          onChange={(_event, date) => {
            setShowEndPicker(Platform.OS === "ios");
            if (date) setEndDate(toIsoDate(date));
          }}
        />
      )}

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Budget (CAD)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. 150000"
        placeholderTextColor={colors.mutedForeground}
        value={budget}
        onChangeText={setBudget}
        keyboardType="decimal-pad"
      />

      <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.lg }]}>Description</Text>
      <TextInput
        style={[styles.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
        placeholder="Describe the project scope (optional)..."
        placeholderTextColor={colors.mutedForeground}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label={submitting ? "Creating…" : "Create Project"}
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 15, fontFamily: "Inter_400Regular" },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dateText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
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
