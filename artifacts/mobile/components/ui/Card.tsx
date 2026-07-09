import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";
import { radius, spacing } from "@/constants/theme";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: "none" | "sm" | "md" | "lg";
}

// Deliberately flat: no shadow, a single hairline border. The redesign brief
// calls out "excessive shadows / nested cards" as the thing to eliminate —
// depth comes from spacing and the background/card contrast, not elevation.
export function Card({ children, onPress, style, padding = "md" }: CardProps) {
  const colors = useColors();
  const paddingValue = { none: 0, sm: spacing.sm, md: spacing.lg, lg: spacing.xl }[padding];

  const content = (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.card, borderColor: colors.border, padding: paddingValue },
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
