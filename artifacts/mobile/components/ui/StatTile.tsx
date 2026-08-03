import React from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { elevation, radius, spacing, typography } from "@/constants/theme";
import type { BadgeStatus } from "./Badge";

interface StatTileProps {
  label: string;
  value: string | number;
  status?: BadgeStatus;
  onPress?: () => void;
}

// Compact single-number tile — replaces the old SummaryCard grid (icon
// header + big number + subtitle + chevron, each in its own bordered/shadowed
// box) with a lighter, denser row of numbers. Used on the redesigned Home
// screen's "Today's Priorities".
export function StatTile({ label, value, status = "neutral", onPress }: StatTileProps) {
  const colors = useColors();
  const tone: Record<BadgeStatus, string> = {
    success: colors.success,
    warning: colors.warning,
    critical: colors.destructive,
    neutral: colors.foreground,
  };

  function handlePress() {
    if (!onPress) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      style={({ pressed }) => [
        styles.tile,
        elevation.card,
        { backgroundColor: colors.cardElevated, borderColor: colors.borderSoft, opacity: pressed && onPress ? 0.85 : 1 },
      ]}
    >
      <Text style={[typography.display, { color: tone[status] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    gap: 6,
  },
});
