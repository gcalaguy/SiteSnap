import { useGetMe, customFetch } from "@workspace/api-client-react";
import { signOut } from "@/utils/auth";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Share } from "react-native";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  foreman: "Foreman",
  worker: "Worker",
};

type AIResult = {
  title?: string;
  clientName?: string;
  lineItems?: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  notes?: string;
};

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function MenuItem({ icon, label, value, onPress, danger }: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed && onPress ? 0.7 : 1 },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, { backgroundColor: danger ? "#FEE2E2" : colors.muted }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <Text style={[styles.menuLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
      {!!value && <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>{value}</Text>}
      {onPress && !danger && <Feather name="chevron-right" size={16} color={colors.border} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me, isLoading } = useGetMe();

  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";

  const { data: referralData } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const res = await customFetch<any>("/api/referrals");
      if (res && typeof res === "object" && "referralCode" in res) return res;
      return null;
    },
    enabled: !!me?.companyId,
  });

  // Voice create state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceFor, setVoiceFor] = useState<"invoice" | "quote">("quote");
  const [clientName, setClientName] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [saving, setSaving] = useState(false);

  const { state: voiceState, toggle: toggleVoice } = useVoiceRecorder((text) => {
    setVoiceTranscript((prev) => (prev ? `${prev} ${text}` : text));
  });
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  const createInvoice = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const createQuote = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch("/api/projects/0/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });

  function openVoiceModal(type: "invoice" | "quote") {
    setVoiceFor(type);
    setAiResult(null);
    setClientName("");
    setVoiceTranscript("");
    setShowVoiceModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  const handleGenerateAI = useCallback(async () => {
    if (!voiceTranscript.trim()) {
      Alert.alert("Describe the job first", "Record your voice or type a description.");
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
    } catch {
      Alert.alert("AI generation failed", "Please try again.");
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (inv?.id) router.push(`/invoice/${inv.id}`);
        else router.push("/finance");
      } else {
        const q = await createQuote.mutateAsync({
          title: aiResult.title ?? "New Quote",
          clientName: aiResult.clientName ?? clientName ?? "Client",
          lineItems: aiResult.lineItems ?? [],
          notes: aiResult.notes ?? undefined,
        }) as any;
        setShowVoiceModal(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (q?.id) router.push(`/quote/${q.id}`);
        else router.push("/finance");
      }
    } catch {
      Alert.alert(`Failed to create ${voiceFor}`, "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [aiResult, voiceFor, clientName, createInvoice, createQuote, router]);

  async function handleShareReferral() {
    if (!referralData?.referralLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `Join me on Site Snap — the AI-powered construction management app for Canadian contractors. Sign up here: ${referralData.referralLink}`,
        url: referralData.referralLink,
        title: "Join Site Snap",
      });
    } catch {}
  }

  const initials = me
    ? `${me.firstName?.[0] ?? ""}${me.lastName?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await signOut();
        },
      },
    ]);
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topInsets + 20, backgroundColor: colors.sidebar }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {me ? (
            <>
              <Text style={[styles.userName, { color: "#FFFFFF" }]}>
                {me.firstName} {me.lastName}
              </Text>
              <Text style={[styles.userEmail, { color: "rgba(255,255,255,0.6)" }]}>{me.email}</Text>
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{ROLE_LABELS[me.role ?? "worker"] ?? me.role}</Text>
              </View>
            </>
          ) : (
            <Text style={[styles.userEmail, { color: "rgba(255,255,255,0.6)" }]}>Loading...</Text>
          )}
        </View>

        {/* Company */}
        {me?.company && (
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Company</Text>
            <MenuItem icon="briefcase" label={me.company.name} />
            {!!me.company.province && (
              <MenuItem icon="map-pin" label="Province" value={me.company.province} />
            )}
          </View>
        )}

        {/* Quick Create — owners & foremen only */}
        {isOwnerOrForeman && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Quick Create</Text>
            <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
              Describe the job by voice — AI fills materials & pricing instantly.
            </Text>

            <View style={styles.quickRow}>
              {/* Voice Quote */}
              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openVoiceModal("quote")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="file-text" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.foreground }]}>Voice Quote</Text>
                <Text style={[styles.quickDesc, { color: colors.mutedForeground }]}>
                  Record on-site, AI fills pricing
                </Text>
                <View style={[styles.quickBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="mic" size={14} color="#FFFFFF" />
                  <Text style={styles.quickBtnText}>Start</Text>
                </View>
              </TouchableOpacity>

              {/* Voice Invoice */}
              <TouchableOpacity
                style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openVoiceModal("invoice")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: "#3B82F618" }]}>
                  <Feather name="dollar-sign" size={22} color="#3B82F6" />
                </View>
                <Text style={[styles.quickLabel, { color: colors.foreground }]}>Voice Invoice</Text>
                <Text style={[styles.quickDesc, { color: colors.mutedForeground }]}>
                  Speak it, send it, get paid
                </Text>
                <View style={[styles.quickBtn, { backgroundColor: "#3B82F6" }]}>
                  <Feather name="mic" size={14} color="#FFFFFF" />
                  <Text style={styles.quickBtnText}>Start</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Finance hub link */}
            <TouchableOpacity
              style={[styles.financeLink, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => router.push("/finance")}
              activeOpacity={0.7}
            >
              <Feather name="trending-up" size={16} color={colors.primary} />
              <Text style={[styles.financeLinkText, { color: colors.foreground }]}>View all Invoices & Quotes</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Tools */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Tools</Text>
          <MenuItem
            icon="percent"
            label="Calculators"
            value="Concrete · Paint · Lumber & more"
            onPress={() => router.push("/calculators")}
          />
          <MenuItem
            icon="globe"
            label="TradeHub"
            value="Canadian Trades Community"
            onPress={() => router.push("/tradehub")}
          />
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
          <MenuItem icon="mail" label="Email" value={me?.email ?? "—"} />
          <MenuItem icon="shield" label="Role" value={ROLE_LABELS[me?.role ?? "worker"] ?? me?.role ?? "—"} />
        </View>

        {/* Refer a Contractor */}
        {referralData?.referralLink && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Referrals</Text>
            <View style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.referralHeader}>
                <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="gift" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: colors.foreground }]}>Refer a Contractor</Text>
                  <Text style={[styles.menuValue, { color: colors.mutedForeground, marginTop: 2 }]}>
                    {referralData.referralCount === 0
                      ? "No referrals yet"
                      : `${referralData.referralCount} contractor${referralData.referralCount === 1 ? "" : "s"} referred`}
                  </Text>
                </View>
              </View>
              <View style={[styles.referralLinkBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.referralLinkText, { color: colors.mutedForeground }]} numberOfLines={1} ellipsizeMode="middle">
                  {referralData.referralLink}
                </Text>
              </View>
              <Pressable
                style={[styles.referralBtn, { backgroundColor: colors.primary }]}
                onPress={handleShareReferral}
              >
                <Feather name="share-2" size={14} color="#fff" />
                <Text style={styles.referralBtnText}>Share with a Contractor</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Actions</Text>
          <MenuItem icon="log-out" label="Sign Out" onPress={handleSignOut} danger />
        </View>

        <Text style={[styles.versionText, { color: colors.mutedForeground }]}>
          Site Snap v1.0.0
        </Text>
      </ScrollView>

      {/* Voice / AI Modal */}
      <Modal visible={showVoiceModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVoiceModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowVoiceModal(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Voice {voiceFor === "invoice" ? "Invoice" : "Quote"}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* Type toggle */}
            <View style={[styles.typeToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {(["quote", "invoice"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setVoiceFor(t); setAiResult(null); }}
                  style={[
                    styles.typeToggleBtn,
                    voiceFor === t && { backgroundColor: colors.primary },
                  ]}
                >
                  <Feather
                    name={t === "quote" ? "file-text" : "dollar-sign"}
                    size={14}
                    color={voiceFor === t ? "#FFFFFF" : colors.mutedForeground}
                  />
                  <Text style={[styles.typeToggleBtnText, { color: voiceFor === t ? "#FFFFFF" : colors.mutedForeground }]}>
                    {t === "quote" ? "Quote" : "Invoice"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Client Name (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Maple Construction Ltd."
              placeholderTextColor={colors.mutedForeground}
              value={clientName}
              onChangeText={setClientName}
            />

            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Job Description</Text>
            <View style={[styles.transcriptBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.transcriptText, { color: voiceTranscript ? colors.foreground : colors.mutedForeground }]}>
                {isTranscribing ? "Transcribing…" : (voiceTranscript || "Tap the mic below to describe the work on-site, or type here…")}
              </Text>
            </View>
            {!!voiceTranscript && (
              <TouchableOpacity onPress={() => setVoiceTranscript("")} style={{ alignSelf: "flex-end", marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Clear</Text>
              </TouchableOpacity>
            )}

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
              {isRecording && <View style={styles.recordingPulse} />}
            </Pressable>

            {/* Generate with AI */}
            <Pressable
              style={[styles.generateBtn, { backgroundColor: colors.primary, opacity: (!voiceTranscript.trim() || aiLoading) ? 0.5 : 1 }]}
              onPress={handleGenerateAI}
              disabled={!voiceTranscript.trim() || aiLoading}
            >
              {aiLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="zap" size={18} color="#FFFFFF" />}
              <Text style={styles.generateBtnText}>{aiLoading ? "AI generating…" : "Generate with AI"}</Text>
            </Pressable>

            {/* AI Result Preview */}
            {aiResult && (
              <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.resultHeader}>
                  <Feather name="check-circle" size={16} color="#16A34A" />
                  <Text style={[styles.resultHeaderText, { color: "#16A34A" }]}>AI-generated pricing</Text>
                </View>
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
                  <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Total CAD</Text>
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
                  {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="arrow-right" size={18} color="#FFFFFF" />}
                  <Text style={styles.createBtnText}>
                    {saving ? "Creating…" : `Create ${voiceFor === "invoice" ? "Invoice" : "Quote"}`}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  userName: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 4 },
  userEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start", marginTop: 8 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  sectionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 18 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  menuIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  menuValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  versionText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 8 },
  referralCard: { borderRadius: 10, borderWidth: 1, padding: 14, gap: 12 },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  referralLinkBox: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  referralLinkText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  referralBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 8 },
  referralBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Quick Create
  quickRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  quickCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  quickLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  quickDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginBottom: 8 },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickBtnText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  financeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  financeLinkText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },

  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalContent: { padding: 20, gap: 4, paddingBottom: 40 },
  typeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 20,
    gap: 3,
  },
  typeToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  typeToggleBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  transcriptBox: { borderWidth: 1, borderRadius: 10, padding: 14, minHeight: 90 },
  transcriptText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
    position: "relative",
  },
  recordBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  recordingPulse: {
    position: "absolute",
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    opacity: 0.7,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  generateBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 16, gap: 4 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  resultHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  resultSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  lineItemDesc: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemTotal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  totalVal: { fontSize: 13, fontFamily: "Inter_500Medium" },
  notes: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 18 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  createBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
