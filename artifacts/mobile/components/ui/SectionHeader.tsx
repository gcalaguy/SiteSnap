import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { spacing, typography } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  /**
   * Spaced uppercase kicker rendered above the title. Screens used to inline
   * this as a bare `<Text style={typography.label}>TODAY'S PRIORITIES</Text>`
   * block sitting in its own padded `View`; folding it into the header keeps
   * the eyebrow/title gap consistent instead of set per-screen.
   */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, eyebrow, actionLabel, onAction }: SectionHeaderProps) {
  const colors = useColors();

  function handlePress() {
    if (!onAction) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction();
  }

  return (
    <View style={styles.header}>
      <View style={styles.titleCol}>
        {eyebrow ? (
          <Text style={[typography.label, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text>
        ) : null}
        <Text style={[typography.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={handlePress} hitSlop={8}>
          <Text style={[typography.captionMedium, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.lg,
  },
  titleCol: { flex: 1, gap: spacing.xs },
});
