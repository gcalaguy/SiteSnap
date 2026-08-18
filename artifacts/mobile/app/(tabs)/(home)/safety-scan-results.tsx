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
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface Hazard {
  id: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  remediation: string | null;
  boundingArea: string | null;
  capaTicketId: number | null;
  capaStatus: string | null;
}

interface ScanDetail {
  id: number;
  projectId: number;
  summary: string | null;
  complianceScore: number | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  ppeDetected: Array<{ item: string; present: boolean }>;
  hazards: Hazard[];
  reportObjectPath: string | null;
  siteAddress: string | null;
}

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#CA8A04",
  low: "#16A34A",
};

export default function SafetyScanResultsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

  async function viewReport() {
    if (!scan) return;
    setDownloadingReport(true);
    try {
      const blob = await customFetch<Blob>(`/api/safety/scans/${scan.id}/report`, { responseType: "blob" });
      const base64 = await blobToBase64(blob);
      const path = `${FileSystem.cacheDirectory}safety-scan-${scan.id}.pdf`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      Alert.alert("Error", "Could not open the PDF report.");
    } finally {
      setDownloadingReport(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await customFetch<ScanDetail>(`/api/safety/scans/${id}`);
      setScan(data);
    } catch {
      Alert.alert("Error", "Could not load scan results.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function createAction(hazard: Hazard) {
    setCreatingFor(hazard.id);
    try {
      await customFetch(`/api/safety/scans/${id}/hazards/${hazard.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Could not create corrective action.");
    } finally {
      setCreatingFor(null);
    }
  }

  if (loading || !scan) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const riskColor = RISK_COLOR[scan.riskLevel ?? "low"];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 60 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.foreground }]}>Scan Results</Text>
      {scan.siteAddress ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{scan.siteAddress}</Text>
      ) : null}

      <View style={styles.scoreRow}>
        <View style={[styles.scoreBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>COMPLIANCE</Text>
          <Text style={[styles.scoreValue, { color: colors.foreground }]}>{scan.complianceScore ?? 0}%</Text>
        </View>
        <View style={[styles.scoreBox, { backgroundColor: `${riskColor}1A`, borderColor: riskColor }]}>
          <Text style={[styles.scoreLabel, { color: riskColor }]}>RISK LEVEL</Text>
          <Text style={[styles.scoreValue, { color: riskColor }]}>{(scan.riskLevel ?? "low").toUpperCase()}</Text>
        </View>
      </View>

      {scan.summary ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AI Summary</Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{scan.summary}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>PPE Compliance</Text>
        {scan.ppeDetected.map((p, i) => (
          <View key={i} style={styles.ppeRow}>
            <Feather
              name={p.present ? "check-circle" : "x-circle"}
              size={16}
              color={p.present ? "#16A34A" : "#DC2626"}
            />
            <Text style={[styles.ppeText, { color: colors.foreground }]}>{p.item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Hazards ({scan.hazards.length})
        </Text>
        {scan.hazards.length === 0 ? (
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No hazards identified.</Text>
        ) : (
          scan.hazards.map((h) => {
            const hColor = RISK_COLOR[h.severity];
            return (
              <View key={h.id} style={[styles.hazardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.hazardHeader}>
                  <View style={[styles.severityDot, { backgroundColor: hColor }]} />
                  <Text style={[styles.hazardSeverity, { color: hColor }]}>{h.severity.toUpperCase()}</Text>
                </View>
                <Text style={[styles.hazardTitle, { color: colors.foreground }]}>{h.title}</Text>
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{h.description}</Text>
                {h.remediation ? (
                  <Text style={[styles.remediation, { color: colors.foreground }]}>
                    <Text style={{ fontFamily: "NunitoSans_600SemiBold" }}>Remediation: </Text>
                    {h.remediation}
                  </Text>
                ) : null}

                {h.capaTicketId ? (
                  <View style={styles.actionCreated}>
                    <Feather name="check-circle" size={14} color="#16A34A" />
                    <Text style={[styles.actionCreatedText, { color: "#16A34A" }]}>
                      Action created ({h.capaStatus})
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => createAction(h)}
                    disabled={creatingFor === h.id}
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  >
                    {creatingFor === h.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>Create Corrective Action</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* The report is generated in the background after scan creation, or
          on demand by the /report endpoint if it isn't ready yet — always
          safe to offer, no need to gate on reportObjectPath being set. */}
      <TouchableOpacity
        onPress={viewReport}
        disabled={downloadingReport}
        style={[styles.reportBtn, { borderColor: colors.border }]}
      >
        {downloadingReport ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <Feather name="file-text" size={16} color={colors.primary} />
            <Text style={[styles.reportBtnText, { color: colors.primary }]}>View PDF Report</Text>
          </>
        )}
      </TouchableOpacity>
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
  scoreValue: { fontSize: 24, fontFamily: "NunitoSans_700Bold", marginTop: 4 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontFamily: "NunitoSans_700Bold", marginBottom: 8 },
  bodyText: { fontSize: 13, fontFamily: "NunitoSans_400Regular", lineHeight: 19 },
  ppeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  ppeText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  hazardCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  hazardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  hazardSeverity: { fontSize: 11, fontFamily: "NunitoSans_700Bold", letterSpacing: 0.5 },
  hazardTitle: { fontSize: 15, fontFamily: "NunitoSans_700Bold", marginBottom: 4 },
  remediation: { fontSize: 13, fontFamily: "NunitoSans_400Regular", marginTop: 8, lineHeight: 19 },
  actionCreated: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  actionCreatedText: { fontSize: 12, fontFamily: "NunitoSans_600SemiBold" },
  actionBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 16, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 28,
  },
  reportBtnText: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
});
