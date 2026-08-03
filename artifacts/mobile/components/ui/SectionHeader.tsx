import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { spacing, typography } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const colors = useColors();

  function handlePress() {
    if (!onAction) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction();
  }

  return (
    <View style={styles.header}>
      <Text style={[typography.heading, { color: colors.foreground }]}>{title}</Text>
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
    alignItems: "center",
    marginBottom: spacing.md,
  },
});
