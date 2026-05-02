import { useGetRFI, useUpdateRFI } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

type RFIStatus = "open" | "in_review" | "resolved" | "closed";

const STATUS_CONFIG: Record<RFIStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#F59E0B", bg: "#FEF3C7" },
  in_review: { label: "In Review", color: "#3B82F6", bg: "#DBEAFE" },
  resolved: { label: "Resolved", color: "#22C55E", bg: "#DCFCE7" },
  closed: { label: "Closed", color: "#6B7280", bg: "#F3F4F6" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#EF4444" },
  medium: { label: "Medium", color: "#F59E0B" },
  low: { label: "Low", color: "#6B7280" },
};

const STATUS_ORDER: RFIStatus[] = ["open", "in_review", "resolved", "closed"];

export default function RFIDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const rfiId = Number(id);
  const projId = Number(projectId);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: rfi, isLoading, refetch } = useGetRFI(projId, rfiId);
  const updateRFI = useUpdateRFI();

  const [selectedStatus, setSelectedStatus] = useState<RFIStatus | null>(null);
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rfi) {
      setSelectedStatus(rfi.status as RFIStatus);
      setResponse(rfi.response ?? "");
    }
  }, [rfi]);

  const isDark = colors.background === "#0F1117" || colors.foreground === "#F8F9FA";

  const handleSave = async () => {
    if (!selectedStatus) return;
    setSaving(true);
    updateRFI.mutate(
      {
        projectId: projId,
        rfiId,
        data: { status: selectedStatus, response: response.trim() || undefined },
      },
      {
        onSuccess: () => {
          setSaving(false);
          setSaved(true);
          refetch();
          setTimeout(() => setSaved(false), 2000);
        },
        onError: () => setSaving(false),
      },
    );
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!rfi) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.border} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>RFI not found</Text>
      </View>
    );
  }

  const priorityConf = PRIORITY_CONFIG[rfi.priority ?? "medium"] ?? PRIORITY_CONFIG.medium;
  const currentStatus = selectedStatus ?? (rfi.status as RFIStatus);
  const statusConf = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.open;
  const hasChanges =
    selectedStatus !== rfi.status || response.trim() !== (rfi.response ?? "").trim();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 32,
      }}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.sidebar, paddingTop: topInsets + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerTitleRow}>
          <View style={[styles.rfiNumBadge, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Text style={styles.rfiNum}>{rfi.rfiNumber}</Text>
          </View>
          <Text style={styles.headerSubtitle}>Request for Information</Text>
        </View>

        <Text style={styles.rfiSubject} numberOfLines={3}>{rfi.subject}</Text>

        <View style={styles.headerBadges}>
          <View style={[styles.badge, { backgroundColor: statusConf.bg }]}>
            <Text style={[styles.badgeText, { color: statusConf.color }]}>{statusConf.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${priorityConf.color}20` }]}>
            <Text style={[styles.badgeText, { color: priorityConf.color }]}>
              {priorityConf.label} Priority
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* Submitted by */}
        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.metaRow}>
            <Feather name="user" size={14} color={colors.mutedForeground} />
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Submitted by</Text>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>
              {rfi.submittedBy
                ? `${(rfi.submittedBy as any).firstName ?? ""} ${(rfi.submittedBy as any).lastName ?? ""}`.trim() || "Unknown"
                : "Unknown"}
            </Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metaRow}>
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Submitted</Text>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>
              {new Date(rfi.createdAt).toLocaleDateString("en-CA", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
          {rfi.dueDate && (
            <>
              <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
              <View style={styles.metaRow}>
                <Feather name="clock" size={14} color="#EF4444" />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Due</Text>
                <Text style={[styles.metaValue, { color: "#EF4444" }]}>
                  {new Date(rfi.dueDate).toLocaleDateString("en-CA", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Description</Text>
          <Text style={[styles.descText, { color: colors.foreground }]}>{rfi.description}</Text>
        </View>

        {/* Status picker */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Update Status</Text>
          <View style={styles.statusGrid}>
            {STATUS_ORDER.map((s) => {
              const conf = STATUS_CONFIG[s];
              const active = currentStatus === s;
              return (
                <Pressable
                  key={s}
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: active ? conf.bg : colors.muted,
                      borderColor: active ? conf.color : colors.border,
                      borderWidth: active ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => setSelectedStatus(s)}
                >
                  {active && (
                    <Feather name="check" size={12} color={conf.color} />
                  )}
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: active ? conf.color : colors.mutedForeground },
                    ]}
                  >
                    {conf.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Response field */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Response / Resolution Notes
          </Text>
          <TextInput
            value={response}
            onChangeText={setResponse}
            placeholder="Add your response or resolution notes here…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={[
              styles.textarea,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
        </View>

        {/* Save button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: saved
                ? "#22C55E"
                : hasChanges
                ? colors.primary
                : colors.muted,
              opacity: pressed || saving ? 0.85 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather
                name={saved ? "check" : "save"}
                size={16}
                color={hasChanges || saved ? "#FFFFFF" : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.saveBtnText,
                  { color: hasChanges || saved ? "#FFFFFF" : colors.mutedForeground },
                ]}
              >
                {saved ? "Saved!" : "Save Changes"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 12 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  rfiNumBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  rfiNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  rfiSubject: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFFFFF", lineHeight: 28, marginBottom: 12 },
  headerBadges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  body: { padding: 20, gap: 24 },
  metaCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  metaLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  metaValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  metaDivider: { height: 1 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  statusChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 110, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
