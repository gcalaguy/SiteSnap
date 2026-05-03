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
  useApproveQuote,
  useRejectQuote,
  useConvertQuoteToInvoice,
  customFetch,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };
type AIResult = { title?: string; lineItems?: LineItem[]; notes?: string; clientName?: string };

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Invoiced",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  pending_approval: "#D97706",
  approved: "#16A34A",
  rejected: "#DC2626",
  converted: "#2563EB",
};
const STATUS_BG: Record<string, string> = {
  draft: "#F3F4F6",
  pending_approval: "#FEF3C7",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  converted: "#DBEAFE",
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
  const approveQuote = useApproveQuote();
  const rejectQuote = useRejectQuote();
  const convertQuote = useConvertQuoteToInvoice();

  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const { state: voiceState, toggle: toggleVoice } = useVoiceRecorder((text) => {
    setDescription((prev) => (prev ? `${prev} ${text}` : text));
  });
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

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
    try {
      const data = await customFetch<AIResult>("/api/ai/quote/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceInput: description, clientName: clientName || undefined }),
      });
      setAiResult(data);
      setStep("preview");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("AI generation failed", "Please try again.");
    } finally {
      setAiLoading(false);
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
      await createQuote.mutateAsync({
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
    } catch {
      Alert.alert("Failed to create quote", "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [aiResult, clientName, projectId, createQuote]);

  async function handleSubmit(q: { id: number }) {
    setActionLoading((p) => ({ ...p, [q.id]: "submit" }));
    try {
      await submitQuote.mutateAsync({ projectId, quoteId: q.id });
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Failed to submit for approval");
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
    }
  }

  async function handleApprove(q: { id: number }) {
    Alert.alert("Approve Quote?", "This quote will be marked as approved and ready for invoicing.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve", style: "default",
        onPress: async () => {
          setActionLoading((p) => ({ ...p, [q.id]: "approve" }));
          try {
            await approveQuote.mutateAsync({ projectId, quoteId: q.id });
            invalidate();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("Failed to approve");
          } finally {
            setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
          }
        },
      },
    ]);
  }

  async function handleReject(q: { id: number }) {
    Alert.alert("Reject Quote?", "The quote will be sent back to draft.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive",
        onPress: async () => {
          setActionLoading((p) => ({ ...p, [q.id]: "reject" }));
          try {
            await rejectQuote.mutateAsync({ projectId, quoteId: q.id, data: {} });
            invalidate();
          } catch {
            Alert.alert("Failed to reject");
          } finally {
            setActionLoading((p) => { const n = { ...p }; delete n[q.id]; return n; });
          }
        },
      },
    ]);
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
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable onPress={() => router.push(`/quote/${q.id}`)}>
                  <View style={styles.cardTop}>
                    <View style={[styles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
                      <Feather name="file-text" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{q.title}</Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{q.quoteNumber} · {q.clientName}</Text>
                    </View>
                    <View>
                      <Text style={[styles.cardAmount, { color: colors.foreground }]}>{fmtCAD(q.total)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[q.status] }]}>
                        <Text style={[styles.statusText, { color: STATUS_COLORS[q.status] }]}>{STATUS_LABELS[q.status]}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>

                {/* Approval workflow actions */}
                <View style={[styles.actions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity onPress={() => router.push(`/quote/${q.id}`)} style={styles.editBtn}>
                    <Text style={[styles.editBtnText, { color: colors.mutedForeground }]}>Edit / View</Text>
                    <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  <View style={{ flex: 1 }} />

                  {q.status === "draft" && (
                    <TouchableOpacity
                      onPress={() => handleSubmit(q)}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: "#FEF3C7", borderColor: "#D97706" }]}
                    >
                      {busy === "submit" ? (
                        <ActivityIndicator size="small" color="#D97706" />
                      ) : (
                        <Feather name="send" size={12} color="#D97706" />
                      )}
                      <Text style={[styles.actionBtnText, { color: "#D97706" }]}>Submit</Text>
                    </TouchableOpacity>
                  )}

                  {q.status === "rejected" && (
                    <TouchableOpacity
                      onPress={() => handleSubmit(q)}
                      disabled={!!busy}
                      style={[styles.actionBtn, { backgroundColor: "#FEF3C7", borderColor: "#D97706" }]}
                    >
                      {busy === "submit" ? (
                        <ActivityIndicator size="small" color="#D97706" />
                      ) : (
                        <Feather name="send" size={12} color="#D97706" />
                      )}
                      <Text style={[styles.actionBtnText, { color: "#D97706" }]}>Re-submit</Text>
                    </TouchableOpacity>
                  )}

                  {q.status === "pending_approval" && (
                    <>
                      <TouchableOpacity
                        onPress={() => handleReject(q)}
                        disabled={!!busy}
                        style={[styles.actionBtn, { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]}
                      >
                        <Feather name="x-circle" size={12} color="#DC2626" />
                        <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleApprove(q)}
                        disabled={!!busy}
                        style={[styles.actionBtn, { backgroundColor: "#DCFCE7", borderColor: "#16A34A" }]}
                      >
                        {busy === "approve" ? (
                          <ActivityIndicator size="small" color="#16A34A" />
                        ) : (
                          <Feather name="check-circle" size={12} color="#16A34A" />
                        )}
                        <Text style={[styles.actionBtnText, { color: "#16A34A" }]}>Approve</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {q.status === "approved" && (
                    <TouchableOpacity
                      onPress={() => handleConvert(q)}
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

                  {q.status === "converted" && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="check-circle" size={12} color="#2563EB" />
                      <Text style={{ fontSize: 11, color: "#2563EB", fontFamily: "Inter_600SemiBold" }}>Invoice created</Text>
                    </View>
                  )}
                </View>
              </View>
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
                    {isTranscribing ? "Transcribing…" : isRecording ? "Tap to stop" : "Tap to record voice"}
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
                    {aiLoading ? "AI generating…" : "Generate with AI"}
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
                  {/* Header */}
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
                  {/* Totals */}
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

                <Text style={[styles.aiNote, { color: colors.mutedForeground }]}>
                  ✦ AI-suggested pricing — you can edit line items after creating the quote
                </Text>

                <View style={styles.previewActions}>
                  <TouchableOpacity
                    onPress={() => setStep("input")}
                    style={[styles.backBtn, { borderColor: colors.border }]}
                  >
                    <Feather name="arrow-left" size={16} color={colors.foreground} />
                    <Text style={[styles.backBtnText, { color: colors.foreground }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={saving}
                    style={[styles.createBtn, { backgroundColor: colors.primary, flex: 1 }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Feather name="plus" size={18} color="#FFFFFF" />
                    )}
                    <Text style={styles.createBtnText}>{saving ? "Creating…" : "Create Quote"}</Text>
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
  container: { flex: 1, position: "relative", minHeight: 200 },
  emptyContainer: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  card: { marginHorizontal: 20, marginBottom: 12, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 2 },
  cardSub: { fontSize: 12 },
  cardAmount: { fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "right", marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: "flex-end" },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  editBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalContent: { padding: 20, paddingBottom: 40 },
  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 6 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepNum: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },
  stepLine: { width: 32, height: 2, marginHorizontal: 4 },
  stepsLabel: { textAlign: "center", fontSize: 12, marginBottom: 20 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 16 },
  textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 90, marginBottom: 20, textAlignVertical: "top" },
  voiceBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 2, marginBottom: 16 },
  voiceCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  voiceBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  generateBtnText: { fontFamily: "Inter_700Bold", fontSize: 16 },
  previewTitle: { fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 4 },
  previewClient: { fontSize: 14, marginBottom: 4 },
  table: { borderWidth: 1, borderRadius: 10, overflow: "hidden", marginBottom: 10 },
  tableRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 10, paddingVertical: 8 },
  tableHeader: { paddingVertical: 6 },
  cellDesc: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  cellNum: { width: 70, fontSize: 12, textAlign: "right", fontFamily: "Inter_400Regular" },
  cellNumWide: { flex: 1, fontSize: 12, textAlign: "right" },
  aiNote: { fontSize: 11, marginTop: 4, marginBottom: 20, textAlign: "center" },
  previewActions: { flexDirection: "row", gap: 10 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  backBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  createBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
});
