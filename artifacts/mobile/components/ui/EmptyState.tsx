import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { spacing, typography } from "@/constants/theme";

interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={28} color={colors.mutedForeground} />
      <Text style={[typography.bodyMedium, { color: colors.foreground, marginTop: spacing.md }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[typography.caption, { color: colors.mutedForeground, marginTop: 4, textAlign: "center" }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
});
