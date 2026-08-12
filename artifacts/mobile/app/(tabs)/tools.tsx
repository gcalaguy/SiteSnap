import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { safeNavigate } from "@/utils/safeNavigate";
import { MediaCard } from "@/components/ui";
import { spacing, typography } from "@/constants/theme";

type ToolItem = { key: string; icon: keyof typeof Feather.glyphMap; label: string; subtitle: string; onPress: () => void };

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const perms = usePermissions();

  const toolItems: ToolItem[] = [
    { key: "capture", icon: "camera", label: "Capture", subtitle: "Photos, voice notes, inspections & reports", onPress: () => safeNavigate(router, "/capture", "tools:capture") },
    { key: "calculators", icon: "percent", label: "Trade Calculators", subtitle: "Concrete · Electrical · Plumbing · Roofing", onPress: () => safeNavigate(router, "/calculators", "tools:calculators") },
    perms.viewEstimator && { key: "estimator", icon: "bar-chart-2", label: "Estimator", subtitle: "Speak or type to build a detailed estimate", onPress: () => safeNavigate(router, "/estimator", "tools:estimator") },
    perms.viewVault && { key: "vault", icon: "lock", label: "Vault", subtitle: "Secure document storage", onPress: () => safeNavigate(router, "/vault", "tools:vault") },
    perms.viewReports && { key: "reports", icon: "file-text", label: "Daily Reports", subtitle: "Browse past submissions", onPress: () => safeNavigate(router, "/(tabs)/(home)/reports", "tools:reports") },
    perms.viewSafetyTab && { key: "scan-photo-history", icon: "clock", label: "Scan Photo History", subtitle: "Review or remove your AI Safety Scan photos", onPress: () => safeNavigate(router, "/(tabs)/(home)/scan-photo-history", "tools:scan-photo-history") },
    perms.submitExpenses && { key: "expenses", icon: "credit-card", label: "Expenses", subtitle: "Submit & track job costs", onPress: () => safeNavigate(router, "/expenses", "tools:expenses") },
    perms.viewAskAI && { key: "ask-ai", icon: "message-circle", label: "Ask AI", subtitle: "Chat with your project assistant", onPress: () => safeNavigate(router, "/(tabs)/(home)/ask", "tools:ask-ai") },
    perms.viewRiskTab && { key: "risk", icon: "alert-triangle", label: "Risk", subtitle: "Top risks & open alerts", onPress: () => safeNavigate(router, "/risk", "tools:risk") },
    perms.viewTradeHub && { key: "tradehub", icon: "globe", label: "TradeHub", subtitle: "Community jobs & discussion", onPress: () => safeNavigate(router, "/tradehub", "tools:tradehub") },
    perms.viewProjectCommunications && { key: "uncategorized-emails", icon: "inbox", label: "Uncategorized Emails", subtitle: "Emails waiting to be filed to a project", onPress: () => safeNavigate(router, "/uncategorized-emails", "tools:uncategorized-emails") },
    perms.viewProjectCommunications && { key: "communications-search", icon: "search", label: "Search Builder", subtitle: "Build and save reusable email searches", onPress: () => safeNavigate(router, "/communications-search", "tools:communications-search") },
  ].filter((i): i is ToolItem => !!i);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 90 }}
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: colors.foreground }]}>Browse Tools</Text>
        <Text style={[typography.body, { color: colors.mutedForeground, marginTop: 2 }]}>
          Everything else you need, in one place
        </Text>
      </View>

      <View style={styles.toolGrid}>
        {toolItems.map((item) => (
          <MediaCard
            key={item.key}
            size="compact"
            seed={item.key}
            fallbackIcon={item.icon}
            title={item.label}
            onPress={item.onPress}
            style={styles.toolTile}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xl },
  // Two per row: half the width minus half the gap.
  toolTile: { width: "48%", flexGrow: 1 },
});
