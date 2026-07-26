import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface GpsLockInfo {
  siteAddress: string | null;
  capturedAt: Date;
  timezone: string | null;
}

interface Props {
  loading: boolean;
  denied?: boolean;
  info: GpsLockInfo | null;
}

/** "GPS Locked • 123 Main St • Jul 26, 2026 2:30 PM EST" status banner. */
export function GpsLockedBanner({ loading, denied, info }: Props) {
  const colors = useColors();

  if (denied) {
    return (
      <View style={[styles.banner, { backgroundColor: `${colors.destructive}1F` }]}>
        <Feather name="alert-triangle" size={13} color={colors.destructive} />
        <Text style={[styles.text, { color: colors.destructive }]} numberOfLines={1}>
          Location unavailable — scan will proceed without a GPS tag
        </Text>
      </View>
    );
  }

  if (loading || !info) {
    return (
      <View style={[styles.banner, { backgroundColor: `${colors.mutedForeground}1F` }]}>
        <ActivityIndicator size="small" color={colors.mutedForeground} />
        <Text style={[styles.text, { color: colors.mutedForeground }]}>Locking GPS…</Text>
      </View>
    );
  }

  const dateLabel = info.capturedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(info.timezone ? { timeZone: info.timezone, timeZoneName: "short" } : {}),
  });

  return (
    <View style={[styles.banner, { backgroundColor: `${colors.success}1F` }]}>
      <Feather name="map-pin" size={13} color={colors.success} />
      <Text style={[styles.text, { color: colors.success }]} numberOfLines={1} ellipsizeMode="tail">
        GPS Locked{info.siteAddress ? ` • ${info.siteAddress}` : ""} • {dateLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  text: { fontSize: 12, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
});
