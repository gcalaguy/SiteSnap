import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.foreground },
    ghost: { bg: "transparent", fg: colors.foreground, border: colors.border },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground },
  };
  const { bg, fg, border } = palette[variant];

  function handlePress() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        {
          // Filled buttons are pills; `ghost` keeps the card radius so it reads
          // as an outlined surface rather than a second solid action.
          borderRadius: variant === "ghost" ? radius.md : radius.full,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? "100%" : undefined,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Feather name={icon} size={size === "lg" ? 19 : 16} color={fg} /> : null}
          <Text style={[typography.bodyMedium, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  md: { paddingVertical: 14, paddingHorizontal: spacing.xxl },
  lg: { paddingVertical: 18, paddingHorizontal: spacing.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
