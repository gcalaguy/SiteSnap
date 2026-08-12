import { useGetMe, customFetch, useSetActiveCompany, getGetMeQueryKey, useGetBillingSeats } from "@workspace/api-client-react";
import { signOut } from "@/utils/auth";
import { useRouter } from "expo-router";
import { getAiErrorMessage } from "@/src/utils/aiError";
import * as Haptics from "expo-haptics";
import { Share } from "react-native";
import React, { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { usePermissions } from "@/hooks/usePermissions";
import { useThemePreference } from "@/context/ThemeContext";
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Card, ListRow } from "@/components/ui";
import { layout, radius, spacing, typography } from "@/constants/theme";
import { safeNavigate } from "@/utils/safeNavigate";

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

// One elevated Card wrapping any number of ListRows with hairline dividers
// between them — the repeated shape behind Quick Create/Administration/
// Account/Actions below, matching the tool-grid Card language used on the
// Projects and Browse Tools tabs instead of Profile's old one-off bordered
// boxes.
function RowGroup({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const rows = React.Children.toArray(children);
  return (
    <Card padding="none">
      <View style={{ paddingHorizontal: spacing.lg }}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
            {row}
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useGetMe();
  const setActiveCompany = useSetActiveCompany();
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();

  const perms = usePermissions();
  const isOwner = me?.role === "owner";

  const activeCompanyId = me?.activeCompanyId;

  const { data: seats } = useGetBillingSeats({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isOwner } as any,
  });

  const showSeatWarning =
    isOwner &&
    seats != null &&
    seats.maxSeats !== "unlimited" &&
    seats.currentSeats / Number(seats.maxSeats) >= 0.8;
  const memberships = me?.memberships ?? [];
  const hasMultipleCompanies = memberships.length > 1;

  const { data: referralData } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const res = await customFetch<any>("/api/referrals");
      if (res && typeof res === "object" && "referralCode" in res) return res;
      return null;
    },
    enabled: !!me?.activeCompanyId,
  });

  const handleSwitchCompany = (companyId: number) => {
    setShowCompanyPicker(false);
    if (companyId === activeCompanyId) return;
    setActiveCompany.mutate(
      { data: { companyId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Reload the app to ensure all contexts pick up the new company
          router.replace("/");
        },
        onError: () => {
          Alert.alert("Switch failed", "Could not switch company. Please try again.");
        },
      },
    );
  };

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
        if (q?.id) router.push({ pathname: "/quote/[id]", params: { id: String(q.id), projectId: String(q.projectId ?? 0) } });
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
        {/* Header — plain title over the screen background, matching Projects/Browse Tools */}
        <View style={[styles.headerArea, { paddingTop: topInsets + spacing.xxl }]}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Profile</Text>
          <Text style={[typography.body, { color: colors.mutedForeground, marginTop: -spacing.md, marginBottom: spacing.xl }]}>
            Your account, company & preferences
          </Text>

          <Card>
            <View style={styles.identityRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[typography.title, { color: colors.primaryForeground }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {me ? (
                  <>
                    <Text style={[typography.heading, { color: colors.foreground }]} numberOfLines={1}>
                      {me.firstName} {me.lastName}
                    </Text>
                    <View style={[styles.rolePill, { backgroundColor: colors.primary }]}>
                      <Text style={[typography.label, { color: colors.primaryForeground }]}>
                        {ROLE_LABELS[me.role ?? "worker"] ?? me.role}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>Loading...</Text>
                )}
              </View>
            </View>

            {(me?.company || memberships.length > 0) && (
              <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
                <ListRow
                  icon="briefcase"
                  title={me?.company?.name ?? memberships[0]?.companyName ?? "No Company"}
                  subtitle="Company"
                  onPress={hasMultipleCompanies ? () => setShowCompanyPicker(true) : undefined}
                  showChevron={hasMultipleCompanies}
                />
              </View>
            )}

            <View style={[styles.cardRow, { borderTopColor: colors.border }]}>
              <ListRow
                icon="mail"
                title="Email"
                trailing={<Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>{me?.email ?? "—"}</Text>}
              />
            </View>
          </Card>
        </View>

        {/* Seat usage warning — owners only */}
        {showSeatWarning && (
          <View style={styles.section}>
            <Card onPress={() => safeNavigate(router, "/settings", "profile:seat-warning")} style={{ borderColor: `${colors.warning}55` }}>
              <View style={styles.seatWarningRow}>
                <View style={[styles.seatWarningIcon, { backgroundColor: `${colors.warning}22` }]}>
                  <Feather name="alert-triangle" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyMedium, { color: colors.foreground }]}>Seats nearly full</Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}>
                    {seats!.currentSeats} of {seats!.maxSeats} seats used. Upgrade your plan before you hit the limit.
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </Card>
          </View>
        )}

        {/* Quick Create — voice-driven invoice/quote, shown if viewFinancials is enabled */}
        {perms.viewFinancials && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Quick Create</Text>
            <RowGroup>
              <ListRow icon="mic" title="Voice Invoice" subtitle="Describe the job, get an instant invoice" onPress={() => openVoiceModal("invoice")} showChevron />
              <ListRow icon="mic" title="Voice Quote" subtitle="Describe the job, get an instant quote" onPress={() => openVoiceModal("quote")} showChevron />
            </RowGroup>
          </View>
        )}

        {/* Administration — owners only */}
        {me?.role === "owner" && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Administration</Text>
            <RowGroup>
              <ListRow icon="grid" title="Admin Hub" subtitle="Financials, operations & team tools" onPress={() => safeNavigate(router, "/admin-hub", "profile:admin-hub")} showChevron />
              <ListRow icon="settings" title="Company Settings" subtitle="Billing seats · Email · QuickBooks" onPress={() => safeNavigate(router, "/settings", "profile:company-settings")} showChevron />
              <ListRow icon="mail" title="Email Integrations" subtitle="Connect Outlook & Gmail" onPress={() => safeNavigate(router, "/email-integrations", "profile:email-integrations")} showChevron />
              <ListRow icon="filter" title="Automatic Filing Rules" subtitle="IF/AND/OR rules that file incoming emails" onPress={() => safeNavigate(router, "/email-filing-rules", "profile:email-filing-rules")} showChevron />
            </RowGroup>
          </View>
        )}

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Appearance</Text>
          <Card padding="sm">
            <View style={[styles.typeToggle, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 0 }]}>
              {(["system", "light", "dark"] as const).map((opt) => {
                const active = themePreference === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setThemePreference(opt)}
                    style={[styles.typeToggleBtn, active && { backgroundColor: colors.primary }]}
                  >
                    <Feather
                      name={opt === "system" ? "smartphone" : opt === "light" ? "sun" : "moon"}
                      size={14}
                      color={active ? colors.primaryForeground : colors.mutedForeground}
                    />
                    <Text style={[styles.typeToggleBtnText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {opt === "system" ? "System" : opt === "light" ? "Light" : "Dark"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>

        {/* Refer a Contractor */}
        {referralData?.referralLink && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Referrals</Text>
            <Card>
              <View style={styles.referralHeader}>
                <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="gift" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyMedium, { color: colors.foreground }]}>Refer a Contractor</Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}>
                    {referralData.referralCount === 0
                      ? "No referrals yet"
                      : `${referralData.referralCount} contractor${referralData.referralCount === 1 ? "" : "s"} referred`}
                  </Text>
                </View>
              </View>
              <View style={[styles.referralLinkBox, { backgroundColor: colors.muted, borderColor: colors.border, marginTop: spacing.md }]}>
                <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1} ellipsizeMode="middle">
                  {referralData.referralLink}
                </Text>
              </View>
              <Pressable
                style={[styles.referralBtn, { backgroundColor: colors.primary, marginTop: spacing.md }]}
                onPress={handleShareReferral}
              >
                <Feather name="share-2" size={14} color={colors.primaryForeground} />
                <Text style={[typography.captionMedium, { color: colors.primaryForeground }]}>Share with a Contractor</Text>
              </Pressable>
            </Card>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Actions</Text>
          <RowGroup>
            <ListRow icon="log-out" iconColor={colors.destructive} titleColor={colors.destructive} title="Sign Out" onPress={handleSignOut} />
          </RowGroup>
        </View>

        <Text style={[typography.caption, styles.versionText, { color: colors.mutedForeground }]}>
          Site Snap v1.0.0
        </Text>
      </ScrollView>

      {/* Company Picker Modal */}
      <Modal
        visible={showCompanyPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCompanyPicker(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCompanyPicker(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Switch Company</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: colors.mutedForeground, marginBottom: 12, fontSize: 13 }}>
              Select the company you want to work with.
            </Text>
            {memberships.map((m) => {
              const isActive = m.companyId === activeCompanyId;
              return (
                <TouchableOpacity
                  key={m.companyId}
                  activeOpacity={0.7}
                  onPress={() => handleSwitchCompany(m.companyId)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    marginBottom: 8,
                    backgroundColor: isActive ? colors.muted : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.border,
                  }}
                >
                  <View style={[styles.menuIcon, { backgroundColor: isActive ? `${colors.primary}22` : colors.muted }]}>
                    <Feather name="briefcase" size={18} color={isActive ? colors.primary : colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                      {m.companyName ?? `Company ${m.companyId}`}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </Text>
                  </View>
                  {isActive && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

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
                  <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: "NunitoSans_700Bold" }]}>Total CAD</Text>
                  <Text style={[styles.totalVal, { color: colors.primary, fontFamily: "NunitoSans_700Bold" }]}>{fmtCAD(aiResult.total ?? 0)}</Text>
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
  headerArea: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  screenTitle: { ...typography.hero, marginBottom: spacing.sm },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rolePill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, alignSelf: "flex-start", marginTop: spacing.sm },
  cardRow: { borderTopWidth: 1, marginTop: spacing.md },
  section: { paddingHorizontal: layout.gutter, marginBottom: layout.sectionGap },
  sectionTitle: { ...typography.label, textTransform: "uppercase", marginBottom: spacing.md },
  menuIcon: { width: 36, height: 36, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  versionText: { textAlign: "center", paddingTop: spacing.sm },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  referralLinkBox: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  referralBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.sm },

  // Seat warning banner
  seatWarningRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  seatWarningIcon: { width: 36, height: 36, borderRadius: 16, alignItems: "center", justifyContent: "center" },

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
  modalTitle: { fontSize: 17, fontFamily: "NunitoSans_700Bold" },
  modalContent: { padding: 20, gap: 4, paddingBottom: 40 },
  typeToggle: {
    flexDirection: "row",
    borderRadius: 16,
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
    borderRadius: 16,
  },
  typeToggleBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  label: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 16, padding: 12, fontSize: 15, fontFamily: "NunitoSans_400Regular" },
  transcriptBox: { borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 90 },
  transcriptText: { fontSize: 14, fontFamily: "NunitoSans_400Regular", lineHeight: 22 },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    marginTop: 14,
    position: "relative",
  },
  recordBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
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
    borderRadius: 16,
    marginTop: 10,
  },
  generateBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
  resultCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16, gap: 4 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  resultHeaderText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  resultTitle: { fontSize: 16, fontFamily: "NunitoSans_700Bold", marginBottom: 2 },
  resultSub: { fontSize: 13, fontFamily: "NunitoSans_400Regular" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  lineItemDesc: { flex: 1, fontSize: 13, fontFamily: "NunitoSans_400Regular" },
  lineItemTotal: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  totalLabel: { fontSize: 13, fontFamily: "NunitoSans_400Regular" },
  totalVal: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  notes: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 8, lineHeight: 18 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 16,
    marginTop: 14,
  },
  createBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "NunitoSans_600SemiBold" },
});
