import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useGetMe,
  useGetBillingSeats,
  useGetEmailConfig,
  useGetQuickBooksStatus,
} from "@workspace/api-client-react";

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {label}
    </Text>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueColor,
  loading,
}: {
  icon: string;
  label: string;
  value?: string;
  valueColor?: string;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon as any} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Text
          style={[styles.rowValue, { color: valueColor ?? colors.mutedForeground }]}
          numberOfLines={1}
        >
          {value ?? "—"}
        </Text>
      )}
    </View>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: connected ? "#DCFCE7" : "#FEE2E2" },
      ]}
    >
      <Feather
        name={connected ? "check-circle" : "x-circle"}
        size={12}
        color={connected ? "#16A34A" : "#DC2626"}
      />
      <Text style={[styles.pillText, { color: connected ? "#16A34A" : "#DC2626" }]}>
        {connected ? "Connected" : "Not connected"}
      </Text>
    </View>
  );
}

function StatusRow({
  icon,
  label,
  connected,
  loading,
}: {
  icon: string;
  label: string;
  connected: boolean;
  loading?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon as any} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <StatusPill connected={connected} />
      )}
    </View>
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const { data: me } = useGetMe();

  const isOwner = me?.role === "owner";

  const {
    data: seats,
    isLoading: seatsLoading,
    refetch: refetchSeats,
  } = useGetBillingSeats({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isOwner } as any,
  });

  const {
    data: emailConfig,
    isLoading: emailLoading,
    refetch: refetchEmail,
  } = useGetEmailConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isOwner } as any,
  });

  const {
    data: qbStatus,
    isLoading: qbLoading,
    refetch: refetchQb,
  } = useGetQuickBooksStatus({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: isOwner } as any,
  });

  const [refreshing, setRefreshing] = React.useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchSeats(), refetchEmail(), refetchQb()]);
    setRefreshing(false);
  }

  if (me?.role !== "owner") {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[styles.restrictedText, { color: colors.mutedForeground }]}>
          Only company owners can access Settings.
        </Text>
      </View>
    );
  }

  const seatsLabel =
    seats != null
      ? `${seats.currentSeats} / ${seats.maxSeats === "unlimited" ? "∞" : seats.maxSeats} seats`
      : undefined;

  const planLabel =
    seats?.planName
      ? `${seats.planName}${seats.subscriptionStatus ? ` · ${seats.subscriptionStatus}` : ""}`
      : seats?.subscriptionStatus ?? undefined;

  const qbRealmId = qbStatus?.connection?.realmId;
  const lastInvoiceSync = formatDate(qbStatus?.connection?.lastInvoiceSyncAt);
  const lastCostSync = formatDate(qbStatus?.connection?.lastCostSyncAt);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topInsets + 16, backgroundColor: colors.sidebar, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Company Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Billing & Seats */}
      <View style={styles.section}>
        <SectionHeader label="Billing & Seats" />
        <InfoRow
          icon="users"
          label="Seat Usage"
          value={seatsLabel}
          loading={seatsLoading}
        />
        {(seats?.planName || seats?.subscriptionStatus) && (
          <InfoRow
            icon="credit-card"
            label="Plan"
            value={planLabel}
            loading={seatsLoading}
          />
        )}
        <InfoRow
          icon="plus-circle"
          label="Can Add More Members"
          value={seats != null ? (seats.canAddMore ? "Yes" : "No — limit reached") : undefined}
          valueColor={
            seats != null
              ? seats.canAddMore
                ? "#16A34A"
                : "#DC2626"
              : undefined
          }
          loading={seatsLoading}
        />
      </View>

      {/* Email Configuration */}
      <View style={styles.section}>
        <SectionHeader label="Outbound Email" />
        <InfoRow
          icon="mail"
          label="From Address"
          value={emailConfig?.fromEmail}
          loading={emailLoading}
        />
        <StatusRow
          icon="key"
          label="Resend API Key"
          connected={emailConfig?.resendKeySet ?? false}
          loading={emailLoading}
        />
        <StatusRow
          icon="globe"
          label="Custom Domain"
          connected={emailConfig?.isCustomDomain ?? false}
          loading={emailLoading}
        />
      </View>

      {/* QuickBooks */}
      <View style={styles.section}>
        <SectionHeader label="QuickBooks Integration" />
        <StatusRow
          icon="link"
          label="Connection Status"
          connected={qbStatus?.connected ?? false}
          loading={qbLoading}
        />
        {qbStatus?.connected && (
          <>
            {qbRealmId && (
              <InfoRow
                icon="hash"
                label="Realm ID"
                value={qbRealmId}
                loading={qbLoading}
              />
            )}
            {lastInvoiceSync && (
              <InfoRow
                icon="file-text"
                label="Last Invoice Sync"
                value={lastInvoiceSync}
                loading={qbLoading}
              />
            )}
            {lastCostSync && (
              <InfoRow
                icon="dollar-sign"
                label="Last Cost Sync"
                value={lastCostSync}
                loading={qbLoading}
              />
            )}
            {qbStatus.connection?.syncedInvoiceCount != null && (
              <InfoRow
                icon="check-square"
                label="Synced Invoices"
                value={String(qbStatus.connection.syncedInvoiceCount)}
                loading={qbLoading}
              />
            )}
          </>
        )}
        {!qbLoading && !qbStatus?.connected && (
          <View style={[styles.qbHint, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.qbHintText, { color: colors.mutedForeground }]}>
              Connect QuickBooks from the web dashboard under Settings to sync invoices and costs.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  restrictedText: {
    fontSize: 15,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  rowValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    maxWidth: 160,
    textAlign: "right",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  qbHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 2,
  },
  qbHintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
