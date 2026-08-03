import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";
import { elevation, radius, spacing } from "@/constants/theme";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: "none" | "sm" | "md" | "lg";
  /**
   * Standalone cards float: lifted surface, soft shadow, translucent edge.
   * Pass `false` inside dense lists, where a stack of shadowed cards turns
   * into visual noise — those keep the original flat hairline treatment.
   */
  elevated?: boolean;
}

export function Card({ children, onPress, style, padding = "md", elevated = true }: CardProps) {
  const colors = useColors();
  const paddingValue = { none: 0, sm: spacing.md, md: spacing.xl, lg: spacing.xxl }[padding];

  const content = (
    <View
      style={[
        styles.base,
        elevated
          ? [{ backgroundColor: colors.cardElevated, borderColor: colors.borderSoft }, elevation.card]
          : { backgroundColor: colors.card, borderColor: colors.border },
        { padding: paddingValue },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
