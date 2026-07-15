import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { radius, spacing, typography } from "@/constants/theme";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";

function fmtCAD(v: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

interface CostRecordCardProps {
  vendorName: string | null;
  description: string;
  amount: number;
  tone: StatusTone;
  statusLabel: string;
  projectName: string;
  date: string;
  hasReceipt?: boolean;
  onPress?: () => void;
}

// Mirrors ChangeOrderCard's layout so Financials reads as one system across
// record types — status pill leads, value is large and right-aligned, meta
// collapses to one muted line. The receipt-attached indicator replaces the
// old inline "· Receipt attached" text suffix with an icon, since that text
// tail was the thing pushing the meta line to wrap on smaller phones.
export function CostRecordCard({ vendorName, description, amount, tone, statusLabel, projectName, date, hasReceipt, onPress }: CostRecordCardProps) {
  const colors = useColors();

  function handlePress() {
    if (!onPress) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed && onPress ? 0.85 : 1 },
      ]}
    >
      <View style={styles.topRow}>
        <StatusPill tone={tone} label={statusLabel} />
        {hasReceipt ? <Feather name="paperclip" size={14} color={colors.mutedForeground} /> : null}
      </View>

      <Text style={[typography.heading, { color: colors.foreground }]} numberOfLines={1}>
        {vendorName ?? description}
      </Text>
      {vendorName ? (
        <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
          {description}
        </Text>
      ) : null}

      <View style={styles.bottomRow}>
        <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
          {projectName}  ·  {fmtDate(date)}
        </Text>
        <Text style={[typography.title, { color: colors.foreground }]}>{fmtCAD(amount)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
});
