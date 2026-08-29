import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useGetMe,
  useListAiSkills,
  useListProjects,
  useGenerateAiSkillDraft,
  useListAiSkillRuns,
  useApproveAiSkillRun,
  useRejectAiSkillRun,
  getListAiSkillRunsQueryKey,
  type AiSkillRun,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { spacing, typography } from "@/constants/theme";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function DraftOutput({ run, textColor, mutedColor }: { run: AiSkillRun; textColor: string; mutedColor: string }) {
  if (run.outputJson) {
    return (
      <View style={{ gap: 10 }}>
        {Object.entries(run.outputJson as Record<string, unknown>).map(([key, value]) => (
          <View key={key}>
            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{key}</Text>
            {Array.isArray(value) ? (
              value.length ? (
                value.map((v, i) => (
                  <Text key={i} style={[styles.fieldValue, { color: textColor }]}>
                    • {typeof v === "string" ? v : JSON.stringify(v)}
                  </Text>
                ))
              ) : (
                <Text style={[styles.fieldValue, { color: mutedColor, fontStyle: "italic" }]}>None</Text>
              )
            ) : (
              <Text style={[styles.fieldValue, { color: textColor }]}>{String(value ?? "")}</Text>
            )}
          </View>
        ))}
      </View>
    );
  }
  return <Text style={[styles.fieldValue, { color: textColor }]}>{run.outputText}</Text>;
}

export default function AiSkillsGenerateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { skillKey } = useLocalSearchParams<{ skillKey: string }>();

  const { data: me } = useGetMe();
  const { data: skills = [] } = useListAiSkills();
  const { data: projects = [] } = useListProjects();
  const skill = skills.find((s) => s.key === skillKey);

  const isPrivileged = me?.role === "owner" || me?.role === "foreman";
  const canGenerate = isPrivileged || (me?.permissions as any)?.useAiSkills === true;

  const [projectId, setProjectId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const generate = useGenerateAiSkillDraft();
  const approve = useApproveAiSkillRun();
  const reject = useRejectAiSkillRun();

  const { data: runsResult, isLoading: runsLoading } = useListAiSkillRuns(
    { skillKey, limit: 10 },
    { query: { enabled: !!skillKey } } as any,
  );
  const runs = runsResult?.data ?? [];

  function invalidateRuns() {
    queryClient.invalidateQueries({ queryKey: getListAiSkillRunsQueryKey({ skillKey }) });
  }

  function handleGenerate() {
    if (!skillKey) return;
    if (!projectId) {
      Alert.alert("Select a project", "Choose which project this draft is for.");
      return;
    }
    if (!notes.trim()) {
      Alert.alert("Add notes", "Enter some field notes to draft from.");
      return;
    }
    generate.mutate(
      { skillKey, data: { projectId, notes: notes.trim() } },
      {
        onSuccess: () => {
          setNotes("");
          invalidateRuns();
        },
        onError: (err) => Alert.alert("Failed to generate draft", getAiErrorMessage(err)),
      },
    );
  }

  function handleApprove(id: number) {
    approve.mutate({ id }, { onSuccess: invalidateRuns, onError: (err) => Alert.alert("Failed to approve", getAiErrorMessage(err)) });
  }

  function handleReject(id: number) {
    reject.mutate({ id, data: {} }, { onSuccess: invalidateRuns, onError: (err) => Alert.alert("Failed to reject", getAiErrorMessage(err)) });
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 8 }}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[typography.display, { color: colors.foreground }]}>{skill?.name ?? skillKey}</Text>
        {!!skill?.description && (
          <Text style={[typography.body, { color: colors.mutedForeground, marginTop: 2 }]}>{skill.description}</Text>
        )}
      </View>

      {canGenerate && (
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Project</Text>
          <View style={styles.chipWrap}>
            {projects.map((p: any) => {
              const active = projectId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setProjectId(p.id)}
                  style={[
                    styles.chip,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : colors.background },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontFamily: "NunitoSans_500Medium", color: active ? colors.primary : colors.mutedForeground }} numberOfLines={1}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Field notes</Text>
          <TextInput
            style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={notes}
            onChangeText={(t) => setNotes(t.slice(0, 8000))}
            placeholder="Paste or type your raw field notes here…"
            placeholderTextColor={colors.mutedForeground}
            multiline
          />

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.primary, opacity: generate.isPending ? 0.7 : 1 }]}
            onPress={handleGenerate}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Feather name="zap" size={16} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>Generate draft</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECENT DRAFTS</Text>
      {runsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />
      ) : runs.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No drafts yet for this skill.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {runs.map((run) => (
            <View key={run.id} style={[styles.runCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.runHeaderRow}>
                <View style={[styles.statusBadge, { borderColor: colors.border }]}>
                  <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{STATUS_LABEL[run.status] ?? run.status}</Text>
                </View>
              </View>
              <DraftOutput run={run} textColor={colors.foreground} mutedColor={colors.mutedForeground} />
              {run.status === "pending_approval" && isPrivileged && (
                <View style={styles.approvalRow}>
                  <TouchableOpacity onPress={() => handleReject(run.id)} style={[styles.approvalBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "NunitoSans_600SemiBold" }}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleApprove(run.id)} style={[styles.approvalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontFamily: "NunitoSans_600SemiBold" }}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  formCard: { marginHorizontal: spacing.xl, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: spacing.lg },
  fieldLabel: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontSize: 13, fontFamily: "NunitoSans_400Regular", lineHeight: 18, marginTop: 2 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 100, fontSize: 14, fontFamily: "NunitoSans_400Regular", marginTop: 6, textAlignVertical: "top" },
  generateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  generateButtonText: { color: "#FFFFFF", fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  sectionLabel: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: spacing.xl, marginBottom: 8 },
  emptyText: { fontSize: 13, fontFamily: "NunitoSans_400Regular", paddingHorizontal: spacing.xl },
  runCard: { marginHorizontal: spacing.xl, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  runHeaderRow: { flexDirection: "row", justifyContent: "flex-end" },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: "NunitoSans_500Medium" },
  approvalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(128,128,128,0.2)" },
  approvalBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
});
