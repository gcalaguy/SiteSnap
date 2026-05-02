import { useGetMe } from "@workspace/api-client-react";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  foreman: "Foreman",
  worker: "Worker",
};

function MenuItem({ icon, label, value, onPress, danger }: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed && onPress ? 0.7 : 1 },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, { backgroundColor: danger ? "#FEE2E2" : colors.muted }]}>
        <Feather name={icon as any} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <Text style={[styles.menuLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
      {!!value && <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>{value}</Text>}
      {onPress && !danger && <Feather name="chevron-right" size={16} color={colors.border} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  userName: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 4 },
  userEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start", marginTop: 8 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  menuIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  menuValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  versionText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 8 },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const router = useRouter();

  const { data: me, isLoading } = useGetMe();

  const initials = me
    ? `${me.firstName?.[0] ?? ""}${me.lastName?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await signOut();
        },
      },
    ]);
  };

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 20, backgroundColor: colors.sidebar }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {me ? (
          <>
            <Text style={[styles.userName, { color: "#FFFFFF" }]}>
              {me.firstName} {me.lastName}
            </Text>
            <Text style={[styles.userEmail, { color: "rgba(255,255,255,0.6)" }]}>{me.email}</Text>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{ROLE_LABELS[me.role ?? "worker"] ?? me.role}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.userEmail, { color: "rgba(255,255,255,0.6)" }]}>Loading...</Text>
        )}
      </View>

      {/* Company */}
      {me?.company && (
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Company</Text>
          <MenuItem icon="briefcase" label={me.company.name} />
          {!!me.company.province && (
            <MenuItem icon="map-pin" label="Province" value={me.company.province} />
          )}
        </View>
      )}

      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Account</Text>
        <MenuItem icon="mail" label="Email" value={me?.email ?? "—"} />
        <MenuItem icon="shield" label="Role" value={ROLE_LABELS[me?.role ?? "worker"] ?? me?.role ?? "—"} />
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Actions</Text>
        <MenuItem
          icon="log-out"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </View>

      <Text style={[styles.versionText, { color: colors.mutedForeground }]}>
        BuildCore Mobile v1.0.0
      </Text>
    </ScrollView>
  );
}
