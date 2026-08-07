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

interface FinancialDocCardProps {
  docNumber: string;
  title: string;
  clientName: string;
  amount: number;
  tone: StatusTone;
  statusLabel: string;
  signed?: boolean;
  onPress: () => void;
}

// Quotes and Invoices card — same anatomy as ChangeOrderCard/CostRecordCard so
// Financials reads as one system across every record type. The meta line uses
// docNumber + clientName rather than project/date: unlike Change Orders and
// Cost Records, these are client-facing billing documents where the client is
// the thing a foreman confirms, not the project (already implied by context).
export function FinancialDocCard({ docNumber, title, clientName, amount, tone, statusLabel, signed, onPress }: FinancialDocCardProps) {
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
            {docNumber}  ·  {clientName}
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
