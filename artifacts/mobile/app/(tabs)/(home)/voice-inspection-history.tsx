import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface InspectionListItem {
  id: number;
  equipmentOrArea: string | null;
  passStatus: "pass" | "fail" | "conditional" | null;
  severityLevel: "low" | "medium" | "high" | "critical" | null;
  siteAddress: string | null;
  projectName: string | null;
  createdAt: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#CA8A04",
  low: "#16A34A",
};

export default function VoiceInspectionHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [inspections, setInspections] = useState<InspectionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<{ data: InspectionListItem[] }>("/api/voice-inspections")
      .then((res) => setInspections(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 16 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Inspection History</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={inspections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, gap: 10 }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No voice inspections yet.</Text>
          }
          renderItem={({ item }) => {
            const riskColor = RISK_COLOR[item.severityLevel ?? "low"];
            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: "/(tabs)/(home)/voice-inspection-results", params: { id: String(item.id) } })
                }
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.equipmentOrArea ?? item.siteAddress ?? "Voice inspection"}
                  </Text>
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                    {item.projectName ? `${item.projectName} · ` : ""}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={[styles.riskPill, { backgroundColor: `${riskColor}1A` }]}>
                  <Text style={[styles.riskPillText, { color: riskColor }]}>
                    {(item.severityLevel ?? "low").toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontSize: 14, fontFamily: "NunitoSans_500Medium" },
  title: { fontSize: 18, fontFamily: "NunitoSans_700Bold" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "NunitoSans_400Regular" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 2 },
  riskPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16 },
  riskPillText: { fontSize: 10, fontFamily: "NunitoSans_700Bold" },
});
