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

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

interface ChangeOrderCardProps {
  title: string;
  projectName: string;
  amount: number;
  tone: StatusTone;
  statusLabel: string;
  date: string | null;
  signed?: boolean;
  onPress: () => void;
}

// The card the Change Orders / Cost Analysis lists are built from — status
// pill leads (it's the thing a foreman scans for first), value sits large
// and right-aligned since that's the second thing anyone checks, and
// project/date collapse into one muted meta line rather than each getting
// their own row. Tap target is the full card, not just a chevron.
export function ChangeOrderCard({ title, projectName, amount, tone, statusLabel, date, signed, onPress }: ChangeOrderCardProps) {
  const colors = useColors();

  function handlePress() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.topRow}>
        <StatusPill tone={tone} label={statusLabel} />
        {signed ? <Feather name="edit-3" size={14} color={colors.mutedForeground} /> : null}
      </View>

      <Text style={[typography.heading, { color: colors.foreground }]} numberOfLines={2}>
        {title}
      </Text>

      <View style={styles.bottomRow}>
        <View style={styles.metaCol}>
          <Text style={[typography.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
            {projectName}
            {date ? `  ·  ${fmtDate(date)}` : ""}
          </Text>
        </View>
        <Text style={[typography.title, { color: colors.primary }]}>{fmtCAD(amount)}</Text>
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
  metaCol: { flex: 1, minWidth: 0 },
});
