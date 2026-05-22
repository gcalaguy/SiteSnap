import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useListQuotes,
  useCreateQuote,
  useSubmitQuoteForApproval,
  useUnsubmitQuote,
  useConvertQuoteToInvoice,
  customFetch,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { getAiErrorMessage } from "@/src/utils/aiError";
import { withAiRetry } from "@/src/utils/aiRetry";

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };
type AIResult = { title?: string; lineItems?: LineItem[]; notes?: string; clientName?: string };

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  rejected: "Needs Revision",
  converted: "Invoiced",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  pending_approval: "#2563EB",
  approved: "#16A34A",
  rejected: "#EA580C",
  converted: "#7C3AED",
};
const STATUS_BG: Record<string, string> = {
  draft: "#F3F4F6",
  pending_approval: "#DBEAFE",
  approved: "#DCFCE7",
  rejected: "#FFF7ED",
  converted: "#EDE9FE",
};

function fmtCAD(v: number | string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

export function QuotesTab({ projectId }: { projectId: number }) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: quotes, isLoading, refetch } = useListQuotes(projectId);

  const createQuote = useCreateQuote();
  const submitQuote = useSubmitQuoteForApproval();
  const unsubmitQuote = useUnsubmitQuote();
  const convertQuote = useConvertQuoteToInvoice();

  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRetrying, setAiRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const { state: voiceState, toggle: toggleVoice } = useVoiceRecorder((text) => {
    setDescription((prev) => (prev ? `${prev} ${text}` : text));
  });
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";
  const isVoiceRetrying = voiceState === "retrying";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(projectId) });
    refetch();
  }

  function openModal() {
    setShowModal(true);
    setStep("input");
    setClientName("");
    setDescription("");
    setAiResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) {
      Alert.alert("Describe the job first", "Type or record your voice to describe the work needed.");
      return;
    }
    setAiLoading(true);
    setAiRetrying(false);
    try {
      const data = await withAiRetry(
        () =>
          customFetch<AIResult>("/api/ai/quote/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voiceInput: description, clientName: clientName || undefined }),
          }),
        () => setAiRetrying(true),
      );
      setAiResult(data);
      setStep("preview");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("AI generation failed", getAiErrorMessage(err));
    } finally {
      setAiLoading(false);
      setAiRetrying(false);
    }
  }, [description, clientName]);

  const handleCreate = useCallback(async () => {
    if (!aiResult) return;
    setSaving(true);
    try {
      const items = (aiResult.lineItems ?? []) as LineItem[];
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;
      const total = subtotal + taxAmount;
      const created = await createQuote.mutateAsync({
        projectId,
        data: {
          title: aiResult.title ?? "New Quote",
          clientName: clientName || aiResult.clientName || "Client",
          lineItems: items,
          subtotal,
          taxRate: 0.13,
          taxAmount,
          total,
        },
      });
      invalidate();
      setShowModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Navigate directly to the new quote so user can view/edit it
      setTimeout(() => router.push(`/quote/${created.id}?projectId=${projectId}`), 300);
    } catch {
      Alert.alert("Failed to create quote", "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [aiResult, clientName, projectId, createQuote]);

  async function handleSubmit(q: { id: number }) {
    Alert.alert(
      "Submit Quote?",
      "The foreman and owner will be notified by email to review this quote.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [q.id]: "submit" }));
            try {
              await submitQuote.mutateAsync({ projectId, quoteId: q.id });
              invalidate();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Quote Submitted", "The foreman and owner have been notified.");
            } catch {
              Alert.alert("Failed to submit", "Please try again.");
            } finally {
              setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
            }
          },
        },
      ]
    );
  }

  async function handleUnsubmit(q: { id: number }) {
    Alert.alert(
      "Unsubmit Quote?",
      "This will move the quote back to Draft so you can make changes before resubmitting.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unsubmit",
          style: "destructive",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [q.id]: "unsubmit" }));
            try {
              await unsubmitQuote.mutateAsync({ projectId, quoteId: q.id });
              invalidate();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert("Failed to unsubmit", "Please try again.");
            } finally {
              setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
            }
          },
        },
      ]
    );
  }

  async function handleConvert(q: { id: number }) {
    Alert.alert("Convert to Invoice?", "This will create an invoice from the approved quote.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Create Invoice", style: "default",
        onPress: async () => {
          setActionLoading((p) => ({ ...p, [q.id]: "convert" }));
          try {
            const inv = await convertQuote.mutateAsync({ projectId, quoteId: q.id, data: {} });
            invalidate();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.push(`/invoice/${inv.id}`);
          } catch {
            Alert.alert("Failed to convert to invoice");
          } finally {
            setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
          }
        },
      },
    ]);
  }

  const aiItems = (aiResult?.lineItems ?? []) as LineItem[];
  const aiSubtotal = aiItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const aiTax = Math.round(aiSubtotal * 0.13 * 100) / 100;

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !quotes?.length ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="mic" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No quotes yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Tap the mic button to describe the job by voice — AI fills in materials, quantities, and Canadian pricing.
          </Text>
          <TouchableOpacity onPress={openModal} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
            <Feather name="mic" size={16} color="#FFFFFF" />
            <Text style={styles.emptyBtnText}>Create First Quote by Voice</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={quotes}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item: q }) => {
            const busy = actionLoading[q.id];
            return (
              <Pressable
                onPress={() => router.push(`/quote/${q.id}?projectId=${projectId}`)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {/* Top row */}
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
                    <Feather name="file-text" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{q.title}</Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{q.quoteNumber} · {q.clientName}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.cardAmount, { color: colors.foreground }]}>{fmtCAD(q.total)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[q.status] }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[q.status] }]}>{STATUS_LABELS[q.status]}</Text>
                    </View>
                  </View>
                </View>

                {/* Actions row */}
                <View style={[styles.actions, { borderTopColor: colors.border }]}>
                  {/* View / Edit — always shown */}
                  <View style={[styles.viewBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="eye" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.viewBtnText, { color: colors.mutedForeground }]}>View / Edit</Text>
                    <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
                  </View>

                  <View style={{ flex: 1 }} />

                  {/* Draft: Submit */}
                  {q.status === "draft" && (
                    <TouchableOpacity
                      onPress={() => handleSubmit(q)}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` }]}
                    >
                      {busy === "submit" ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Feather name="send" size={12} color={colors.primary} />
                      )}
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Submit</Text>
                    </TouchableOpacity>
                  )}

                  {/* Needs Revision: Re-submit */}
                  {q.status === "rejected" && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); handleSubmit(q); }}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" }]}
                    >
                      {busy === "submit" ? (
                        <ActivityIndicator size="small" color="#EA580C" />
                      ) : (
                        <Feather name="send" size={12} color="#EA580C" />
                      )}
                      <Text style={[styles.actionBtnText, { color: "#EA580C" }]}>Re-submit</Text>
                    </TouchableOpacity>
                  )}

                  {/* Submitted: Unsubmit */}
                  {q.status === "pending_approval" && (
                    <TouchableOpacity
                      onPress={() => handleUnsubmit(q)}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}
                    >
                      {busy === "unsubmit" ? (
                        <ActivityIndicator size="small" color="#2563EB" />
                      ) : (
                        <Feather name="rotate-ccw" size={12} color="#2563EB" />
                      )}
                      <Text style={[styles.actionBtnText, { color: "#2563EB" }]}>Unsubmit</Text>
                    </TouchableOpacity>
                  )}

                  {/* Approved: Convert to Invoice */}
                  {q.status === "approved" && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); handleConvert(q); }}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    >
                      {busy === "convert" ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Feather name="file-text" size={12} color="#FFFFFF" />
                      )}
                      <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>Convert to Invoice</Text>
                    </TouchableOpacity>
                  )}

                  {/* Converted */}
                  {q.status === "converted" && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="check-circle" size={12} color="#7C3AED" />
                      <Text style={{ fontSize: 11, color: "#7C3AED", fontFamily: "Inter_600SemiBold" }}>Invoiced</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Voice FAB */}
      <TouchableOpacity
        onPress={openModal}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
      >
        <Feather name="mic" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Creation Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {step === "input" ? "New Voice Quote" : "AI Quote Preview"}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {step === "input" ? (
              <>
                {/* Steps */}
                <View style={styles.steps}>
                  <View style={[styles.stepDot, { backgroundColor: colors.primary }]}><Text style={styles.stepNum}>1</Text></View>
                  <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                  <View style={[styles.stepDot, { backgroundColor: colors.muted }]}><Text style={[styles.stepNum, { color: colors.mutedForeground }]}>2</Text></View>
                  <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                  <View style={[styles.stepDot, { backgroundColor: colors.muted }]}><Text style={[styles.stepNum, { color: colors.mutedForeground }]}>3</Text></View>
                </View>
                <Text style={[styles.stepsLabel, { color: colors.mutedForeground }]}>Describe job → AI fills pricing → Create</Text>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Client Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Smith Residence"
                  placeholderTextColor={colors.mutedForeground}
                  value={clientName}
                  onChangeText={setClientName}
                />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Job Description</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Install 200 sq ft hardwood in master bedroom, supply and install baseboards, patch two walls…"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                />

                {/* Voice button */}
                <TouchableOpacity
                  onPress={() => toggleVoice()}
                  style={[
                    styles.voiceBtn,
                    isRecording
                      ? { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }
                      : { backgroundColor: `${colors.primary}12`, borderColor: colors.primary },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.voiceCircle, { backgroundColor: isRecording ? "#DC2626" : colors.primary }]}>
                    <Feather name={isRecording ? "mic-off" : "mic"} size={24} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.voiceBtnText, { color: isRecording ? "#DC2626" : colors.primary }]}>
                    {isVoiceRetrying ? "Retrying…" : isTranscribing ? "Transcribing…" : isRecording ? "Tap to stop" : "Tap to record voice"}
                  </Text>
                  {isRecording && <View style={[styles.recordingDot, { backgroundColor: "#DC2626" }]} />}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleGenerate}
                  disabled={aiLoading || !description.trim()}
                  style={[styles.generateBtn, { backgroundColor: description.trim() && !aiLoading ? colors.primary : colors.muted }]}
                >
                  {aiLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Feather name="zap" size={18} color={description.trim() ? "#FFFFFF" : colors.mutedForeground} />
                  )}
                  <Text style={[styles.generateBtnText, { color: description.trim() && !aiLoading ? "#FFFFFF" : colors.mutedForeground }]}>
                    {aiRetrying ? "Retrying…" : aiLoading ? "AI generating…" : "Generate with AI"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Steps */}
                <View style={styles.steps}>
                  <View style={[styles.stepDot, { backgroundColor: "#16A34A" }]}><Feather name="check" size={12} color="#FFFFFF" /></View>
                  <View style={[styles.stepLine, { backgroundColor: colors.primary }]} />
                  <View style={[styles.stepDot, { backgroundColor: colors.primary }]}><Text style={styles.stepNum}>2</Text></View>
                  <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                  <View style={[styles.stepDot, { backgroundColor: colors.muted }]}><Text style={[styles.stepNum, { color: colors.mutedForeground }]}>3</Text></View>
                </View>
                <Text style={[styles.stepsLabel, { color: colors.mutedForeground }]}>Job described → Review pricing → Create</Text>

                <Text style={[styles.previewTitle, { color: colors.foreground }]}>{aiResult?.title}</Text>
                <Text style={[styles.previewClient, { color: colors.mutedForeground }]}>Client: {clientName || "—"}</Text>

                <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 16 }]}>AI-Generated Line Items</Text>

                <View style={[styles.table, { borderColor: colors.border }]}>
                  <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.cellDesc, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Item</Text>
                    <Text style={[styles.cellNum, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Qty</Text>
                    <Text style={[styles.cellNum, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Price</Text>
                    <Text style={[styles.cellNum, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Total</Text>
                  </View>
                  {aiItems.map((item, i) => (
                    <View key={i} style={[styles.tableRow, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.cellDesc, { color: colors.foreground }]} numberOfLines={2}>{item.description}</Text>
                      <Text style={[styles.cellNum, { color: colors.foreground }]}>{item.quantity} {item.unit}</Text>
                      <Text style={[styles.cellNum, { color: colors.foreground }]}>{fmtCAD(item.unitPrice)}</Text>
                      <Text style={[styles.cellNum, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{fmtCAD(item.total)}</Text>
                    </View>
                  ))}
                  <View style={[styles.tableRow, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                    <Text style={[styles.cellDesc, { color: colors.mutedForeground }]}>Subtotal</Text>
                    <Text style={[styles.cellNumWide, { color: colors.foreground }]}>{fmtCAD(aiSubtotal)}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.cellDesc, { color: colors.mutedForeground }]}>HST (13%)</Text>
                    <Text style={[styles.cellNumWide, { color: colors.foreground }]}>{fmtCAD(aiTax)}</Text>
                  </View>
                  <View style={[styles.tableRow, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                    <Text style={[styles.cellDesc, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Total CAD</Text>
                    <Text style={[styles.cellNumWide, { color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 15 }]}>{fmtCAD(aiSubtotal + aiTax)}</Text>
                  </View>
                </View>

                {aiResult?.notes && (
                  <View style={[styles.notesBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Text style={[styles.notesLabel, { color: colors.mutedForeground }]}>Notes</Text>
                    <Text style={[styles.notesText, { color: colors.foreground }]}>{aiResult.notes}</Text>
                  </View>
                )}

                <View style={styles.previewBtns}>
                  <TouchableOpacity
                    onPress={() => setStep("input")}
                    style={[styles.backBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  >
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={[styles.backBtnText, { color: colors.foreground }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={saving}
                    style={[styles.createBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Feather name="plus" size={18} color="#FFFFFF" />
                    )}
                    <Text style={[styles.createBtnText, { color: saving ? colors.mutedForeground : "#FFFFFF" }]}>
                      {saving ? "Creating…" : "Create Quote"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
  emptyContainer: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 14, borderWidth: 1, marginHorizontal: 20, marginBottom: 12, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardAmount: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 3, alignSelf: "flex-end" },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  viewBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 24, gap: 4 },
  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 6 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  stepLine: { width: 32, height: 2 },
  stepsLabel: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 100, textAlignVertical: "top" },
  voiceBtn: { borderWidth: 1.5, borderRadius: 14, padding: 20, alignItems: "center", gap: 10, marginTop: 8, marginBottom: 8 },
  voiceCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  voiceBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, paddingVertical: 15, marginTop: 8 },
  generateBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  previewTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  previewClient: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  table: { borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  tableHeader: { paddingVertical: 8 },
  cellDesc: { flex: 2, fontSize: 13, fontFamily: "Inter_400Regular" },
  cellNum: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right" },
  cellNumWide: { flex: 3, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  notesBox: { borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 16 },
  notesLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  notesText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  previewBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1 },
  backBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  createBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  createBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
