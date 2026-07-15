import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { useOfflineQueue } from "@/context/OfflineQueueContext";
import { triggerVoiceFab } from "@/utils/voiceFabBus";
import { safeNavigate } from "@/utils/safeNavigate";
import { Card, ListRow } from "@/components/ui";
import { radius, spacing, typography } from "@/constants/theme";

type CaptureTile = {
  key: string;
  label: string;
  sublabel: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress?: () => void;
  comingSoon?: boolean;
};

export default function CaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const perms = usePermissions();
  const { pendingCount } = useOfflineQueue();

  function go(path: string, context: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    safeNavigate(router, path, context);
  }

  function openVoice() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerVoiceFab();
  }

  const primaryTiles: CaptureTile[] = [
    {
      key: "photo",
      label: "Photo",
      sublabel: "Site photo, tagged to a project",
      icon: "camera",
      color: colors.primary,
      onPress: () => go("/(tabs)/(home)/field-photo", "capture:photo"),
    },
    {
      key: "video",
      label: "Video",
      sublabel: "Coming soon",
      icon: "video",
      color: colors.mutedForeground,
      comingSoon: true,
    },
    {
      key: "voice",
      label: "Voice Note",
      sublabel: "Speak — we'll transcribe & route it",
      icon: "mic",
      color: colors.primary,
      onPress: openVoice,
    },
    {
      key: "inspection",
      label: "Inspection",
      sublabel: "Start a new checklist",
      icon: "check-square",
      color: colors.success,
      onPress: () => go("/inspect?action=new", "capture:inspection"),
    },
    {
      key: "safety",
      label: "Safety Report",
      sublabel: "Hazard or incident report",
      icon: "shield",
      color: colors.warning,
      onPress: () => go("/safety?initTab=new", "capture:safety"),
    },
    {
      key: "log",
      label: "Daily Log",
      sublabel: "Crew, weather, notes & photos",
      icon: "file-text",
      color: colors.primary,
      onPress: () => go("/(tabs)/(home)/log", "capture:log"),
    },
  ];

  const moreRows = [
    perms.viewPhotos
      ? {
          key: "photo-history",
          icon: "image" as const,
          title: "Photo History",
          subtitle: "View & manage uploaded site photos",
          onPress: () => go("/(tabs)/(home)/photo-history", "capture:photo-history"),
        }
      : null,
    {
      key: "signoff",
      icon: "check-circle" as const,
      title: "Safety Signoff",
      subtitle: "Daily PPE / hazard gatekeeper checklist",
      onPress: () => go("/(tabs)/(home)/field-safety", "capture:signoff"),
    },
    perms.viewRFIs
      ? {
          key: "rfi",
          icon: "alert-circle" as const,
          title: "New RFI",
          subtitle: "Ask a question, request info",
          onPress: () => go("/rfis", "capture:rfi"),
        }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 90 }}
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: colors.foreground }]}>Capture</Text>
        <Text style={[typography.body, { color: colors.mutedForeground, marginTop: 2 }]}>
          Log what's happening on site
        </Text>
      </View>

      {pendingCount > 0 ? (
        <Card
          onPress={() => go("/sync-queue", "capture:sync-queue")}
          style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg, borderColor: `${colors.warning}55` }}
        >
          <View style={styles.pendingRow}>
            <Feather name="cloud-off" size={16} color={colors.warning} />
            <Text style={[typography.captionMedium, { color: colors.foreground, flex: 1 }]}>
              {pendingCount} {pendingCount === 1 ? "item" : "items"} waiting to sync
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </Card>
      ) : null}

      <View style={styles.grid}>
        {primaryTiles.map((tile) => (
          <Card
            key={tile.key}
            padding="lg"
            onPress={tile.comingSoon ? undefined : tile.onPress}
            style={tile.comingSoon ? { opacity: 0.5 } : undefined}
          >
            <View style={styles.tileRow}>
              <View style={[styles.tileIcon, { backgroundColor: `${tile.color}1F` }]}>
                <Feather name={tile.icon} size={24} color={tile.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typography.heading, { color: colors.foreground }]} numberOfLines={1}>
                  {tile.label}
                </Text>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {tile.sublabel}
                </Text>
              </View>
              {!tile.comingSoon ? (
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              ) : null}
            </View>
          </Card>
        ))}
      </View>

      {moreRows.length > 0 ? (
        <View style={styles.moreSection}>
          <Text style={[typography.label, { color: colors.mutedForeground, marginBottom: spacing.sm }]}>
            MORE
          </Text>
          <Card padding="none">
            {moreRows.map((row, i) => (
              <View
                key={row.key}
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
              >
                <View style={{ paddingHorizontal: spacing.lg }}>
                  <ListRow
                    icon={row.icon}
                    title={row.title}
                    subtitle={row.subtitle}
                    onPress={row.onPress}
                    showChevron
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grid: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  moreSection: { paddingHorizontal: spacing.xl, marginTop: spacing.xxl },
});
