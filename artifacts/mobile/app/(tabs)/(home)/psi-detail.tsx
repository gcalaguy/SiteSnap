import { customFetch, useGetMe, useListProjectMembers } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { withAiRetry } from "@/src/utils/aiRetry";
import { getAiErrorMessage } from "@/src/utils/aiError";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { safeNavigate } from "@/utils/safeNavigate";
import { resolveClockInGate } from "@/utils/clockGateBus";
import {
  PSI_HAZARD_CATEGORIES,
  PSI_HAZARD_CATEGORY_KEYS,
  type PsiChecklistDetail,
} from "@/constants/psi";

type SignTarget = { type: "worker"; targetUserId?: number } | { type: "approval" };

async function uploadSignatureSvg(svg: string): Promise<string | null> {
  try {
    const tmpFile = `${FileSystem.cacheDirectory}psi_sig_${Date.now()}.svg`;
    await FileSystem.writeAsStringAsync(tmpFile, svg, { encoding: FileSystem.EncodingType.UTF8 });
    const formData = new FormData();
    formData.append("file", { uri: tmpFile, name: `signature-${Date.now()}.svg`, type: "image/svg+xml" } as unknown as Blob);
    const { objectPath } = await customFetch<{ objectPath: string }>("/api/storage/uploads/file", { method: "POST", body: formData });
    await FileSystem.deleteAsync(tmpFile, { idempotent: true }).catch(() => {});
    return objectPath;
  } catch {
    return null;
  }
}

