import React from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGetMe } from "@workspace/api-client-react";

type HubTile = {
  label: string;
  icon: string;
  route: string;
  color: string;
};

const TILE_GROUPS: { title: string; tiles: HubTile[] }[] = [
  {
    title: "Financials",
    tiles: [
      { label: "Quotes & Approvals", icon: "file-text", route: "/finance", color: "#3B82F6" },
      { label: "Invoices & Payments", icon: "dollar-sign", route: "/finance", color: "#22C55E" },
      { label: "Change Orders", icon: "git-pull-request", route: "/finance", color: "#F59E0B" },
      { label: "Project Financials", icon: "pie-chart", route: "/finance", color: "#8B5CF6" },
    ],
  },
  {
    title: "Operations",
    tiles: [
      { label: "Timesheet Overview", icon: "clipboard", route: "/timesheets", color: "#0EA5E9" },
      { label: "Hours Tracking", icon: "clock", route: "/hours", color: "#06B6D4" },
      { label: "Master Schedule", icon: "calendar", route: "/schedule", color: "#EC4899" },
    ],
  },
  {
    title: "Team",
    tiles: [
      { label: "Contacts Directory", icon: "book", route: "/contacts", color: "#C9A84C" },
    ],
  },
];

function Tile({ tile }: { tile: HubTile }) {
  const colors = useColors();
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.navigate(tile.route as any);
      }}
    >
      <View style={[styles.tileIconBg, { backgroundColor: `${tile.color}18` }]}>
        <Feather name={tile.icon as any} size={22} color={tile.color} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.foreground }]} numberOfLines={2}>
        {tile.label}
      </Text>
    </Pressable>
  );
}

export default function AdminHubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const firstName = me?.firstName ?? "there";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 20, backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerGreeting}>Welcome back,</Text>
          <Text style={styles.headerName}>{firstName}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>Owner</Text>
        </View>
      </View>

      {/* Tile Groups */}
      {TILE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{group.title}</Text>
          <View style={styles.grid}>
            {group.tiles.map((tile) => (
              <Tile key={tile.label} tile={tile} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerGreeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
  },
  headerName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#111111",
  },
  group: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  groupTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "47.5%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tileIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
});
