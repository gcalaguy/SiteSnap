import {
  useListProjects,
  useCreateDailyLog,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

import { createDailyLogBodyNotesMax as NOTES_MAX } from "@workspace/api-zod";

export default function FieldDailyLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [weatherTemp, setWeatherTemp] = useState("");
  const [weatherCondition, setWeatherCondition] = useState("");

  const createLog = useCreateDailyLog({
    mutation: {
      onSuccess: () => router.back(),
    },
  });

  function submit() {
    if (!projectId) return;
    createLog.mutate({
      data: { projectId, notes: notes || null, weatherTemp: weatherTemp || null, weatherCondition: weatherCondition || null },
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Daily Field Log</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Record site notes and weather for the day.
        </Text>

        {/* Project selector */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
        {projects.length === 0 ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.chipRow}>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setProjectId(p.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      projectId === p.id ? colors.primary : colors.card,
                    borderColor: projectId === p.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: projectId === p.id ? "#fff" : colors.foreground },
                  ]}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              minHeight: 100,
            },
          ]}
          multiline
          textAlignVertical="top"
          placeholder="What happened on site today?"
          placeholderTextColor={colors.mutedForeground}
          value={notes}
          onChangeText={(text) => setNotes(text.slice(0, NOTES_MAX))}
          maxLength={NOTES_MAX}
        />
        <Text
          style={[
            styles.charCounter,
            {
              color:
                notes.length >= NOTES_MAX
                  ? "#EF4444"
                  : notes.length >= NOTES_MAX * 0.8
                    ? "#F59E0B"
                    : colors.mutedForeground,
            },
          ]}
        >
          {notes.length}/{NOTES_MAX}
        </Text>

        {/* Weather */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Weather</Text>
        <View style={styles.row}>
          <TextInput
            style={[
              styles.input,
              styles.halfInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            placeholder="Temp (e.g. 22°C)"
            placeholderTextColor={colors.mutedForeground}
            value={weatherTemp}
            onChangeText={setWeatherTemp}
          />
          <TextInput
            style={[
              styles.input,
              styles.halfInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
            placeholder="Condition (e.g. Sunny)"
            placeholderTextColor={colors.mutedForeground}
            value={weatherCondition}
            onChangeText={setWeatherCondition}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={!projectId || createLog.isPending || notes.length >= NOTES_MAX}
          style={[
            styles.submitBtn,
            {
              backgroundColor: !projectId || createLog.isPending || notes.length >= NOTES_MAX ? "#ccc" : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>
            {createLog.isPending ? "Saving..." : "Save Daily Log"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  charCounter: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 4,
  },
  halfInput: { flex: 1 },
  row: { flexDirection: "row", gap: 10 },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
