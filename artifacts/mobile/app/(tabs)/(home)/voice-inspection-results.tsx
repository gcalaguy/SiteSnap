import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface InspectionDetail {
  id: number;
  transcript: string;
  equipmentOrArea: string | null;
  inspectionType: string | null;
  passStatus: "pass" | "fail" | "conditional" | null;
  hazardSummary: string | null;
  severityLevel: "low" | "medium" | "high" | "critical" | null;
  locationDetails: string | null;
  immediateActionRequired: boolean;
  recommendedActions: string[];
  capaTicketId: number | null;
  siteAddress: string | null;
}

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#CA8A04",
  low: "#16A34A",
};

const PASS_COLOR: Record<string, string> = {
  pass: "#16A34A",
  conditional: "#D97706",
  fail: "#DC2626",
};

export default function VoiceInspectionResultsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [creatingAction, setCreatingAction] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await customFetch<InspectionDetail>(`/api/voice-inspections/${id}`);
      setInspection(data);
    } catch {
      Alert.alert("Error", "Could not load inspection results.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function createAction() {
    setCreatingAction(true);
    try {
      await customFetch(`/api/voice-inspections/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Could not create corrective action.");
    } finally {
      setCreatingAction(false);
    }
  }

  if (loading || !inspection) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const riskColor = RISK_COLOR[inspection.severityLevel ?? "low"];
  const passColor = PASS_COLOR[inspection.passStatus ?? "conditional"];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 60 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.foreground }]}>Inspection Report</Text>
      {inspection.equipmentOrArea ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{inspection.equipmentOrArea}</Text>
      ) : null}

      <View style={styles.scoreRow}>
        <View style={[styles.scoreBox, { backgroundColor: `${passColor}1A`, borderColor: passColor }]}>
          <Text style={[styles.scoreLabel, { color: passColor }]}>STATUS</Text>
          <Text style={[styles.scoreValue, { color: passColor }]}>
            {(inspection.passStatus ?? "conditional").toUpperCase()}
          </Text>
        </View>
        <View style={[styles.scoreBox, { backgroundColor: `${riskColor}1A`, borderColor: riskColor }]}>
          <Text style={[styles.scoreLabel, { color: riskColor }]}>SEVERITY</Text>
          <Text style={[styles.scoreValue, { color: riskColor }]}>
            {(inspection.severityLevel ?? "low").toUpperCase()}
          </Text>
        </View>
      </View>

      {inspection.immediateActionRequired ? (
        <View style={[styles.warningBanner, { backgroundColor: "#DC26261A", borderColor: "#DC2626" }]}>
          <Feather name="alert-triangle" size={16} color="#DC2626" />
          <Text style={[styles.warningText, { color: "#DC2626" }]}>Immediate action required</Text>
        </View>
      ) : null}

      {inspection.inspectionType ? (
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Inspection Type</Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>{inspection.inspectionType}</Text>
        </View>
      ) : null}

      {inspection.locationDetails ? (
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Location</Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>{inspection.locationDetails}</Text>
        </View>
      ) : null}

      {inspection.hazardSummary ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Summary</Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{inspection.hazardSummary}</Text>
        </View>
      ) : null}

      {inspection.recommendedActions.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recommended Actions</Text>
          {inspection.recommendedActions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <Feather name="check" size={14} color={colors.primary} />
              <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>{a}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        {inspection.capaTicketId ? (
          <View style={styles.actionCreated}>
            <Feather name="check-circle" size={14} color="#16A34A" />
            <Text style={[styles.actionCreatedText, { color: "#16A34A" }]}>Corrective action created</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={createAction}
            disabled={creatingAction}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            {creatingAction ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Create Corrective Action</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={() => setShowTranscript((v) => !v)} style={styles.transcriptToggle}>
        <Feather name={showTranscript ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
        <Text style={[styles.transcriptToggleText, { color: colors.mutedForeground }]}>
          {showTranscript ? "Hide" : "Show"} raw transcript
        </Text>
      </TouchableOpacity>
      {showTranscript ? (
        <Text style={[styles.transcriptText, { color: colors.mutedForeground }]}>{inspection.transcript}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  backText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  title: { fontSize: 26, fontFamily: "NunitoSans_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "NunitoSans_400Regular", marginTop: 2, marginBottom: 16 },
  scoreRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  scoreBox: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14 },
  scoreLabel: { fontSize: 10, fontFamily: "NunitoSans_700Bold", letterSpacing: 0.5 },
  scoreValue: { fontSize: 22, fontFamily: "NunitoSans_700Bold", marginTop: 4 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 16,
  },
  warningText: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  fieldRow: { marginTop: 16 },
  fieldLabel: { fontSize: 11, fontFamily: "NunitoSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 15, fontFamily: "NunitoSans_500Medium", marginTop: 2 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontFamily: "NunitoSans_700Bold", marginBottom: 8 },
  bodyText: { fontSize: 13, fontFamily: "NunitoSans_400Regular", lineHeight: 19 },
  actionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  actionCreated: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCreatedText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  actionBtn: { paddingVertical: 12, borderRadius: 16, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  transcriptToggle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 28 },
  transcriptToggleText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  transcriptText: { fontSize: 12, fontFamily: "NunitoSans_400Regular", lineHeight: 18, marginTop: 8 },
});
