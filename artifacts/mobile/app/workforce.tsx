import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import ScheduleScreen from "@/components/workforce/ScheduleScreen";
import HoursScreen from "@/components/workforce/HoursScreen";

// [Master Schedule | Timesheets] — consolidated Workforce hub: planning vs. execution.
// Deep-linkable via /workforce?tab=schedule|hours
type TabKey = "schedule" | "hours";

export default function WorkforceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const [tab, setTab] = useState<TabKey>(requestedTab === "hours" ? "hours" : "schedule");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Workforce</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Dense tap-friendly top switch: Master Schedule | Timesheets */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["schedule", "hours"] as TabKey[]).map((t) => (
          <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "schedule" ? "Master Schedule" : "Timesheets"}
            </Text>
            {tab === t && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === "schedule" ? <ScheduleScreen embedded /> : <HoursScreen embedded />}
      </View>
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
});
