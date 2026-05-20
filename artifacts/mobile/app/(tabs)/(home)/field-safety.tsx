import {
  useListProjects,
  useCreateSafetySignoff,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

const QUESTIONS = [
  "Did you inspect all PPE before starting work?",
  "Are all tools and equipment in safe working condition?",
  "Is the work area free of hazards and clearly marked?",
];

export default function FieldSafetyScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, "yes" | "no">>({});
  const [signed, setSigned] = useState(false);

  const createSignoff = useCreateSafetySignoff({
    mutation: {
      onSuccess: () => router.back(),
    },
  });

  function toggleAnswer(index: number, value: "yes" | "no") {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  }

  function submit() {
    if (!projectId) return;
    const responses: Record<string, string> = {};
    QUESTIONS.forEach((q, i) => {
      responses[q] = answers[i] ?? "no";
    });
    createSignoff.mutate({
      data: {
        projectId,
        responses,
        signatureUrl: signed ? "signed://digital" : null,
      },
    });
  }

  const allAnswered = QUESTIONS.every((_, i) => answers[i] !== undefined);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Morning Gatekeeper</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Answer all safety questions and sign before starting work.
        </Text>

        {/* Project selector */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Project</Text>
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: projectId === p.id ? colors.primary : colors.card,
                  borderColor: projectId === p.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: projectId === p.id ? "#fff" : colors.foreground }]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Questions */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Safety Checklist</Text>
        {QUESTIONS.map((q, i) => (
          <View key={i} style={[styles.questionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.questionText, { color: colors.foreground }]}>{q}</Text>
            <View style={styles.answerRow}>
              <TouchableOpacity
                onPress={() => toggleAnswer(i, "yes")}
                style={[
                  styles.answerBtn,
                  {
                    backgroundColor: answers[i] === "yes" ? "#22C55E" : "#eee",
                  },
                ]}
              >
                <Text style={[styles.answerText, { color: answers[i] === "yes" ? "#fff" : "#555" }]}>
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => toggleAnswer(i, "no")}
                style={[
                  styles.answerBtn,
                  {
                    backgroundColor: answers[i] === "no" ? "#EF4444" : "#eee",
                  },
                ]}
              >
                <Text style={[styles.answerText, { color: answers[i] === "no" ? "#fff" : "#555" }]}>
                  No
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Signature */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Digital Signature</Text>
        <TouchableOpacity
          onPress={() => setSigned(!signed)}
          style={[
            styles.signatureBox,
            {
              borderColor: signed ? "#22C55E" : colors.border,
              backgroundColor: signed ? "#22C55E10" : colors.card,
            },
          ]}
        >
          {signed ? (
            <View style={styles.signedRow}>
              <Feather name="check-circle" size={24} color="#22C55E" />
              <Text style={[styles.signedText, { color: "#22C55E" }]}>Signed — Worker confirmed</Text>
            </View>
          ) : (
            <View style={styles.signedRow}>
              <Feather name="edit-3" size={24} color={colors.mutedForeground} />
              <Text style={[styles.signedText, { color: colors.mutedForeground }]}>
                Tap to confirm your digital signature
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={submit}
          disabled={!projectId || !allAnswered || !signed || createSignoff.isPending}
          style={[
            styles.submitBtn,
            {
              backgroundColor:
                !projectId || !allAnswered || !signed || createSignoff.isPending
                  ? "#ccc"
                  : colors.primary,
            },
          ]}
        >
          <Text style={styles.submitText}>
            {createSignoff.isPending ? "Submitting..." : "Complete Safety Check"}
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
  questionCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  questionText: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 10 },
  answerRow: { flexDirection: "row", gap: 10 },
  answerBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  answerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  signatureBox: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, padding: 20, alignItems: "center" },
  signedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  signedText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
