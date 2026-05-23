import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useGetMe,
  useGetBillingSeats,
  useGetEmailConfig,
  useGetQuickBooksStatus,
  useUpdateEmailConfig,
  getGetEmailConfigQueryKey,
  getQuickBooksAuthUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
        {connected ? "Connected" : "Not configured"}
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

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={false}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const { mutateAsync: updateEmail, isPending: emailSaving } = useUpdateEmailConfig();

  const [refreshing, setRefreshing] = React.useState(false);

  // Email edit state
  const [editEmail, setEditEmail] = React.useState(false);
  const [fromEmailInput, setFromEmailInput] = React.useState("");
  const [resendKeyInput, setResendKeyInput] = React.useState("");

  // QB reconnect state
  const [qbConnecting, setQbConnecting] = React.useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchSeats(), refetchEmail(), refetchQb()]);
    setRefreshing(false);
  }

  function openEmailEdit() {
    setFromEmailInput(
      emailConfig?.isCustomDomain && emailConfig.fromEmail ? emailConfig.fromEmail : ""
    );
    setResendKeyInput("");
    setEditEmail(true);
  }

  function cancelEmailEdit() {
    setEditEmail(false);
    setFromEmailInput("");
    setResendKeyInput("");
  }

  async function handleSaveEmail() {
    const payload: { fromEmail?: string | null; resendApiKey?: string | null } = {};
    if (fromEmailInput.trim() !== "") payload.fromEmail = fromEmailInput.trim();
    else payload.fromEmail = null;
    if (resendKeyInput.trim() !== "") payload.resendApiKey = resendKeyInput.trim();

    if (Object.keys(payload).length === 0) {
      cancelEmailEdit();
      return;
    }

    try {
      await updateEmail({ data: payload });
      await queryClient.invalidateQueries({ queryKey: getGetEmailConfigQueryKey() });
      setEditEmail(false);
      setFromEmailInput("");
      setResendKeyInput("");
    } catch {
      Alert.alert("Save Failed", "Could not update email settings. Please try again.");
    }
  }

  async function handleQbConnect() {
    setQbConnecting(true);
    try {
      const result = await getQuickBooksAuthUrl();
      await WebBrowser.openBrowserAsync(result.url);
    } catch {
      Alert.alert("Connection Failed", "Could not fetch the QuickBooks authorization URL. Please try again.");
    } finally {
      setQbConnecting(false);
    }
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
        {!seatsLoading &&
          seats != null &&
          seats.maxSeats !== "unlimited" &&
          seats.currentSeats / Number(seats.maxSeats) >= 0.8 && (
            <View style={[styles.seatWarningBanner, { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }]}>
              <Feather name="alert-triangle" size={15} color="#D97706" />
              <Text style={styles.seatWarningText}>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: "#92400E" }}>Seats nearly full — </Text>
                <Text style={{ color: "#B45309" }}>
                  {seats.currentSeats} of {seats.maxSeats} seats used. Consider upgrading your plan.
                </Text>
              </Text>
            </View>
          )}
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
        <View style={styles.sectionHeaderRow}>
          <SectionHeader label="Outbound Email" />
          {!emailLoading && !editEmail && (
            <Pressable onPress={openEmailEdit} style={styles.editBtn} hitSlop={8}>
              <Feather name="edit-2" size={13} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
            </Pressable>
          )}
        </View>

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

        {editEmail && (
          <View
            style={[styles.editForm, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.editFormTitle, { color: colors.foreground }]}>
              Update Email Settings
            </Text>
            <EditField
              label="From Email Address"
              value={fromEmailInput}
              onChangeText={setFromEmailInput}
              placeholder="e.g. Site Snap <noreply@yourcompany.ca>"
              keyboardType="email-address"
            />
            <EditField
              label="Resend API Key"
              value={resendKeyInput}
              onChangeText={setResendKeyInput}
              placeholder="re_xxxxxxxxxxxxxxxxxxxx (leave blank to keep existing)"
              secureTextEntry
            />
            <Text style={[styles.editFormHint, { color: colors.mutedForeground }]}>
              Leave the API key blank to keep the existing key. Clear the from address to reset to the Resend default.
            </Text>
            <View style={styles.editFormActions}>
              <Pressable
                onPress={cancelEmailEdit}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                disabled={emailSaving}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEmail}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: emailSaving ? 0.7 : 1 }]}
                disabled={emailSaving}
              >
                {emailSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
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

        {!qbLoading && (
          <Pressable
            onPress={handleQbConnect}
            disabled={qbConnecting}
            style={[
              styles.qbBtn,
              {
                backgroundColor: qbStatus?.connected ? colors.muted : colors.primary,
                borderColor: qbStatus?.connected ? colors.border : "transparent",
                opacity: qbConnecting ? 0.7 : 1,
              },
            ]}
          >
            {qbConnecting ? (
              <ActivityIndicator size="small" color={qbStatus?.connected ? colors.foreground : "#FFFFFF"} />
            ) : (
              <>
                <Feather
                  name="refresh-cw"
                  size={15}
                  color={qbStatus?.connected ? colors.foreground : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.qbBtnText,
                    { color: qbStatus?.connected ? colors.foreground : "#FFFFFF" },
                  ]}
                >
                  {qbStatus?.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                </Text>
              </>
            )}
          </Pressable>
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  editBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
  editForm: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 4,
  },
  editFormTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  fieldWrapper: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  editFormHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  editFormActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  qbBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13,
    marginTop: 4,
  },
  qbBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  seatWarningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  seatWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
