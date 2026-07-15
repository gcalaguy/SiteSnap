import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  Alert,
} from "react-native";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  customFetch,
  useGetMe,
  useListAllInvoices,
  useListAllQuotes,
  useListChangeOrders,
  useCreateChangeOrder,
  useApproveChangeOrder,
  useRejectChangeOrder,
  useListProjects,
  getListChangeOrdersQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import SignatureCanvas from "@/components/SignatureCanvas";
import { getAiErrorMessage } from "@/src/utils/aiError";
import EstimatorScreen from "@/app/estimator";
import { SwipeableRow } from "@/components/ui";
import { ChangeOrderCard } from "@/components/cards/ChangeOrderCard";
import { ChangeOrderFormSheet, type ChangeOrderFormValues } from "@/components/sheets/ChangeOrderFormSheet";
import type { StatusTone } from "@/components/ui/StatusPill";

const CO_STATUS_TONE: Record<string, StatusTone> = {
  pending: "pending",
  approved: "approved",
  rejected: "void",
};
const CO_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// [Estimates] | [Quotes] | [Invoices] — the consolidated pre-construction & billing lifecycle hub.
// Change Orders live as a dense secondary segment inside Invoices (progress billing/collections).
type TabKey = "estimates" | "quotes" | "invoices";
type InvoicesView = "invoices" | "change-orders";

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  sent: "#3B82F6",
  paid: "#22C55E",
  overdue: "#EF4444",
  cancelled: "#9CA3AF",
};
const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  pending_approval: "#F59E0B",
  approved: "#22C55E",
  rejected: "#EF4444",
  converted: "#3B82F6",
};
const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};
const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved", rejected: "Rejected", converted: "Converted",
};

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function InvoiceRow({ item }: { item: any }) {
  const colors = useColors();
  const router = useRouter();
  const statusColor = INVOICE_STATUS_COLORS[item.status] ?? "#6B7280";
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      onPress={() => router.push(`/invoice/${item.id}`)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.invoiceNumber} · {item.clientName}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.rowAmount, { color: colors.foreground }]}>{fmtCAD(item.total)}</Text>
        <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{INVOICE_STATUS_LABELS[item.status] ?? item.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function QuoteRow({ item }: { item: any }) {
  const colors = useColors();
  const router = useRouter();
  const statusColor = QUOTE_STATUS_COLORS[item.status] ?? "#6B7280";
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      onPress={() => router.push({ pathname: "/quote/[id]", params: { id: String(item.id), projectId: String(item.projectId ?? 0) } })}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.quoteNumber} · {item.clientName}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[styles.rowAmount, { color: colors.foreground }]}>{fmtCAD(item.total)}</Text>
        <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{QUOTE_STATUS_LABELS[item.status] ?? item.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

type AIResult = {
  title?: string;
  clientName?: string;
  lineItems?: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  notes?: string;
};

export default function FinanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  React.useEffect(() => {
    if (me && !isOwnerOrForeman) {
      router.replace("/(tabs)/(home)");
    }
  }, [me, isOwnerOrForeman]);

  const [tab, setTab] = useState<TabKey>("invoices");
  const [invoicesView, setInvoicesView] = useState<InvoicesView>("invoices");
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceFor, setVoiceFor] = useState<"invoice" | "quote">("invoice");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-tab pull-to-refresh tracking (separate from initial load)
  const [invRefreshing, setInvRefreshing] = useState(false);
  const [qRefreshing, setQRefreshing] = useState(false);

  const [sigCOId, setSigCOId] = useState<number | null>(null);

  // Create Change Order bottom sheet
  const [showCOSheet, setShowCOSheet] = useState(false);
  const [coSaving, setCoSaving] = useState(false);

  const { data: allProjects = [] } = useListProjects();
  const projectNameById = React.useMemo(
    () => new Map(allProjects.map((p) => [p.id, p.name])),
    [allProjects],
  );

  const createChangeOrder = useCreateChangeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChangeOrdersQueryKey() });
        refetchCO();
        setShowCOSheet(false);
      },
      onError: () => Alert.alert("Failed to create change order"),
      onSettled: () => setCoSaving(false),
    },
  });

  const approveChangeOrder = useApproveChangeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChangeOrdersQueryKey() });
        refetchCO();
      },
      onError: () => Alert.alert("Failed to approve change order"),
    },
  });
  const rejectChangeOrder = useRejectChangeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChangeOrdersQueryKey() });
        refetchCO();
      },
      onError: () => Alert.alert("Failed to reject change order"),
    },
  });

  function handleCreateChangeOrder(values: ChangeOrderFormValues) {
    setCoSaving(true);
    createChangeOrder.mutate({ data: values });
  }

  const createInvoice = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const createQuote = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch("/api/projects/0/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });

  const { data: invoices, isLoading: invLoading, isError: invError, error: invErrorObj, refetch: refetchInv, dataUpdatedAt: invUpdatedAt } = useListAllInvoices({});
  const { data: quotes, isLoading: qLoading, isError: qError, error: qErrorObj, refetch: refetchQ, dataUpdatedAt: qUpdatedAt } = useListAllQuotes({});
  const { data: changeOrders, isLoading: coLoading, isRefetching: coRefreshing, refetch: refetchCO, dataUpdatedAt: coDataUpdatedAt } = useListChangeOrders();

  const invRelativeTime = useRelativeTime(invUpdatedAt || null);
  const qRelativeTime = useRelativeTime(qUpdatedAt || null);
  const coRelativeTime = useRelativeTime(coDataUpdatedAt || null);

  // Debug: log quote fetch errors to help diagnose empty-list issues
  React.useEffect(() => {
    if (qError && qErrorObj) {
      console.warn("[Finance] Quotes fetch error:", qErrorObj);
    }
  }, [qError, qErrorObj]);

  const [voiceTranscript, setVoiceTranscript] = useState("");
  const { state: voiceState, toggle: toggleVoice } = useVoiceRecorder((text) => {
    setVoiceTranscript((prev) => (prev ? `${prev} ${text}` : text));
  });
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  // Pull-to-refresh handlers for invoices and quotes
  const handleRefreshInv = useCallback(async () => {
    setInvRefreshing(true);
    try {
      await refetchInv();
    } finally {
      setInvRefreshing(false);
    }
  }, [refetchInv]);

  const handleRefreshQ = useCallback(async () => {
    setQRefreshing(true);
    try {
      await refetchQ();
    } finally {
      setQRefreshing(false);
    }
  }, [refetchQ]);

  // Silently refetch all data sources whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetchInv();
      refetchQ();
      refetchCO();
    }, [refetchInv, refetchQ, refetchCO]),
  );

  async function saveSignature(coId: number, base64: string) {
    try {
      await customFetch(`/api/change-orders/${coId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSignatureData: base64, signedAt: new Date().toISOString() }),
      });
      await refetchCO();
      Alert.alert("Signature saved");
    } catch {
      Alert.alert("Failed to save signature");
    }
  }

  const openVoiceModal = (type: "invoice" | "quote") => {
    setVoiceFor(type);
    setAiResult(null);
    setClientName("");
    setVoiceTranscript("");
    setShowVoiceModal(true);
  };

  const handleGenerateAI = useCallback(async () => {
    if (!voiceTranscript.trim()) {
      Alert.alert("Please record or type a job description first.");
      return;
    }
    setAiLoading(true);
    try {
      const data = await customFetch<AIResult>(`/api/ai/${voiceFor}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceInput: voiceTranscript, clientName: clientName || undefined }),
      });
      setAiResult(data);
    } catch (err) {
      Alert.alert("AI generation failed", getAiErrorMessage(err));
    } finally {
      setAiLoading(false);
    }
  }, [voiceTranscript, voiceFor, clientName]);

  const handleCreate = useCallback(async () => {
    if (!aiResult) return;
    setSaving(true);
    try {
      if (voiceFor === "invoice") {
        const inv = await createInvoice.mutateAsync({
          title: aiResult.title ?? "New Invoice",
          clientName: aiResult.clientName ?? clientName ?? "Client",
          lineItems: aiResult.lineItems ?? [],
          notes: aiResult.notes ?? undefined,
        }) as any;
        setShowVoiceModal(false);
        setAiResult(null);
        if (inv?.id) {
          router.push(`/invoice/${inv.id}`);
        } else {
          await refetchInv();
          setTab("invoices");
        }
      } else {
        const q = await createQuote.mutateAsync({
          title: aiResult.title ?? "New Quote",
          clientName: aiResult.clientName ?? clientName ?? "Client",
          lineItems: aiResult.lineItems ?? [],
          notes: aiResult.notes ?? undefined,
        }) as any;
        setShowVoiceModal(false);
        setAiResult(null);
        if (q?.id) {
          router.push({ pathname: "/quote/[id]", params: { id: String(q.id), projectId: String(q.projectId ?? 0) } });
        } else {
          await refetchQ();
          setTab("quotes");
        }
      }
    } catch {
      Alert.alert(`Failed to create ${voiceFor}. Please try again.`);
    } finally {
      setSaving(false);
    }
  }, [aiResult, voiceFor, clientName, createInvoice, createQuote, refetchInv, refetchQ, router]);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Financials</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Dense tap-friendly top switch: Estimates | Quotes | Invoices */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["estimates", "quotes", "invoices"] as TabKey[]).map((t) => (
          <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "estimates" ? "Estimates" : t === "quotes" ? "Quotes" : "Invoices"}
            </Text>
            {tab === t && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </Pressable>
        ))}
      </View>

      {/* Secondary dense segment: progress billing vs. payment/change-order tracking */}
      {tab === "invoices" && (
        <View style={styles.subTabRow}>
          {(["invoices", "change-orders"] as InvoicesView[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => setInvoicesView(v)}
              style={[
                styles.subTabPill,
                {
                  backgroundColor: invoicesView === v ? colors.primary : colors.card,
                  borderColor: invoicesView === v ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.subTabPillText, { color: invoicesView === v ? "#FFFFFF" : colors.mutedForeground }]}>
                {v === "invoices" ? "Invoices" : "Change Orders"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Last updated label */}
      {tab !== "estimates" && (() => {
        const isRefreshing = tab === "quotes" ? qRefreshing : invoicesView === "invoices" ? invRefreshing : coRefreshing;
        const relTime = tab === "quotes" ? qRelativeTime : invoicesView === "invoices" ? invRelativeTime : coRelativeTime;
        const label = isRefreshing ? "Refreshing…" : relTime;
        if (!label) return null;
        return (
          <View style={styles.updatedRow}>
            <Feather name="clock" size={11} color="#9CA3AF" />
            <Text style={styles.updatedText}>{label}</Text>
          </View>
        );
      })()}

      {/* Content */}
      {tab === "estimates" ? (
        <EstimatorScreen />
      ) : tab === "invoices" && invoicesView === "invoices" ? (
        invLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : invError ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color="#EF4444" />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>
              Failed to load invoices
            </Text>
            <Pressable onPress={() => refetchInv()} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={invoices ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <InvoiceRow item={item} />}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No invoices yet</Text>
            }
            refreshControl={<RefreshControl refreshing={invRefreshing} onRefresh={handleRefreshInv} tintColor={colors.primary} />}
          />
        )
      ) : tab === "quotes" ? (
        qLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : qError ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color="#EF4444" />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>
              Failed to load quotes
            </Text>
            <Pressable onPress={() => refetchQ()} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={quotes ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <QuoteRow item={item} />}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No quotes yet</Text>
            }
            refreshControl={<RefreshControl refreshing={qRefreshing} onRefresh={handleRefreshQ} tintColor={colors.primary} />}
          />
        )
      ) : (
        coLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <FlatList
            data={changeOrders ?? []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No change orders yet</Text>
            }
            refreshControl={<RefreshControl refreshing={coRefreshing} onRefresh={() => refetchCO()} tintColor={colors.primary} />}
            renderItem={({ item }: { item: any }) => (
              <View style={{ marginBottom: 10 }}>
                <SwipeableRow
                  disabled={!isOwnerOrForeman || item.status !== "pending"}
                  rightAction={{
                    icon: "check",
                    label: "Approve",
                    color: colors.success,
                    onTrigger: () => approveChangeOrder.mutate({ id: item.id }),
                  }}
                  leftAction={{
                    icon: "x",
                    label: "Reject",
                    color: colors.destructive,
                    onTrigger: () => rejectChangeOrder.mutate({ id: item.id }),
                  }}
                >
                  <ChangeOrderCard
                    title={item.title}
                    projectName={projectNameById.get(item.projectId) ?? `Project #${item.projectId}`}
                    amount={Number(item.amount)}
                    tone={CO_STATUS_TONE[item.status] ?? "draft"}
                    statusLabel={CO_STATUS_LABEL[item.status] ?? item.status}
                    date={item.createdAt ?? null}
                    signed={!!item.clientSignatureData}
                    onPress={() => router.push(`/change-order/${item.id}`)}
                  />
                </SwipeableRow>
                {item.status === "approved" && !item.clientSignatureData && (
                  <Pressable
                    onPress={() => setSigCOId(item.id)}
                    style={[styles.signBtn, { borderColor: colors.primary, marginTop: 8 }]}
                  >
                    <Feather name="edit-3" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Collect Signature</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )
      )}

      {/* Signature Canvas Modal */}
      <SignatureCanvas
        visible={sigCOId !== null}
        onClose={() => setSigCOId(null)}
        onSave={(base64) => {
          if (sigCOId !== null) saveSignature(sigCOId, base64);
        }}
      />

      {/* FABs — hidden on the Estimates tab, which has its own creation flow */}
      {tab !== "estimates" && (
        <View style={[styles.fabRow, { bottom: insets.bottom + 20 }]}>
          {tab === "invoices" && invoicesView === "change-orders" ? (
            <Pressable
              style={[styles.fabSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowCOSheet(true)}
            >
              <Feather name="plus" size={18} color={colors.primary} />
              <Text style={[styles.fabSecondaryText, { color: colors.primary }]}>Change Order</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.fabSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openVoiceModal("quote")}
            >
              <Feather name="mic" size={18} color={colors.primary} />
              <Text style={[styles.fabSecondaryText, { color: colors.primary }]}>Voice Quote</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.fab, { backgroundColor: colors.primary }]}
            onPress={() => openVoiceModal("invoice")}
          >
            <Feather name="mic" size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>Voice Invoice</Text>
          </Pressable>
        </View>
      )}

      {/* Voice / AI Modal */}
      <Modal visible={showVoiceModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVoiceModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Voice {voiceFor === "invoice" ? "Invoice" : "Quote"}
            </Text>
            <Pressable onPress={() => setShowVoiceModal(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Client Name (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Maple Construction Ltd."
              placeholderTextColor={colors.mutedForeground}
              value={clientName}
              onChangeText={setClientName}
            />

            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Job Description</Text>
            <TextInput
              style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={isTranscribing ? "Transcribing…" : "Tap the mic to record, or type the job description here…"}
              placeholderTextColor={colors.mutedForeground}
              value={voiceTranscript}
              onChangeText={(text) => setVoiceTranscript(text.slice(0, 3000))}
              multiline
              editable={!isTranscribing}
              maxLength={3000}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
              <Text style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: voiceTranscript.length >= 3000 ? "#EF4444" : voiceTranscript.length >= 3000 * 0.8 ? "#F59E0B" : colors.mutedForeground,
              }}>
                {voiceTranscript.length}/3,000
              </Text>
            </View>

            {/* Record button */}
            <Pressable
              style={[styles.recordBtn, { backgroundColor: isRecording ? "#EF4444" : colors.primary }]}
              onPress={toggleVoice}
              disabled={isTranscribing}
            >
              {isTranscribing
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Feather name={isRecording ? "square" : "mic"} size={22} color="#FFFFFF" />}
              <Text style={styles.recordBtnText}>
                {isTranscribing ? "Transcribing…" : isRecording ? "Stop Recording" : "Start Recording"}
              </Text>
            </Pressable>

            {/* Generate */}
            <Pressable
              style={[styles.generateBtn, { backgroundColor: colors.primary, opacity: (!voiceTranscript.trim() || aiLoading) ? 0.5 : 1 }]}
              onPress={handleGenerateAI}
              disabled={!voiceTranscript.trim() || aiLoading}
            >
              {aiLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="zap" size={18} color="#FFFFFF" />}
              <Text style={styles.generateBtnText}>{aiLoading ? "Generating…" : "Generate with AI"}</Text>
            </Pressable>

            {/* AI Result Preview */}
            {aiResult && (
              <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.resultTitle, { color: colors.foreground }]}>{aiResult.title}</Text>
                {aiResult.clientName && (
                  <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>Client: {aiResult.clientName}</Text>
                )}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                {(aiResult.lineItems ?? []).map((item, i) => (
                  <View key={i} style={styles.lineItemRow}>
                    <Text style={[styles.lineItemDesc, { color: colors.foreground }]} numberOfLines={2}>{item.description}</Text>
                    <Text style={[styles.lineItemTotal, { color: colors.primary }]}>{fmtCAD(item.total)}</Text>
                  </View>
                ))}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
                  <Text style={[styles.totalVal, { color: colors.foreground }]}>{fmtCAD(aiResult.subtotal ?? 0)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>HST (13%)</Text>
                  <Text style={[styles.totalVal, { color: colors.foreground }]}>{fmtCAD(aiResult.taxAmount ?? 0)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Total</Text>
                  <Text style={[styles.totalVal, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{fmtCAD(aiResult.total ?? 0)}</Text>
                </View>
                {aiResult.notes && (
                  <Text style={[styles.notes, { color: colors.mutedForeground }]}>{aiResult.notes}</Text>
                )}

                <Pressable
                  style={[styles.createBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                  onPress={handleCreate}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="check-circle" size={18} color="#FFFFFF" />}
                  <Text style={styles.createBtnText}>
                    {saving ? "Creating…" : `Create ${voiceFor === "invoice" ? "Invoice" : "Quote"}`}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* New Change Order — bottom sheet, replacing the old full-page Modal */}
      <ChangeOrderFormSheet
        visible={showCOSheet}
        onClose={() => setShowCOSheet(false)}
        onSubmit={handleCreateChangeOrder}
        submitting={coSaving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tabIndicator: { position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, borderRadius: 1 },
  subTabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  subTabPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  subTabPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 14, borderWidth: 1, gap: 12 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular", paddingTop: 40 },
  fabRow: { position: "absolute", right: 16, flexDirection: "row", gap: 10, alignItems: "center" },
  fab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fabSecondary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 24, borderWidth: 1, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  fabSecondaryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalContent: { padding: 20, gap: 4 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  transcriptBox: { borderWidth: 1, borderRadius: 10, padding: 14, minHeight: 90, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, textAlignVertical: "top" },
  recordBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 14, borderRadius: 12, marginTop: 12 },
  recordBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginTop: 10 },
  generateBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 16, gap: 4 },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  resultSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginVertical: 10 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  lineItemDesc: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemTotal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  totalVal: { fontSize: 13, fontFamily: "Inter_500Medium" },
  notes: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 18 },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginTop: 14 },
  createBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  signBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 8 },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 6 },
  updatedText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
});
