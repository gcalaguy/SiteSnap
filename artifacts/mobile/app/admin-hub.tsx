import React from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGetMe } from "@workspace/api-client-react";
import { Card, ListRow } from "@/components/ui";

type HubTile = {
  label: string;
  subtitle: string;
  icon: string;
  route: string;
  color: string;
};

const TILE_GROUPS: { title: string; tiles: HubTile[] }[] = [
  {
    title: "Financials",
    tiles: [
      { label: "Project Financials", subtitle: "Budgets, costs & margins", icon: "pie-chart", route: "/finance", color: "#8B5CF6" },
    ],
  },
  {
    title: "Operations",
    tiles: [
      { label: "Workforce", subtitle: "Scheduling & assignments", icon: "calendar", route: "/workforce", color: "#EC4899" },
      { label: "Permits", subtitle: "Track permit status", icon: "award", route: "/permits", color: "#10B981" },
    ],
  },
  {
    title: "Team",
    tiles: [
      { label: "Contacts Directory", subtitle: "Clients, subs & vendors", icon: "book", route: "/contacts", color: "#C9A84C" },
      { label: "Team Management", subtitle: "Seats, roles & invites", icon: "users", route: "/settings", color: "#C9A84C" },
    ],
  },
];

export default function AdminHubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const firstName = me?.firstName ?? "there";

  function go(route: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.navigate(route as any);
  }

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

      {/* Tile Groups — full-width action rows, not a narrow tile grid, so
          longer labels (e.g. "Contacts Directory") never wrap. */}
      {TILE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{group.title}</Text>
          <Card padding="none">
            <View style={{ paddingHorizontal: 14 }}>
              {group.tiles.map((tile, i) => (
                <View key={tile.label} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
                  <ListRow
                    icon={tile.icon as any}
                    iconColor={tile.color}
                    title={tile.label}
                    subtitle={tile.subtitle}
                    onPress={() => go(tile.route)}
                    showChevron
                  />
                </View>
              ))}
            </View>
          </Card>
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
});
