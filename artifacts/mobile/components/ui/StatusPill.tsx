import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";

// The 4-state system every dense-data card in the app (Change Orders, Cost
// Records, Quotes, Invoices) maps its domain-specific status into. Distinct
// from Badge (dot + label, for secondary/inline chrome) — StatusPill is the
// bold, filled treatment the redesign brief calls for as the primary status
// signal on a card, sized for a comfortable tap target when it's also a
// filter chip.
export type StatusTone = "approved" | "pending" | "draft" | "void";

const TONE_ICON: Record<StatusTone, keyof typeof Feather.glyphMap> = {
  approved: "check-circle",
  pending: "clock",
  draft: "edit-3",
  void: "slash",
};

const TONE_DEFAULT_LABEL: Record<StatusTone, string> = {
  approved: "Approved",
  pending: "Pending",
  draft: "Draft",
  void: "Void",
};

interface StatusPillProps {
  tone: StatusTone;
  label?: string;
  size?: "sm" | "md";
}

export function StatusPill({ tone, label, size = "md" }: StatusPillProps) {
  const colors = useColors();
  const toneColor: Record<StatusTone, string> = {
    approved: colors.success,
    pending: colors.warning,
    draft: colors.draft,
    void: colors.destructive,
  };
  const color = toneColor[tone];
  const isSm = size === "sm";

  return (
    <View
      style={[
        styles.pill,
        isSm ? styles.sm : styles.md,
        { backgroundColor: `${color}26`, borderColor: `${color}40` },
      ]}
    >
      <Feather name={TONE_ICON[tone]} size={isSm ? 11 : 12} color={color} />
      <Text style={[isSm ? typography.label : typography.captionMedium, { color }]} numberOfLines={1}>
        {label ?? TONE_DEFAULT_LABEL[tone]}
      </Text>
    </View>
  );
}

export function statusTone(status: string, mapping: Partial<Record<string, StatusTone>>): StatusTone {
  return mapping[status] ?? "draft";
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  md: { paddingVertical: 5, paddingHorizontal: spacing.md },
  sm: { paddingVertical: 3, paddingHorizontal: spacing.sm },
});
