import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

export type BadgeStatus = "success" | "warning" | "critical" | "neutral";

interface BadgeProps {
  label: string;
  status?: BadgeStatus;
}

export function Badge({ label, status = "neutral" }: BadgeProps) {
  const colors = useColors();
  const tone: Record<BadgeStatus, string> = {
    success: colors.success,
    warning: colors.warning,
    critical: colors.destructive,
    neutral: colors.mutedForeground,
  };
  const color = tone[status];

  return (
    <View style={[styles.badge, { backgroundColor: `${color}1F` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[typography.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
