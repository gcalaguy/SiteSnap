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
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useGetMe,
  useGetEmailIntegrationsStatus,
  getGetEmailIntegrationsStatusQueryKey,
  getEmailIntegrationsOutlookAuthUrl,
  getEmailIntegrationsGmailAuthUrl,
  useListEmailIntegrationFolders,
  useUpdateEmailIntegrationAccount,
  useDisconnectEmailIntegrationAccount,
  useSyncEmailIntegrationAccountNow,
  type EmailAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const FREQUENCY_OPTIONS: Array<{ value: EmailAccount["syncFrequency"]; label: string }> = [
  { value: "15min", label: "Every 15 min" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
];

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>{label}</Text>
  );
}

function StatusPill({ status }: { status: EmailAccount["status"] | "not_connected" }) {
  const tone =
    status === "active"
      ? { bg: "#DCFCE7", fg: "#16A34A", icon: "check-circle" as const, label: "Connected" }
      : status === "reauth_required"
      ? { bg: "#FEF3C7", fg: "#D97706", icon: "alert-triangle" as const, label: "Reauth needed" }
      : status === "error"
      ? { bg: "#FEE2E2", fg: "#DC2626", icon: "x-circle" as const, label: "Error" }
      : { bg: "#FEE2E2", fg: "#DC2626", icon: "x-circle" as const, label: "Not connected" };

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Feather name={tone.icon} size={12} color={tone.fg} />
      <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function ProviderCard({
  provider,
  label,
  icon,
  configured,
  account,
  onRefetch,
}: {
  provider: "outlook" | "gmail";
  label: string;
  icon: keyof typeof Feather.glyphMap;
  configured: boolean;
  account?: EmailAccount;
  onRefetch: () => void;
}) {
  const colors = useColors();
  const [connecting, setConnecting] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [showFolders, setShowFolders] = React.useState(false);

  const { data: folderData, isLoading: foldersLoading } = useListEmailIntegrationFolders(
    account?.id ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: showFolders && !!account } } as any,
  );

  const { mutateAsync: updateAccount, isPending: updating } = useUpdateEmailIntegrationAccount();
  const { mutateAsync: disconnectAccount, isPending: disconnecting } =
    useDisconnectEmailIntegrationAccount();
  const { mutateAsync: syncNow } = useSyncEmailIntegrationAccountNow();

  async function handleConnect() {
    setConnecting(true);
    try {
      const result =
        provider === "outlook"
          ? await getEmailIntegrationsOutlookAuthUrl()
          : await getEmailIntegrationsGmailAuthUrl();
      await WebBrowser.openBrowserAsync(result.url);
    } catch {
      Alert.alert("Connection Failed", `Could not fetch the ${label} authorization URL. Please try again.`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!account) return;
    Alert.alert(`Disconnect ${label}?`, "Synced emails already stored will be kept, but syncing will stop.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          try {
            await disconnectAccount({ accountId: account.id });
            onRefetch();
          } catch {
            Alert.alert("Failed", "Could not disconnect. Please try again.");
          }
        },
      },
    ]);
  }

  async function handleSyncNow() {
    if (!account) return;
    setSyncing(true);
    try {
      await syncNow({ accountId: account.id });
      onRefetch();
    } catch {
      Alert.alert("Sync Failed", "Could not sync now. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFrequencyChange(freq: EmailAccount["syncFrequency"]) {
    if (!account) return;
    try {
      await updateAccount({ accountId: account.id, data: { syncFrequency: freq } });
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not update sync frequency. Please try again.");
    }
  }

  async function toggleFolder(folderId: string) {
    if (!account) return;
    const current = (account.selectedFolders as string[] | null) ?? [];
    const next = current.includes(folderId)
      ? current.filter((f) => f !== folderId)
      : [...current, folderId];
    try {
      await updateAccount({ accountId: account.id, data: { selectedFolders: next } });
      onRefetch();
    } catch {
      Alert.alert("Failed", "Could not update folder selection. Please try again.");
    }
  }

  const isConnected = account?.status === "active" || account?.status === "reauth_required" || account?.status === "error";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeaderRow}>
        <View style={[styles.rowIcon, { backgroundColor: colors.muted }]}>
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{label}</Text>
          {account?.emailAddress && (
            <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {account.emailAddress}
            </Text>
          )}
        </View>
        <StatusPill status={account?.status ?? "not_connected"} />
      </View>

      {!configured && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Not configured on the server yet — ask an administrator to set up {label} OAuth credentials.
        </Text>
      )}

      {isConnected && account && (
        <>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Last synced</Text>
            <Text style={[styles.metaValue, { color: colors.foreground }]}>
              {formatDateTime(account.lastSyncAt) ?? "Never"}
            </Text>
          </View>
          {account.lastSyncError && (
            <Text style={[styles.errorText, { color: "#DC2626" }]} numberOfLines={2}>
              {account.lastSyncError}
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Sync frequency</Text>
          <View style={styles.freqRow}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => handleFrequencyChange(opt.value)}
                disabled={updating}
                style={[
                  styles.freqChip,
                  {
                    backgroundColor: account.syncFrequency === opt.value ? colors.primary : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.freqChipText,
                    { color: account.syncFrequency === opt.value ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setShowFolders((v) => !v)} style={styles.foldersToggle}>
            <Feather name={showFolders ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
            <Text style={[styles.foldersToggleText, { color: colors.primary }]}>
              {showFolders ? "Hide folders" : "Choose folders to sync"}
            </Text>
          </Pressable>
          {showFolders && (
            <View style={styles.foldersList}>
              {foldersLoading ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                (folderData?.folders ?? []).map((folder) => {
                  const selected = ((account.selectedFolders as string[] | null) ?? []).includes(folder.id);
                  return (
                    <Pressable
                      key={folder.id}
                      onPress={() => toggleFolder(folder.id)}
                      style={styles.folderRow}
                    >
                      <Feather
                        name={selected ? "check-square" : "square"}
                        size={16}
                        color={selected ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.folderRowText, { color: colors.foreground }]}>{folder.name}</Text>
                    </Pressable>
                  );
                })
              )}
              {!foldersLoading && (account.selectedFolders == null || (account.selectedFolders as string[]).length === 0) && (
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  No folders selected yet — syncing the default inbox.
                </Text>
              )}
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleSyncNow}
              disabled={syncing}
              style={[styles.secondaryBtn, { borderColor: colors.border, opacity: syncing ? 0.7 : 1 }]}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <>
                  <Feather name="refresh-cw" size={14} color={colors.foreground} />
                  <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Sync Now</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleDisconnect}
              disabled={disconnecting}
              style={[styles.destructiveBtn, { borderColor: "#FCA5A5", opacity: disconnecting ? 0.7 : 1 }]}
            >
              <Feather name="x" size={14} color="#DC2626" />
              <Text style={styles.destructiveBtnText}>Disconnect</Text>
            </Pressable>
          </View>
        </>
      )}

      {!isConnected && configured && (
        <Pressable
          onPress={handleConnect}
          disabled={connecting}
          style={[styles.connectBtn, { backgroundColor: colors.primary, opacity: connecting ? 0.7 : 1 }]}
        >
          {connecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name={icon} size={15} color="#FFFFFF" />
              <Text style={styles.connectBtnText}>Connect {label}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function EmailIntegrationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  const { data: me } = useGetMe();
  const isOwner = me?.role === "owner";

  const {
    data: status,
    isLoading,
    refetch,
  } = useGetEmailIntegrationsStatus(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: isOwner } } as any,
  );

  const [refreshing, setRefreshing] = React.useState(false);

  // The OAuth connect flow completes in an external browser tab — refetch
  // status whenever this screen regains focus so a fresh connection shows up
  // without the user having to manually pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: getGetEmailIntegrationsStatusQueryKey() });
    }, [queryClient]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function refetchStatus() {
    queryClient.invalidateQueries({ queryKey: getGetEmailIntegrationsStatusQueryKey() });
  }

  if (!isOwner) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={[styles.restrictedText, { color: colors.mutedForeground }]}>
          Only company owners can manage Email Integrations.
        </Text>
      </View>
    );
  }

  const outlookAccount = status?.accounts.find((a) => a.provider === "outlook" && a.status !== "disconnected");
  const gmailAccount = status?.accounts.find((a) => a.provider === "gmail" && a.status !== "disconnected");

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <View
        style={[
          styles.header,
          { paddingTop: topInsets + 16, backgroundColor: colors.sidebar, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Email Integrations</Text>
        <View style={{ width: 34 }} />
      </View>

      <View style={styles.section}>
        <SectionHeader label="Connected Mailboxes" />
        <Text style={[styles.introText, { color: colors.mutedForeground }]}>
          Connect a mailbox to sync project-relevant emails into Project Communications. Only
          read access is requested — SiteSnap never sends email on your behalf.
        </Text>

        {isLoading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginTop: 12 }} />
        ) : (
          <>
            <ProviderCard
              provider="outlook"
              label="Outlook"
              icon="mail"
              configured={status?.outlookConfigured ?? false}
              account={outlookAccount}
              onRefetch={refetchStatus}
            />
            <ProviderCard
              provider="gmail"
              label="Gmail"
              icon="at-sign"
              configured={status?.gmailConfigured ?? false}
              account={gmailAccount}
              onRefetch={refetchStatus}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontFamily: "NunitoSans_400Regular",
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
    fontFamily: "NunitoSans_600SemiBold",
    color: "#FFFFFF",
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "NunitoSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  introText: {
    fontSize: 13,
    fontFamily: "NunitoSans_400Regular",
    lineHeight: 18,
    marginBottom: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "NunitoSans_600SemiBold",
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
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
    fontFamily: "NunitoSans_600SemiBold",
  },
  hint: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: "NunitoSans_500Medium",
  },
  metaValue: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "NunitoSans_500Medium",
    marginTop: 4,
  },
  freqRow: {
    flexDirection: "row",
    gap: 6,
  },
  freqChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  freqChipText: {
    fontSize: 12,
    fontFamily: "NunitoSans_500Medium",
  },
  foldersToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  foldersToggleText: {
    fontSize: 12,
    fontFamily: "NunitoSans_500Medium",
  },
  foldersList: {
    gap: 6,
    marginTop: 2,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  folderRowText: {
    fontSize: 13,
    fontFamily: "NunitoSans_400Regular",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: "NunitoSans_600SemiBold",
  },
  destructiveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
  },
  destructiveBtnText: {
    fontSize: 13,
    fontFamily: "NunitoSans_600SemiBold",
    color: "#DC2626",
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 13,
  },
  connectBtnText: {
    fontSize: 14,
    fontFamily: "NunitoSans_600SemiBold",
    color: "#FFFFFF",
  },
});
