import { useGetMe, customFetch } from "@workspace/api-client-react";
import { signOut } from "@/utils/auth";
import { useRouter } from "expo-router";
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
import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
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
      <Text style={[styles.menuLabel, { color: danger ? colors.destructive : colors.foreground }]} numberOfLines={1}>{label}</Text>
      {!!value && <Text style={[styles.menuValue, { color: colors.mutedForeground }]} numberOfLines={1}>{value}</Text>}
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
  const isWorker = me?.role === "worker";

  const { data: workerTasks, isLoading: workerTasksLoading } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => customFetch<any[]>("/api/dashboard/my-tasks"),
    enabled: isWorker && !!me?.companyId,
  });

  const { data: workerSubmissions, isLoading: workerSubmissionsLoading } = useQuery({
    queryKey: ["safety-submissions"],
    queryFn: () => customFetch<any[]>("/api/safety/submissions"),
    enabled: isWorker && !!me?.companyId,
  });

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

        {/* Worker: My Tasks snapshot */}
        {isWorker && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>My Tasks</Text>
              <TouchableOpacity onPress={() => router.push("/tasks")}>
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "600" }}>See all</Text>
              </TouchableOpacity>
            </View>
            {workerTasksLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : !workerTasks || workerTasks.length === 0 ? (
              <View style={[styles.emptyTasks, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check-circle" size={28} color={colors.mutedForeground} />
                <Text style={[{ color: colors.mutedForeground, marginTop: 8, fontSize: 14 }]}>No tasks assigned to you</Text>
              </View>
            ) : (
              workerTasks.slice(0, 4).map((task: any) => {
                const statusColors: Record<string, string> = {
                  todo: "#6B7280",
                  in_progress: "#F59E0B",
                  done: "#10B981",
                  blocked: "#EF4444",
                };
                const statusLabels: Record<string, string> = {
                  todo: "To Do",
                  in_progress: "In Progress",
                  done: "Done",
                  blocked: "Blocked",
                };
                const sc = statusColors[task.status] ?? "#6B7280";
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push("/tasks")}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.taskDot, { backgroundColor: sc }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={1}>{task.title}</Text>
                      {task.projectName && (
                        <Text style={[styles.taskProject, { color: colors.mutedForeground }]} numberOfLines={1}>{task.projectName}</Text>
                      )}
                    </View>
                    <View style={[styles.taskBadge, { backgroundColor: `${sc}20` }]}>
                      <Text style={[styles.taskBadgeText, { color: sc }]}>{statusLabels[task.status] ?? task.status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Worker: Report an Incident ── */}
        {isWorker && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Safety & Incidents</Text>
              <TouchableOpacity onPress={() => router.push("/safety")}>
                <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>See all</Text>
              </TouchableOpacity>
            </View>

            {/* Report button */}
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar }]}
              onPress={() => router.push("/safety")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="alert-triangle" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>Report an Incident</Text>
                <Text style={styles.featureBannerSub}>Injury · Hazard · Safety Check · Toolbox</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Recent submissions */}
            {workerSubmissionsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />
            ) : workerSubmissions && workerSubmissions.length > 0 ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                {workerSubmissions.slice(0, 3).map((sub: any) => {
                  const statusColors: Record<string, string> = { draft: "#6B7280", submitted: "#F59E0B", reviewed: "#3B82F6", approved: "#10B981" };
                  const statusLabels: Record<string, string> = { draft: "Draft", submitted: "Submitted", reviewed: "Reviewed", approved: "Approved" };
                  const statusIcons: Record<string, string> = { draft: "clock", submitted: "send", reviewed: "eye", approved: "check-circle" };
                  const catColors: Record<string, string> = { injury: "#B91C1C", safety: "#1D4ED8", hazard: "#C2410C", toolbox: "#15803D" };
                  const catBg: Record<string, string> = { injury: "#FEE2E2", safety: "#DBEAFE", hazard: "#FFEDD5", toolbox: "#DCFCE7" };
                  const sc = statusColors[sub.status] ?? "#6B7280";
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      style={[styles.submissionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => router.push("/safety")}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.submissionDot, { backgroundColor: sc }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.submissionName, { color: colors.foreground }]} numberOfLines={1}>
                          {sub.templateName ?? "Safety Form"}
                        </Text>
                        {sub.templateCategory && (
                          <View style={[styles.submissionCatTag, { backgroundColor: catBg[sub.templateCategory] ?? "#F3F4F6" }]}>
                            <Text style={[styles.submissionCatText, { color: catColors[sub.templateCategory] ?? "#374151" }]}>
                              {sub.templateCategory}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.submissionBadge, { backgroundColor: `${sc}18` }]}>
                        <Feather name={statusIcons[sub.status] as any ?? "clock"} size={11} color={sc} />
                        <Text style={[styles.submissionBadgeText, { color: sc }]}>{statusLabels[sub.status] ?? sub.status}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.incidentEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="shield" size={22} color={colors.mutedForeground} />
                <Text style={[{ color: colors.mutedForeground, fontSize: 13, marginTop: 6 }]}>No reports filed yet</Text>
              </View>
            )}
          </View>
        )}

        {/* Worker: Trade Calculators card */}
        {isWorker && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Trade Calculators</Text>

            {/* Main banner button */}
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar, marginBottom: 8 }]}
              onPress={() => router.push("/calculators")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="percent" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>19 Trade Calculators</Text>
                <Text style={styles.featureBannerSub}>Concrete · Framing · Electrical · Plumbing · Roofing · HVAC</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Quick-access category chips */}
            <View style={[styles.calcChipRow, { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border }]}>
              {[
                { label: "Concrete", icon: "grid", color: "#78716C" },
                { label: "Electrical", icon: "zap", color: "#F59E0B" },
                { label: "Plumbing", icon: "droplet", color: "#3B82F6" },
                { label: "Roofing", icon: "home", color: "#EF4444" },
              ].map((cat) => (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.calcChip, { backgroundColor: `${cat.color}14`, borderColor: `${cat.color}30` }]}
                  onPress={() => router.push("/calculators")}
                  activeOpacity={0.7}
                >
                  <Feather name={cat.icon as any} size={13} color={cat.color} />
                  <Text style={[styles.calcChipText, { color: cat.color }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Quick Create — owners & foremen only */}
        {isOwnerOrForeman && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Quick Create</Text>

            {/* Voice Quote banner */}
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar, marginBottom: 8 }]}
              onPress={() => openVoiceModal("quote")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="file-text" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>Voice Quote</Text>
                <Text style={styles.featureBannerSub}>Record on-site · AI fills pricing instantly</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="mic" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Voice Invoice banner */}
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar, marginBottom: 8 }]}
              onPress={() => openVoiceModal("invoice")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="dollar-sign" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>Voice Invoice</Text>
                <Text style={styles.featureBannerSub}>Speak it · AI builds it · Send & get paid</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="mic" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Finance hub banner */}
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar }]}
              onPress={() => router.push("/finance")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="trending-up" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>Invoices & Quotes</Text>
                <Text style={styles.featureBannerSub}>View, manage & send all documents</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Tools */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Tools</Text>
          {!isWorker && (
            <TouchableOpacity
              style={[styles.featureBanner, { backgroundColor: colors.sidebar, marginBottom: 8 }]}
              onPress={() => router.push("/calculators")}
              activeOpacity={0.85}
            >
              <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
                <Feather name="percent" size={22} color="#D4AF37" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureBannerTitle}>Trade Calculators</Text>
                <Text style={styles.featureBannerSub}>Concrete · Electrical · Plumbing · Roofing</Text>
              </View>
              <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.featureBanner, { backgroundColor: colors.sidebar }]}
            onPress={() => router.push("/tradehub")}
            activeOpacity={0.85}
          >
            <View style={[styles.featureBannerIcon, { backgroundColor: "rgba(255,102,0,0.2)" }]}>
              <Feather name="globe" size={22} color="#D4AF37" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureBannerTitle}>TradeHub</Text>
              <Text style={styles.featureBannerSub}>Canadian Trades Community</Text>
            </View>
            <View style={[styles.featureBannerArrow, { backgroundColor: "#D4AF37" }]}>
              <Feather name="arrow-right" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
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
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", minWidth: 0 },
  menuValue: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1, textAlign: "right", maxWidth: "55%" },
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

  // Shared: Feature banner (dark sidebar + orange icon + orange arrow)
  featureBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14 },
  featureBannerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureBannerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  featureBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  featureBannerArrow: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Worker: Incident reporting
  incidentReportBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14 },
  incidentIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  incidentBtnTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  incidentBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  incidentArrow: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  incidentEmpty: { borderRadius: 10, borderWidth: 1, padding: 20, alignItems: "center" },
  submissionRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  submissionDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  submissionName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  submissionCatTag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 3 },
  submissionCatText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  submissionBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  submissionBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Worker: Trade Calculators feature card
  calcFeatureCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  calcFeatureBanner: { paddingHorizontal: 14, paddingVertical: 14 },
  calcFeatureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  calcFeatureIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  calcFeatureTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  calcFeatureSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  calcFeatureOpenBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  calcChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  calcChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  calcChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Worker tasks
  emptyTasks: { borderRadius: 10, borderWidth: 1, padding: 24, alignItems: "center" },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  taskProject: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  taskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  taskBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

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
