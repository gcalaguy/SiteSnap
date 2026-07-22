import { useGetMe, useListProjects, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
import { Chip } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type InspectionItemDraft = {
  itemName: string;
  status: "pass" | "fail" | "na";
  severity: "low" | "medium" | "high";
  comment: string;
};

type Inspection = {
  id: number;
  inspectionType: string;
  date: string;
  score?: number | null;
  status: "draft" | "submitted";
  aiSummary?: string | null;
  riskLevel?: string | null;
  riskScore?: string | null;
  failedItemAnalysis?: string | null;
  createdAt: string;
};

type InspectionRow = {
  inspection: Inspection;
  project?: { id: number; name: string } | null;
  inspector?: { id: number; firstName: string; lastName: string } | null;
};

type InspectionAlert = {
  alert: {
    id: number;
    type: string;
    message: string;
    severity: string;
    isRead: boolean;
    createdAt: string;
  };
  project?: { id: number; name: string } | null;
  inspection?: { id: number; inspectionType: string; date: string } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  Low: "#16a34a",
  Medium: "#ca8a04",
  High: "#ea580c",
  Critical: "#dc2626",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#ca8a04",
  high: "#dc2626",
  critical: "#dc2626",
};

const INSPECTION_TYPES = ["general", "safety", "quality", "progress", "electrical", "structural", "fire", "environmental"];

const DEFAULT_ITEMS: InspectionItemDraft[] = [
  { itemName: "PPE compliance", status: "pass", severity: "high", comment: "" },
  { itemName: "Site housekeeping", status: "pass", severity: "low", comment: "" },
  { itemName: "Equipment safety", status: "pass", severity: "high", comment: "" },
  { itemName: "Fall protection", status: "pass", severity: "high", comment: "" },
  { itemName: "Fire extinguisher accessible", status: "pass", severity: "medium", comment: "" },
];

// ── Risk Badge ─────────────────────────────────────────────────────────────────

function RiskBadge({ level, colors }: { level?: string | null; colors: any }) {
  if (!level) return <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Pending</Text>;
  const color = RISK_COLORS[level] ?? "#6b7280";
  return (
    <View style={{ backgroundColor: `${color}20`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
      <Text style={{ color, fontSize: 12, fontFamily: "Inter_700Bold" }}>{level}</Text>
    </View>
  );
}

// ── Score Bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ score, riskLevel, colors }: { score?: number | null; riskLevel?: string | null; colors: any }) {
  if (score == null) return null;
  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#ca8a04" : "#dc2626";
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Score</Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color }}>{score}/100</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ width: `${score}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

// ── Checklist Item Row ────────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  index,
  onChange,
  onRemove,
  colors,
}: {
  item: InspectionItemDraft;
  index: number;
  onChange: (i: number, field: keyof InspectionItemDraft, value: string) => void;
  onRemove: (i: number) => void;
  colors: any;
}) {
  const statusColors = { pass: "#16a34a", fail: "#dc2626", na: "#6b7280" };

  return (
    <View style={[styles.checklistItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <TextInput
          style={[styles.checklistInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
          placeholder="Item name..."
          placeholderTextColor={colors.mutedForeground}
          value={item.itemName}
          onChangeText={(v) => onChange(index, "itemName", v)}
        />
        <Pressable onPress={() => onRemove(index)} style={{ padding: 4 }}>
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["pass", "fail", "na"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => onChange(index, "status", s)}
            style={[
              styles.statusPill,
              {
                backgroundColor: item.status === s ? `${statusColors[s]}20` : colors.muted,
                borderColor: item.status === s ? statusColors[s] : colors.border,
              },
            ]}
          >
            <Text style={{ fontSize: 11, color: item.status === s ? statusColors[s] : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
              {s === "na" ? "N/A" : s.toUpperCase()}
            </Text>
          </Pressable>
        ))}
        {item.status === "fail" && (
          <>
            {(["low", "medium", "high"] as const).map((sev) => (
              <Pressable
                key={sev}
                onPress={() => onChange(index, "severity", sev)}
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: item.severity === sev ? `${SEVERITY_COLORS[sev]}20` : colors.muted,
                    borderColor: item.severity === sev ? SEVERITY_COLORS[sev] : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 11, color: item.severity === sev ? SEVERITY_COLORS[sev] : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
                  {sev[0].toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
      {item.status === "fail" && (
        <TextInput
          style={[styles.checklistInput, { color: colors.text, borderColor: colors.border, marginTop: 6 }]}
          placeholder="Comment (optional)..."
          placeholderTextColor={colors.mutedForeground}
          value={item.comment}
          onChangeText={(v) => onChange(index, "comment", v)}
        />
      )}
    </View>
  );
}

// ── New Inspection Modal ──────────────────────────────────────────────────────

function NewInspectionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const qc = useQueryClient();
  const { data: projects = [] } = useListProjects();

  const [step, setStep] = useState<"setup" | "checklist">("setup");
  const [inspType, setInspType] = useState("safety");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [submitNow, setSubmitNow] = useState(true);
  const [items, setItems] = useState<InspectionItemDraft[]>(DEFAULT_ITEMS.map((i) => ({ ...i })));

  const addItem = () => setItems((p) => [...p, { itemName: "", status: "pass", severity: "low", comment: "" }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InspectionItemDraft, value: string) =>
    setItems((p) => p.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const create = useMutation({
    mutationFn: (data: object) =>
      customFetch("/api/inspections", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections-mobile"] });
      qc.invalidateQueries({ queryKey: ["inspection-alerts-mobile"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", submitNow ? "Inspection submitted! AI analysis is running." : "Draft saved.");
      onClose();
      setStep("setup");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save inspection. Please try again.");
    },
  });

  const validItems = items.filter((i) => i.itemName.trim());

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.text }]}>New Inspection</Text>
          <Pressable onPress={() => step === "setup" ? setStep("checklist") : create.mutate({ projectId, inspectionType: inspType, date, items: validItems, submit: submitNow })}>
            <Text style={{ color: colors.primary, fontSize: 15, fontFamily: "Inter_700Bold" }}>
              {step === "setup" ? "Next" : (create.isPending ? "Saving..." : (submitNow ? "Submit" : "Save Draft"))}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {step === "setup" ? (
            <View style={{ gap: 16 }}>
              {/* Type picker */}
              <View>
                <Text style={[styles.label, { color: colors.text }]}>Inspection Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {INSPECTION_TYPES.map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setInspType(t)}
                        style={[
                          styles.typePill,
                          {
                            backgroundColor: inspType === t ? colors.primary : colors.card,
                            borderColor: inspType === t ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 13, color: inspType === t ? "#fff" : colors.text, fontFamily: "Inter_600SemiBold" }}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Date */}
              <View>
                <Text style={[styles.label, { color: colors.text }]}>Date</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              {/* Project */}
              <View>
                <Text style={[styles.label, { color: colors.text }]}>Project (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => setProjectId(null)}
                      style={[styles.typePill, { backgroundColor: projectId === null ? colors.primary : colors.card, borderColor: projectId === null ? colors.primary : colors.border }]}
                    >
                      <Text style={{ fontSize: 13, color: projectId === null ? "#fff" : colors.text, fontFamily: "Inter_600SemiBold" }}>None</Text>
                    </Pressable>
                    {(projects as any[]).map((p: any) => (
                      <Pressable
                        key={p.id}
                        onPress={() => setProjectId(p.id)}
                        style={[styles.typePill, { backgroundColor: projectId === p.id ? colors.primary : colors.card, borderColor: projectId === p.id ? colors.primary : colors.border }]}
                      >
                        <Text style={{ fontSize: 13, color: projectId === p.id ? "#fff" : colors.text, fontFamily: "Inter_600SemiBold" }}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Submit toggle */}
              <Pressable
                onPress={() => setSubmitNow((v) => !v)}
                style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View>
                  <Text style={[styles.label, { color: colors.text }]}>Submit immediately</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                    Triggers AI analysis & team alerts
                  </Text>
                </View>
                <View style={[styles.toggle, { backgroundColor: submitNow ? colors.primary : colors.muted }]}>
                  <View style={[styles.toggleKnob, { transform: [{ translateX: submitNow ? 20 : 2 }] }]} />
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.label, { color: colors.text }]}>Checklist ({validItems.length} items)</Text>
                <Pressable onPress={addItem} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Add</Text>
                </Pressable>
              </View>
              {items.map((item, i) => (
                <ChecklistItemRow key={i} item={item} index={i} onChange={updateItem} onRemove={removeItem} colors={colors} />
              ))}
              {items.length === 0 && (
                <Pressable onPress={addItem} style={[styles.emptyChecklist, { borderColor: colors.border }]}>
                  <Feather name="plus-circle" size={24} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>Tap to add your first checklist item</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ row, onClose, isOwnerOrForeman }: { row: InspectionRow; onClose: () => void; isOwnerOrForeman: boolean }) {
  const colors = useColors();
  const qc = useQueryClient();
  const insp = row.inspection;

  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ["inspection-mobile", insp.id],
    queryFn: () => customFetch(`/api/inspections/${insp.id}`),
  });

  const submit = useMutation({
    mutationFn: () => customFetch(`/api/inspections/${insp.id}/submit`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections-mobile"] });
      qc.invalidateQueries({ queryKey: ["inspection-mobile", insp.id] });
      Alert.alert("Submitted", "AI analysis is running in the background.");
    },
  });

  const riskColor = RISK_COLORS[insp.riskLevel ?? ""] ?? "#6b7280";

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>Close</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Inspection Detail</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Risk header */}
          {insp.riskLevel && (
            <View style={[styles.riskBanner, { backgroundColor: `${riskColor}15`, borderColor: `${riskColor}40` }]}>
              <Feather name="alert-triangle" size={18} color={riskColor} />
              <Text style={{ color: riskColor, fontFamily: "Inter_700Bold", fontSize: 15 }}>{insp.riskLevel} Risk</Text>
              {insp.riskScore && (
                <Text style={{ color: riskColor, fontSize: 13, marginLeft: "auto" }}>Score: {insp.riskScore}/10</Text>
              )}
            </View>
          )}

          {/* Meta */}
          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.metaRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Type</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{insp.inspectionType}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Date</Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>{insp.date}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Project</Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>{row.project?.name ?? "—"}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Status</Text>
              <View style={{ backgroundColor: insp.status === "submitted" ? "#dcfce7" : "#fef9c3", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: insp.status === "submitted" ? "#16a34a" : "#ca8a04", fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>
                  {insp.status}
                </Text>
              </View>
            </View>
            {insp.score != null && <ScoreBar score={insp.score} riskLevel={insp.riskLevel} colors={colors} />}
          </View>

          {/* AI Summary (owners/foremen only) */}
          {isOwnerOrForeman && insp.aiSummary && (
            <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 14, marginBottom: 8 }}>✦ AI Summary</Text>
              <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>{insp.aiSummary}</Text>
            </View>
          )}

          {/* Failed analysis (owners/foremen only) */}
          {isOwnerOrForeman && insp.failedItemAnalysis && (
            <View style={[styles.failedCard, { backgroundColor: "#fff1f2", borderColor: "#fecdd3" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Feather name="alert-triangle" size={14} color="#dc2626" />
                <Text style={{ color: "#dc2626", fontFamily: "Inter_700Bold", fontSize: 13 }}>Failed Item Analysis</Text>
              </View>
              <Text style={{ color: "#9f1239", fontSize: 13, lineHeight: 20 }}>{insp.failedItemAnalysis}</Text>
            </View>
          )}

          {/* Checklist */}
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : detail?.items?.length > 0 ? (
            <View>
              <Text style={[styles.label, { color: colors.text, marginBottom: 8 }]}>Checklist ({detail.items.length} items)</Text>
              {detail.items.map((item: any) => (
                <View key={item.id} style={[styles.checklistResultItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather
                    name={item.status === "pass" ? "check-circle" : item.status === "fail" ? "alert-circle" : "minus-circle"}
                    size={16}
                    color={item.status === "pass" ? "#16a34a" : item.status === "fail" ? "#dc2626" : "#6b7280"}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{item.itemName}</Text>
                    {item.comment && <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{item.comment}</Text>}
                  </View>
                  <View style={{ backgroundColor: item.status === "pass" ? "#dcfce7" : item.status === "fail" ? "#fee2e2" : "#f3f4f6", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: item.status === "pass" ? "#16a34a" : item.status === "fail" ? "#dc2626" : "#6b7280", fontSize: 11, fontFamily: "Inter_700Bold" }}>
                      {item.status === "na" ? "N/A" : item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Submit draft */}
          {insp.status === "draft" && (
            <Pressable
              onPress={() => {
                Alert.alert("Submit Inspection", "This will trigger AI analysis and notify your team.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Submit", onPress: () => submit.mutate() },
                ]);
              }}
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                {submit.isPending ? "Submitting..." : "Submit Inspection"}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function InspectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const isOwnerOrForeman = me?.role === "owner" || me?.role === "foreman";
  const params = useLocalSearchParams<{ action?: string; projectId?: string; status?: string }>();

  // Capture tab deep-links here with ?action=new to jump straight into
  // creating an inspection instead of landing on the list first.
  const [showNew, setShowNew] = useState(params.action === "new");
  const [selected, setSelected] = useState<InspectionRow | null>(null);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A project's Overview tab deep-links here with ?projectId= to preset the filter.
  const [projectFilter, setProjectFilter] = useState<number | null>(
    params.projectId ? Number(params.projectId) : null,
  );
  // The Home dashboard's "Inspections Due" tile deep-links here with ?status=draft
  // so the list it navigates to matches the count it showed.
  const [statusFilter, setStatusFilter] = useState<"all" | "draft">(
    params.status === "draft" ? "draft" : "all",
  );

  const { data: projects = [] } = useListProjects();

  const { data: rows = [], isLoading } = useQuery<InspectionRow[]>({
    queryKey: ["inspections-mobile", projectFilter],
    queryFn: () =>
      customFetch(
        projectFilter
          ? `/api/inspections?projectId=${projectFilter}`
          : "/api/inspections",
      ),
    refetchInterval: 60_000,
  });

  const { data: alertRows = [] } = useQuery<InspectionAlert[]>({
    queryKey: ["inspection-alerts-mobile"],
    queryFn: () => customFetch("/api/inspection-alerts"),
    enabled: isOwnerOrForeman,
    refetchInterval: 60_000,
  });

  const unreadAlerts = alertRows.filter((r) => !r.alert?.isRead);
  const draftCount = rows.filter((r) => r.inspection.status === "draft").length;
  const visibleRows = statusFilter === "draft" ? rows.filter((r) => r.inspection.status === "draft") : rows;

  const markAllRead = useMutation({
    mutationFn: () => customFetch("/api/inspection-alerts/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection-alerts-mobile"] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["inspections-mobile"] }),
      qc.invalidateQueries({ queryKey: ["inspection-alerts-mobile"] }),
    ]);
    setRefreshing(false);
  }, [qc]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Inspections</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              AI-powered site inspections
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowNew(true);
          }}
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>New</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Alerts Panel (owners/foremen) */}
        {isOwnerOrForeman && alertRows.length > 0 && (
          <View style={[styles.alertsPanel, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <Pressable
              style={styles.alertsHeader}
              onPress={() => setAlertsExpanded((e) => !e)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="bell" size={16} color="#ea580c" />
                <Text style={{ color: "#9a3412", fontFamily: "Inter_700Bold", fontSize: 14 }}>
                  Inspection Alerts
                </Text>
                {unreadAlerts.length > 0 && (
                  <View style={{ backgroundColor: "#ea580c", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{unreadAlerts.length}</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {unreadAlerts.length > 0 && (
                  <Pressable onPress={() => markAllRead.mutate()}>
                    <Text style={{ color: "#ea580c", fontSize: 12 }}>Mark all read</Text>
                  </Pressable>
                )}
                <Feather name={alertsExpanded ? "chevron-up" : "chevron-down"} size={16} color="#ea580c" />
              </View>
            </Pressable>
            {alertsExpanded && (
              <View style={{ gap: 8, marginTop: 8 }}>
                {alertRows.slice(0, 5).map((row) => {
                  const a = row.alert;
                  const color = SEVERITY_COLORS[a.severity] ?? "#6b7280";
                  return (
                    <View key={a.id} style={[styles.alertRow, { opacity: a.isRead ? 0.6 : 1 }]}>
                      <Feather name="alert-triangle" size={14} color={color} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ color: "#9a3412", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{a.message}</Text>
                        {row.inspection && (
                          <Text style={{ color: "#c2410c", fontSize: 11, marginTop: 2, textTransform: "capitalize" }}>
                            {row.inspection.inspectionType} · {row.inspection.date}
                          </Text>
                        )}
                      </View>
                      <View style={{ backgroundColor: `${color}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color, fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase" }}>{a.severity}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Status Filter */}
        {rows.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip label="All" selected={statusFilter === "all"} onPress={() => setStatusFilter("all")} />
                <Chip
                  label="Drafts"
                  selected={statusFilter === "draft"}
                  onPress={() => setStatusFilter("draft")}
                  count={draftCount > 0 ? draftCount : undefined}
                />
              </View>
            </ScrollView>
          </View>
        )}

        {/* Project Filter */}
        {(projects as any[]).length > 1 && (
          <View style={{ marginBottom: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip label="All Projects" selected={projectFilter === null} onPress={() => setProjectFilter(null)} />
                {(projects as any[]).map((p: any) => (
                  <Chip key={p.id} label={p.name} selected={projectFilter === p.id} onPress={() => setProjectFilter(p.id)} />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Inspections List */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clipboard" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Inspections</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>
              Create your first inspection to get started
            </Text>
            <Pressable
              onPress={() => setShowNew(true)}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>Create Inspection</Text>
            </Pressable>
          </View>
        ) : visibleRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clipboard" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Draft Inspections</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>
              All inspections have been submitted.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {visibleRows.map((row) => {
              const insp = row.inspection;
              const riskColor = RISK_COLORS[insp.riskLevel ?? ""] ?? null;
              return (
                <Pressable
                  key={insp.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: riskColor ? `${riskColor}40` : colors.border }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelected(row);
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>
                        {insp.inspectionType.charAt(0).toUpperCase() + insp.inspectionType.slice(1)} Inspection
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>
                        {insp.date}
                        {row.project ? ` · ${row.project.name}` : ""}
                      </Text>
                      {row.inspector && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }}>
                          {row.inspector.firstName} {row.inspector.lastName}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <RiskBadge level={insp.riskLevel} colors={colors} />
                      <View style={{ backgroundColor: insp.status === "submitted" ? "#dcfce7" : "#fef9c3", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: insp.status === "submitted" ? "#16a34a" : "#ca8a04", fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>
                          {insp.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {insp.score != null && (
                    <ScoreBar score={insp.score} riskLevel={insp.riskLevel} colors={colors} />
                  )}
                  {/* AI summary preview (owners/foremen) */}
                  {isOwnerOrForeman && insp.aiSummary && (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: `${colors.primary}10`, borderRadius: 6 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 2 }}>✦ AI Summary</Text>
                      <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
                        {insp.aiSummary}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <NewInspectionModal visible={showNew} onClose={() => setShowNew(false)} />
      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} isOwnerOrForeman={isOwnerOrForeman} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 4 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  alertsPanel: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  alertsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alertRow: { flexDirection: "row", alignItems: "flex-start" },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 8 },
  typePill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 14 },
  toggle: { width: 44, height: 24, borderRadius: 12, position: "relative", justifyContent: "center" },
  toggleKnob: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  // Checklist item
  checklistItem: { borderWidth: 1, borderRadius: 10, padding: 10 },
  checklistInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  statusPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  emptyChecklist: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 32 },
  // Detail
  riskBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  metaCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  aiCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  failedCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  checklistResultItem: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  submitBtn: { borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
});
