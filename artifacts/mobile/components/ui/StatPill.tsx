import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

interface StatPillProps {
  label: string;
  value: string | number;
  tone: string;
}

// Filled, tinted counterpart to StatTile — for stats that should read as a
// colored chip at a glance (admin-hub's staff/project counts) rather than
// sit in a bordered outline tile.
export function StatPill({ label, value, tone }: StatPillProps) {
  const colors = useColors();

  return (
    <View style={[styles.pill, { backgroundColor: `${tone}22` }]}>
      <Text style={[typography.title, { color: tone }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
});
