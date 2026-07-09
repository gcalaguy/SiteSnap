import React from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  count?: number;
}

export function Chip({ label, selected = false, onPress, count }: ChipProps) {
  const colors = useColors();

  function handlePress() {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.secondary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          typography.captionMedium,
          { color: selected ? colors.primaryForeground : colors.foreground },
        ]}
        numberOfLines={1}
      >
        {label}
        {count != null ? ` (${count})` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
