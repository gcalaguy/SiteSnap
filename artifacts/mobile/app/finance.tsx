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
  Image,
} from "react-native";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { customFetch, useGetMe, useListAllInvoices, useListAllQuotes, useListChangeOrders, useCreateChangeOrder, getListChangeOrdersQueryKey, useListAllRFIs } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import SignatureCanvas from "@/components/SignatureCanvas";
import { getAiErrorMessage } from "@/src/utils/aiError";

type TabKey = "invoices" | "quotes" | "change-orders" | "rfis";

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

const RFI_STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_review: "#f59e0b",
  answered: "#22c55e",
  closed: "#6b7280",
};
const RFI_STATUS_LABELS: Record<string, string> = {
  open: "Open", in_review: "In Review", answered: "Answered", closed: "Closed",
};
const RFI_PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280", medium: "#f59e0b", high: "#ef4444", urgent: "#dc2626",
};

function RFIRow({ item, onPress }: { item: any; onPress: (item: any) => void }) {
  const colors = useColors();
  const statusColor = RFI_STATUS_COLORS[item.status] ?? "#6b7280";
  const priorityColor = RFI_PRIORITY_COLORS[item.priority] ?? "#6b7280";
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
      onPress={() => onPress(item)}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.subject}</Text>
        </View>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.rfiNumber} · {item.projectName ?? "Project #" + item.projectId}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{RFI_STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${priorityColor}18` }]}>
            <Text style={[styles.badgeText, { color: priorityColor }]}>{item.priority ?? "medium"}</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
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
  const [rfiRefreshing, setRfiRefreshing] = useState(false);

  // RFI modal state
  const [showRFIModal, setShowRFIModal] = useState(false);
  const [selectedRFI, setSelectedRFI] = useState<any>(null);
  const [rfiEditTitle, setRfiEditTitle] = useState("");
  const [rfiEditQuestion, setRfiEditQuestion] = useState("");
  const [rfiEditStatus, setRfiEditStatus] = useState("open");
  const [rfiSaving, setRfiSaving] = useState(false);

  // Create RFI modal state
  const [showCreateRFIModal, setShowCreateRFIModal] = useState(false);
  const [createProjectId, setCreateProjectId] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  // Create Change Order form state
  const [showCOForm, setShowCOForm] = useState(false);
  const [coProjectId, setCoProjectId] = useState("");
  const [coTitle, setCoTitle] = useState("");
  const [coDescription, setCoDescription] = useState("");
  const [coAmount, setCoAmount] = useState("");
  const [coNotes, setCoNotes] = useState("");
  const [coSaving, setCoSaving] = useState(false);

  const createChangeOrder = useCreateChangeOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChangeOrdersQueryKey() });
        refetchCO();
        setShowCOForm(false);
        setCoProjectId(""); setCoTitle(""); setCoDescription(""); setCoAmount(""); setCoNotes("");
        Alert.alert("Created", "Change order created successfully.");
      },
      onError: () => Alert.alert("Failed to create change order"),
      onSettled: () => setCoSaving(false),
    },
  });

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
  const { data: rfis, isLoading: rfiLoading, isError: rfiError, refetch: refetchRfi, dataUpdatedAt: rfiUpdatedAt } = useListAllRFIs({});

  const invRelativeTime = useRelativeTime(invUpdatedAt || null);
  const qRelativeTime = useRelativeTime(qUpdatedAt || null);
  const coRelativeTime = useRelativeTime(coDataUpdatedAt || null);
  const rfiRelativeTime = useRelativeTime(rfiUpdatedAt || null);

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

  const handleRefreshRfi = useCallback(async () => {
    setRfiRefreshing(true);
    try {
      await refetchRfi();
    } finally {
      setRfiRefreshing(false);
    }
  }, [refetchRfi]);

  // Silently refetch all data sources whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetchInv();
      refetchQ();
      refetchCO();
      refetchRfi();
    }, [refetchInv, refetchQ, refetchCO, refetchRfi]),
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
        <Text style={styles.headerTitle}>Finance</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["invoices", "quotes", "change-orders", "rfis"] as TabKey[]).map((t) => (
          <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "invoices" ? "Invoices" : t === "quotes" ? "Quotes" : t === "change-orders" ? "Change Orders" : "RFIs"}
            </Text>
            {tab === t && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </Pressable>
        ))}
      </View>

      {/* Last updated label */}
      {(() => {
        const isRefreshing = tab === "invoices" ? invRefreshing : tab === "quotes" ? qRefreshing : tab === "change-orders" ? coRefreshing : rfiRefreshing;
        const relTime = tab === "invoices" ? invRelativeTime : tab === "quotes" ? qRelativeTime : tab === "change-orders" ? coRelativeTime : rfiRelativeTime;
        const label = isRefreshing ? "Refreshing…" : relTime;
        if (!label) return null;
        return (
          <View style={styles.updatedRow}>
            <Feather name="clock" size={11} color="#9CA3AF" />
            <Text style={styles.updatedText}>{label}</Text>
          </View>
        );
      })()}

      {/* List */}
      {tab === "invoices" ? (
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
      ) : tab === "change-orders" ? (
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
            renderItem={({ item }: { item: any }) => {
              const statusColor = item.status === "approved" ? "#22C55E" : item.status === "rejected" ? "#EF4444" : "#F59E0B";
              const statusLabel = item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending";
              return (
                <Pressable
                  style={({ pressed }) => [styles.coCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                  onPress={() => router.push(`/change-order/${item.id}`)}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Project #{item.projectId}</Text>
                      <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
                        <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.rowAmount, { color: colors.primary }]}>{fmtCAD(item.amount)}</Text>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </View>
                  </View>
                  {item.clientSignatureData && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>Client Signature</Text>
                      <Image source={{ uri: item.clientSignatureData }} style={{ width: 160, height: 60, resizeMode: "contain", backgroundColor: "#fff", borderRadius: 6, borderWidth: 1, borderColor: colors.border }} />
                      {item.signedAt && <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>Signed {new Date(item.signedAt).toLocaleDateString("en-CA")}</Text>}
                    </View>
                  )}
                  {item.status === "approved" && !item.clientSignatureData && (
                    <Pressable
                      onPress={(e) => { e.stopPropagation?.(); setSigCOId(item.id); }}
                      style={[styles.signBtn, { borderColor: colors.primary }]}
                    >
                      <Feather name="edit-3" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Collect Signature</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            }}
          />
        )
      ) : (
        rfiLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : rfiError ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color="#EF4444" />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 12 }]}>
              Failed to load RFIs
            </Text>
            <Pressable onPress={() => refetchRfi()} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={rfis ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <RFIRow
                item={item}
                onPress={(rfi) => {
                  setSelectedRFI(rfi);
                  setRfiEditTitle(rfi.subject ?? "");
                  setRfiEditQuestion(rfi.description ?? "");
                  setRfiEditStatus(rfi.status ?? "open");
                  setShowRFIModal(true);
                }}
              />
            )}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No RFIs yet</Text>
            }
            refreshControl={<RefreshControl refreshing={rfiRefreshing} onRefresh={handleRefreshRfi} tintColor={colors.primary} />}
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

      {/* FABs */}
      {tab === "rfis" && me?.role === "owner" ? (
        <View style={[styles.fabRow, { bottom: insets.bottom + 20 }]}>
          <Pressable
            style={[styles.fab, { backgroundColor: colors.primary }]}
            onPress={() => {
              setCreateProjectId("");
              setCreateSubject("");
              setCreateDescription("");
              setShowCreateRFIModal(true);
            }}
          >
            <Feather name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>Create RFI</Text>
          </Pressable>
        </View>
      ) : tab !== "rfis" && (
        <View style={[styles.fabRow, { bottom: insets.bottom + 20 }]}>
          {tab === "change-orders" ? (
            <Pressable
              style={[styles.fabSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowCOForm(true)}
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

      {/* Create Change Order Modal */}
      <Modal visible={showCOForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCOForm(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Change Order</Text>
            <Pressable onPress={() => setShowCOForm(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Project ID</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. 1"
              placeholderTextColor={colors.mutedForeground}
              value={coProjectId}
              onChangeText={setCoProjectId}
              keyboardType="number-pad"
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Title</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Additional drywall scope"
              placeholderTextColor={colors.mutedForeground}
              value={coTitle}
              onChangeText={setCoTitle}
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Description</Text>
            <TextInput
              style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Describe the scope change..."
              placeholderTextColor={colors.mutedForeground}
              value={coDescription}
              onChangeText={setCoDescription}
              multiline
              numberOfLines={3}
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Amount (CAD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. 2500.00"
              placeholderTextColor={colors.mutedForeground}
              value={coAmount}
              onChangeText={setCoAmount}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Notes</Text>
            <TextInput
              style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Internal notes (optional)..."
              placeholderTextColor={colors.mutedForeground}
              value={coNotes}
              onChangeText={setCoNotes}
              multiline
              numberOfLines={2}
            />
            <Pressable
              style={[styles.createBtn, { backgroundColor: colors.primary, opacity: coSaving ? 0.7 : 1 }]}
              onPress={() => {
                const pid = parseInt(coProjectId);
                const amt = parseFloat(coAmount);
                if (!pid || isNaN(pid)) { Alert.alert("Enter a valid Project ID"); return; }
                if (!coTitle.trim()) { Alert.alert("Enter a title"); return; }
                if (!coAmount || isNaN(amt) || amt <= 0) { Alert.alert("Enter a valid amount"); return; }
                setCoSaving(true);
                createChangeOrder.mutate({ data: { projectId: pid, title: coTitle.trim(), description: coDescription.trim() || null, amount: amt, notes: coNotes.trim() || null } });
              }}
              disabled={coSaving}
            >
              {coSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="plus" size={18} color="#FFFFFF" />}
              <Text style={styles.createBtnText}>{coSaving ? "Creating…" : "Create Change Order"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* RFI Detail / Edit Modal */}
      <Modal visible={showRFIModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRFIModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>RFI Details</Text>
            <Pressable onPress={() => setShowRFIModal(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {selectedRFI && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>RFI Number</Text>
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12 }}>{selectedRFI.rfiNumber}</Text>

                <Text style={[styles.label, { color: colors.mutedForeground }]}>Title / Subject</Text>
                {me?.role === "owner" ? (
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    value={rfiEditTitle}
                    onChangeText={setRfiEditTitle}
                    placeholder="RFI title..."
                    placeholderTextColor={colors.mutedForeground}
                  />
                ) : (
                  <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 12 }}>{selectedRFI.subject}</Text>
                )}

                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Question / Description</Text>
                {me?.role === "owner" ? (
                  <TextInput
                    style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    value={rfiEditQuestion}
                    onChangeText={setRfiEditQuestion}
                    placeholder="Describe the question..."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={4}
                  />
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 12, lineHeight: 22 }}>{selectedRFI.description}</Text>
                )}

                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Status</Text>
                {me?.role === "owner" ? (
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {(["open", "in_review", "answered", "closed"] as const).map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setRfiEditStatus(s)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: rfiEditStatus === s ? colors.primary : colors.border,
                          backgroundColor: rfiEditStatus === s ? `${colors.primary}18` : colors.card,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: rfiEditStatus === s ? colors.primary : colors.mutedForeground }}>
                          {s === "open" ? "Open" : s === "in_review" ? "In Review" : s === "answered" ? "Answered" : "Closed"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 12 }}>{RFI_STATUS_LABELS[selectedRFI.status] ?? selectedRFI.status}</Text>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4 }}>
                  Project: {selectedRFI.projectName ?? "Project #" + selectedRFI.projectId}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Submitted by: {selectedRFI.submittedByName}
                </Text>

                {me?.role === "owner" && (
                  <Pressable
                    style={[styles.createBtn, { backgroundColor: colors.primary, opacity: rfiSaving ? 0.7 : 1 }]}
                    onPress={async () => {
                      if (!selectedRFI) return;
                      setRfiSaving(true);
                      try {
                        await customFetch(`/api/projects/${selectedRFI.projectId}/rfis/${selectedRFI.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            subject: rfiEditTitle.trim(),
                            description: rfiEditQuestion.trim(),
                            status: rfiEditStatus,
                          }),
                        });
                        await refetchRfi();
                        qc.invalidateQueries({ queryKey: ["/api/rfis"] });
                        setShowRFIModal(false);
                        Alert.alert("Saved", "RFI updated successfully.");
                      } catch {
                        Alert.alert("Failed to save RFI changes.");
                      } finally {
                        setRfiSaving(false);
                      }
                    }}
                    disabled={rfiSaving}
                  >
                    {rfiSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="check" size={18} color="#FFFFFF" />}
                    <Text style={styles.createBtnText}>{rfiSaving ? "Saving…" : "Save Changes"}</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Create RFI Modal */}
      <Modal visible={showCreateRFIModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateRFIModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New RFI</Text>
            <Pressable onPress={() => setShowCreateRFIModal(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Project ID</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. 1"
              placeholderTextColor={colors.mutedForeground}
              value={createProjectId}
              onChangeText={setCreateProjectId}
              keyboardType="number-pad"
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Subject / Title</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Foundation wall reinforcement detail"
              placeholderTextColor={colors.mutedForeground}
              value={createSubject}
              onChangeText={setCreateSubject}
            />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Question / Description</Text>
            <TextInput
              style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Describe the question or issue..."
              placeholderTextColor={colors.mutedForeground}
              value={createDescription}
              onChangeText={setCreateDescription}
              multiline
              numberOfLines={4}
            />
            <Pressable
              style={[styles.createBtn, { backgroundColor: colors.primary, opacity: createSaving ? 0.7 : 1 }]}
              onPress={async () => {
                const pid = parseInt(createProjectId);
                if (!pid || isNaN(pid)) { Alert.alert("Enter a valid Project ID"); return; }
                if (!createSubject.trim()) { Alert.alert("Enter a subject"); return; }
                if (!createDescription.trim()) { Alert.alert("Enter a description"); return; }
                setCreateSaving(true);
                try {
                  await customFetch(`/api/rfis`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      projectId: pid,
                      subject: createSubject.trim(),
                      description: createDescription.trim(),
                      status: "open",
                    }),
                  });
                  await refetchRfi();
                  qc.invalidateQueries({ queryKey: ["/api/rfis"] });
                  setShowCreateRFIModal(false);
                  setCreateProjectId(""); setCreateSubject(""); setCreateDescription("");
                  Alert.alert("Created", "RFI created successfully.");
                } catch {
                  Alert.alert("Failed to create RFI.");
                } finally {
                  setCreateSaving(false);
                }
              }}
              disabled={createSaving}
            >
              {createSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="plus" size={18} color="#FFFFFF" />}
              <Text style={styles.createBtnText}>{createSaving ? "Creating…" : "Create RFI"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
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
  coCard: { borderRadius: 10, padding: 14, borderWidth: 1, gap: 8 },
  signBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 8 },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 6 },
  updatedText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
});
