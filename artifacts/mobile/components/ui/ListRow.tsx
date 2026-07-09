import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

interface ListRowProps {
  icon?: keyof typeof Feather.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}

// The "icon + title/subtitle + trailing" row repeated (with slightly
// different styling each time) across tasks/projects/safety/inspect/activity
// feeds. One shared component instead of five near-identical local ones.
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  trailing,
  onPress,
  showChevron = false,
}: ListRowProps) {
  const colors = useColors();
  const tint = iconColor ?? colors.primary;

  function handlePress() {
    if (!onPress) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.7 : 1 }]}
    >
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: `${tint}1A` }]}>
          <Feather name={icon} size={17} color={tint} />
        </View>
      ) : null}
      <View style={styles.textCol}>
        <Text style={[typography.bodyMedium, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, gap: 2 },
});