export default function PsiDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const psiId = parseInt(id ?? "");
  const { data: me } = useGetMe();

  const detailQuery = useQuery<PsiChecklistDetail>({
    queryKey: ["psi-checklist", psiId],
    queryFn: () => customFetch(`/api/psi/${psiId}`),
    enabled: !isNaN(psiId),
  });

  const isAdmin = me?.role === "owner" || me?.role === "foreman";
  const projectId = detailQuery.data?.psi.projectId;
  const { data: projectMembers = [] } = useListProjectMembers(projectId ?? 0, {
    query: { enabled: !!projectId && isAdmin } as any,
  });

  const [signTarget, setSignTarget] = useState<SignTarget | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["psi-checklist", psiId] });
    queryClient.invalidateQueries({ queryKey: ["psi-checklists"] });
  }

  const signMutation = useMutation({
    mutationFn: ({ signatureUrl, targetUserId }: { signatureUrl: string; targetUserId?: number }) =>
      customFetch(`/api/psi/${psiId}/signature`, { method: "POST", body: JSON.stringify({ signatureUrl, targetUserId }) }),
    onSuccess: (_data, variables) => {
      invalidate();
      setSignTarget(null);
      const signedForSelf = !variables.targetUserId || variables.targetUserId === me?.id;
      if (returnTo === "clock-in" && signedForSelf && detailQuery.data) {
        resolveClockInGate(detailQuery.data.psi.projectId);
        safeNavigate(router, "/(tabs)/(home)", "psi-detail:clock-in-gate");
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: (signatureUrl?: string) =>
      customFetch(`/api/psi/${psiId}/approvals`, { method: "POST", body: JSON.stringify({ signatureUrl }) }),
    onSuccess: () => { invalidate(); setSignTarget(null); },
  });

  const addVoiceNoteMutation = useMutation({
    mutationFn: (transcript: string) =>
      customFetch(`/api/psi/${psiId}/voice-notes`, { method: "POST", body: JSON.stringify({ transcript }) }),
    onSuccess: invalidate,
  });

  const deleteVoiceNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      customFetch(`/api/psi/${psiId}/voice-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  async function confirmSignature() {
    if (!signTarget) return;
    if (!padRef.current?.hasSignature) {
      Alert.alert("Signature required", "Please draw your signature before confirming.");
      return;
    }
    setUploading(true);
    const svg = padRef.current.getSvg();
    const objectPath = await uploadSignatureSvg(svg);
    setUploading(false);
    if (!objectPath) {
      Alert.alert("Upload failed", "Could not save your signature. Please check your connection and try again.");
      return;
    }
    if (signTarget.type === "worker") {
      signMutation.mutate(
        { signatureUrl: objectPath, targetUserId: signTarget.targetUserId },
        { onError: () => Alert.alert("Sign-off failed", "Could not save your signature. Please try again.") },
      );
    } else {
      approveMutation.mutate(objectPath, {
        onError: () => Alert.alert("Approval failed", "Could not save your approval. Please try again."),
      });
    }
  }

  async function stopRecordingAndTranscribe() {
    setIsRecording(false);
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      const result = await withAiRetry(() =>
        customFetch<{ text: string }>("/api/ai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, format: "m4a" }),
        }),
      );

      if (result.text?.trim()) {
        addVoiceNoteMutation.mutate(result.text.trim());
      }
    } catch (err) {
      setTranscribeError(getAiErrorMessage(err, "Transcription failed. Please try again."));
    } finally {
      setIsTranscribing(false);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: false });
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }
    setTranscribeError(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone Access Required",
          "Site Snap needs microphone access to record voice notes. Please enable it in Settings.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      setTranscribeError("Could not start recording. Please try again.");
    }
  }

  function deleteVoiceNote(noteId: string) {
    deleteVoiceNoteMutation.mutate(noteId);
  }

  const s = styles(colors);

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { psi, project, creator, signatures, approvals } = detailQuery.data;
  const alreadySigned = me ? signatures.some((sig) => sig.userId === me.id) : false;
  const alreadyApproved = me ? approvals.some((a) => a.userId === me.id) : false;
  const unsignedMembers = projectMembers.filter((m) => !signatures.some((sig) => sig.userId === m.id));

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[s.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <View style={[s.statusBadge, { backgroundColor: psi.status === "draft" ? colors.draft : colors.success }]}>
            <Text style={s.statusBadgeText}>{psi.status === "draft" ? "Draft" : "Submitted"}</Text>
          </View>
          <Text style={[s.dateText, { color: colors.mutedForeground }]}>{psi.date}</Text>
        </View>
        <Text style={[s.title, { color: colors.foreground }]}>{project?.name ?? "PSI Checklist"}</Text>
        {psi.tradeDescription ? <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{psi.tradeDescription}</Text> : null}

        {psi.status === "draft" && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/(tabs)/(home)/psi-checklist", params: { id: String(psi.id) } })}
            style={[s.secondaryBtn, { borderColor: colors.border, marginTop: 12 }]}
          >
            <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Edit Draft</Text>
          </TouchableOpacity>
        )}

        <View style={[s.infoGrid, { borderColor: colors.border }]}>
          <View style={s.infoItem}>
            <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Created by</Text>
            <Text style={[s.infoValue, { color: colors.foreground }]}>{creator ? `${creator.firstName} ${creator.lastName}` : "Unknown"}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Weather</Text>
            <Text style={[s.infoValue, { color: colors.foreground }]}>{psi.weatherTemp || "—"}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Location</Text>
            <Text style={[s.infoValue, { color: colors.foreground }]}>{psi.location || "—"}</Text>
          </View>
        </View>

        {PSI_HAZARD_CATEGORY_KEYS.map((key) => {
          const category = PSI_HAZARD_CATEGORIES[key];
          const value = psi.hazards[key];
          const otherEntries = [value?.otherText, value?.other2Text, value?.other3Text].filter(Boolean) as string[];
          if (!value?.checked?.length && !otherEntries.length) return null;
          return (
            <View key={key} style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>{category.title}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {[...value.checked, ...otherEntries].map((item) => (
                  <View key={item} style={[s.pill, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Feather name="check" size={11} color={colors.primary} />
                    <Text style={[s.pillText, { color: colors.foreground }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {psi.taskRows.length > 0 && (
          <View style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Task / Hazard / Control</Text>
            {psi.taskRows.map((row) => (
              <View key={row.id} style={{ marginTop: 10 }}>
                <Text style={[s.infoValue, { color: colors.foreground }]}>{row.task || "—"}</Text>
                <Text style={[s.infoLabel, { color: colors.mutedForeground, marginTop: 2 }]}>Hazard: {row.hazard || "—"}</Text>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>Control: {row.control || "—"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Voice Notes */}
        <View style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Voice Notes</Text>
          <Text style={[s.sectionSubtitle, { color: colors.mutedForeground }]}>
            Record verbal notes or observations — they will be transcribed and saved to this PSI.
          </Text>

          <TouchableOpacity
            onPress={toggleRecording}
            disabled={isTranscribing}
            style={[
              s.recordBtn,
              { backgroundColor: isRecording ? "#EF4444" : colors.primary, opacity: isTranscribing ? 0.6 : 1 },
            ]}
          >
            {isTranscribing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name={isRecording ? "square" : "mic"} size={16} color="#fff" />
                <Text style={s.recordBtnText}>{isRecording ? "Stop Recording" : "Record Voice Note"}</Text>
              </>
            )}
          </TouchableOpacity>
          {transcribeError && <Text style={[s.errorText]}>{transcribeError}</Text>}

          {psi.voiceNotes.length === 0 ? (
            <Text style={[s.infoLabel, { color: colors.mutedForeground, marginTop: 10 }]}>No voice notes recorded yet.</Text>
          ) : (
            psi.voiceNotes.map((note) => (
              <View key={note.id} style={[s.voiceNoteRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoValue, { color: colors.foreground }]}>{note.transcript}</Text>
                  <Text style={[s.infoLabel, { color: colors.mutedForeground, marginTop: 4 }]}>
                    {new Date(note.recordedAt).toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteVoiceNote(note.id)}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Worker Sign-Off */}
        <View style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Worker Sign-Off ({signatures.length})</Text>
          </View>
          <Text style={[s.sectionSubtitle, { color: colors.mutedForeground }]}>
            All workers must sign below. Do not sign until you understand and agree with this PSI.
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {!alreadySigned && (
              <TouchableOpacity onPress={() => setSignTarget({ type: "worker" })} style={[s.signBtn, { backgroundColor: colors.primary }]}>
                <Text style={s.signBtnText}>Sign</Text>
              </TouchableOpacity>
            )}
            {isAdmin && unsignedMembers.length > 0 && (
              <TouchableOpacity onPress={() => setPickerVisible(true)} style={[s.secondaryBtn, { borderColor: colors.border, marginTop: 0, flex: 1 }]}>
                <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>+ Add Worker Signature</Text>
              </TouchableOpacity>
            )}
          </View>

          {signatures.length === 0 && <Text style={[s.infoLabel, { color: colors.mutedForeground, marginTop: 8 }]}>No signatures yet.</Text>}
          {signatures.map((sig) => (
            <Text key={sig.id} style={[s.infoValue, { color: colors.foreground, marginTop: 8 }]}>
              {sig.firstName} {sig.lastName} <Text style={{ color: colors.mutedForeground, fontFamily: "NunitoSans_400Regular" }}>· {new Date(sig.signedAt).toLocaleDateString()}</Text>
            </Text>
          ))}
        </View>

        {/* Owner/Foreman Approvals */}
        <View style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Owner/Foreman Approvals ({approvals.length})</Text>
            {isAdmin && !alreadyApproved && (
              <TouchableOpacity onPress={() => setSignTarget({ type: "approval" })} style={[s.signBtn, { backgroundColor: colors.primary }]}>
                <Text style={s.signBtnText}>Approve</Text>
              </TouchableOpacity>
            )}
          </View>
          {approvals.length === 0 && <Text style={[s.infoLabel, { color: colors.mutedForeground, marginTop: 8 }]}>No approvals yet.</Text>}
          {approvals.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <View>
                <Text style={[s.infoValue, { color: colors.foreground }]}>{a.firstName} {a.lastName}</Text>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{new Date(a.approvedAt).toLocaleDateString()}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Worker roster picker (admin signing on behalf of another worker) */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>Who's signing?</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {unsignedMembers.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => { setPickerVisible(false); setSignTarget({ type: "worker", targetUserId: m.id }); }}
                  style={[s.rosterRow, { borderColor: colors.border }]}
                >
                  <Text style={[s.infoValue, { color: colors.foreground }]}>{m.firstName} {m.lastName}</Text>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerVisible(false)} style={[s.secondaryBtn, { borderColor: colors.border }]}>
              <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!signTarget} animationType="slide" transparent onRequestClose={() => setSignTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground, marginBottom: 12 }]}>
              {signTarget?.type === "approval"
                ? "Approve PSI Checklist"
                : signTarget?.targetUserId
                  ? `Sign as ${unsignedMembers.find((m) => m.id === signTarget.targetUserId)?.firstName ?? "Worker"}`
                  : "Sign PSI Checklist"}
            </Text>
            <SignaturePad ref={padRef} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setSignTarget(null)} style={[s.secondaryBtn, { borderColor: colors.border, flex: 1, marginTop: 0 }]}>
                <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSignature}
                disabled={uploading || signMutation.isPending || approveMutation.isPending}
                style={[s.submitBtn, { backgroundColor: colors.primary, flex: 1, marginTop: 0 }]}
              >
                {uploading || signMutation.isPending || approveMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.submitText}>Confirm Signature</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 16 },
    statusBadgeText: { color: "#fff", fontSize: 11, fontFamily: "NunitoSans_700Bold" },
    dateText: { fontSize: 12, fontFamily: "NunitoSans_400Regular" },
    title: { fontSize: 22, fontFamily: "NunitoSans_700Bold" },
    subtitle: { fontSize: 13, fontFamily: "NunitoSans_400Regular", marginTop: 2 },
    infoGrid: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 16, gap: 10 },
    infoItem: {},
    infoLabel: { fontSize: 11, fontFamily: "NunitoSans_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
    infoValue: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold", marginTop: 2 },
    section: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
    sectionTitle: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
    sectionSubtitle: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 4 },
    pill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 5 },
    pillText: { fontSize: 12, fontFamily: "NunitoSans_400Regular" },
    signBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
    signBtnText: { color: "#fff", fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
    secondaryBtn: { paddingVertical: 12, borderRadius: 16, alignItems: "center", borderWidth: 1, marginTop: 8 },
    secondaryBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
    submitBtn: { paddingVertical: 12, borderRadius: 16, alignItems: "center" },
    submitText: { color: "#fff", fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, padding: 20 },
    recordBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 16, marginTop: 12 },
    recordBtnText: { color: "#fff", fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
    errorText: { color: "#EF4444", fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 8 },
    voiceNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
    rosterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  });
