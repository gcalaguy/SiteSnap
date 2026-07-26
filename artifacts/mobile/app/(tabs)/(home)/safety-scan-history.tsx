import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface ScanListItem {
  id: number;
  siteAddress: string | null;
  complianceScore: number | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  createdAt: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#CA8A04",
  low: "#16A34A",
};

export default function SafetyScanHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<{ data: ScanListItem[] }>("/api/safety/scans")
      .then((res) => setScans(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 16 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Scan History</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, gap: 10 }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No safety scans yet.</Text>
          }
          renderItem={({ item }) => {
            const riskColor = RISK_COLOR[item.riskLevel ?? "low"];
            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: "/(tabs)/(home)/safety-scan-results", params: { id: String(item.id) } })
                }
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.siteAddress ?? "Unknown location"}
                  </Text>
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={[styles.riskPill, { backgroundColor: `${riskColor}1A` }]}>
                  <Text style={[styles.riskPillText, { color: riskColor }]}>
                    {(item.riskLevel ?? "low").toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.scoreText, { color: colors.foreground }]}>{item.complianceScore ?? 0}%</Text>
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
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  riskPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  riskPillText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  scoreText: { fontSize: 15, fontFamily: "Inter_700Bold", width: 44, textAlign: "right" },
});
