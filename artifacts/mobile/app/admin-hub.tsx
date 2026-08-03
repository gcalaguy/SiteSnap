import React from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useGetMe, useListProjects, useListCompanyMembers } from "@workspace/api-client-react";
import { Card, ListRow, StatPill } from "@/components/ui";
import { radius, spacing, typography } from "@/constants/theme";

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
  const { data: projects } = useListProjects();
  const { data: members } = useListCompanyMembers(me?.activeCompanyId ?? 0);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const roleLabel = me?.role ? me.role.replace(/_/g, " ").toUpperCase() : "TEAM";
  const staffCount = members?.length ?? 0;
  const activeProjectCount = projects?.filter((p) => p.status === "active").length ?? 0;

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
      <View style={[styles.header, { paddingTop: topInset + 20 }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={[typography.label, { color: colors.primary }]}>{roleLabel}</Text>
          <Text style={[typography.display, { color: colors.foreground }]}>Management</Text>
        </View>
        <Pressable
          onPress={() => go("/settings")}
          hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="settings" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Stats */}
      <View style={styles.statRow}>
        <StatPill label="Active Staff" value={staffCount} tone={colors.success} />
        <StatPill label="Active Projects" value={activeProjectCount} tone={colors.primary} />
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerTitleBlock: { flex: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
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
