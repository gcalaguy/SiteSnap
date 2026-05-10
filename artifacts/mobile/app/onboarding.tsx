import React, { useState, useEffect } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useCreateCompany,
  useAcceptInvitation,
  useSyncUser,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

const PRIMARY = "#D4AF37";
const BG = "#0A0A0A";
const CARD = "#1e2d45";
const INPUT_BG = "#0f1927";
const BORDER = "#2d3e55";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe({ query: { enabled: !!clerkUser } });
  const isWorker = me?.role === "worker";

  const [tab, setTab] = useState<"create" | "join">("create");

  // Force workers to the join tab — they cannot create a company
  useEffect(() => {
    if (isWorker) setTab("join");
  }, [isWorker]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");

  const createCompany = useCreateCompany();
  const acceptInvitation = useAcceptInvitation();
  const syncUser = useSyncUser();

  function handleCreate() {
    if (!name.trim() || !city.trim() || !province.trim()) {
      Alert.alert("Missing fields", "Please fill in company name, city, and province.");
      return;
    }
    createCompany.mutate(
      {
        data: {
          name: name.trim(),
          city: city.trim(),
          province: province.trim().toUpperCase(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          router.replace("/(tabs)");
        },
        onError: (err: any) => {
          Alert.alert("Error", err?.message || "Failed to create company. Please try again.");
        },
      },
    );
  }

  function handleJoin() {
    if (!token.trim()) {
      Alert.alert("Missing token", "Please paste your invitation token.");
      return;
    }
    const doAccept = () => {
      acceptInvitation.mutate(
        { token: token.trim() },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
            router.replace("/(tabs)");
          },
          onError: (err: any) => {
            Alert.alert("Invalid token", err?.message || "The token is invalid or has expired.");
          },
        },
      );
    };

    if (clerkUser) {
      syncUser.mutate(
        {
          data: {
            clerkUserId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
            firstName: clerkUser.firstName ?? "",
            lastName: clerkUser.lastName ?? "",
          },
        },
        { onSuccess: () => doAccept(), onError: () => doAccept() },
      );
    } else {
      doAccept();
    }
  }

  const creating = createCompany.isPending;
  const joining = syncUser.isPending || acceptInvitation.isPending;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Feather name="home" size={32} color={PRIMARY} />
            </View>
            <Text style={styles.title}>Welcome to Site Snap</Text>
            <Text style={styles.subtitle}>
              {isWorker
                ? "Enter the invite token your owner or foreman sent you to join your team."
                : "Let's get your workspace set up."}
            </Text>
          </View>

          {/* Tabs — workers only see "Join Existing" */}
          {!isWorker && (
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === "create" && styles.tabActive]}
                onPress={() => setTab("create")}
              >
                <Text style={[styles.tabText, tab === "create" && styles.tabTextActive]}>
                  Create Company
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === "join" && styles.tabActive]}
                onPress={() => setTab("join")}
              >
                <Text style={[styles.tabText, tab === "join" && styles.tabTextActive]}>
                  Join Existing
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Create Company */}
          {tab === "create" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create your company</Text>
              <Text style={styles.cardSub}>You will be assigned as the owner.</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Company Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Acme Construction Ltd."
                  placeholderTextColor="#475569"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Toronto"
                    placeholderTextColor="#475569"
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
                <View style={[styles.field, { width: 76 }]}>
                  <Text style={styles.label}>Province *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ON"
                    placeholderTextColor="#475569"
                    value={province}
                    onChangeText={setProvince}
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Phone (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="555-123-4567"
                  placeholderTextColor="#475569"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <TouchableOpacity
                style={[styles.btn, creating && styles.btnDisabled]}
                onPress={handleCreate}
                disabled={creating}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>{creating ? "Creating…" : "Create Company"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Join Company */}
          {tab === "join" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Join a company</Text>
              <Text style={styles.cardSub}>
                Paste the invite token shared by your owner or foreman.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Invitation Token *</Text>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  placeholder="Paste token here…"
                  placeholderTextColor="#475569"
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[styles.btn, (joining || !token.trim()) && styles.btnDisabled]}
                onPress={handleJoin}
                disabled={joining || !token.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>{joining ? "Joining…" : "Join Company"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { padding: 24 },
  header: { alignItems: "center", marginBottom: 32, paddingTop: 8 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,102,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#94a3b8", textAlign: "center", marginTop: 6 },
  tabs: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderRadius: 12,
    marginBottom: 20,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 9,
  },
  tabActive: { backgroundColor: PRIMARY },
  tabText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#fff" },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 22,
    gap: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  cardSub: { fontSize: 14, color: "#94a3b8", marginTop: -8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#cbd5e1" },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#fff",
  },
  monoInput: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    minHeight: 80,
    textAlignVertical: "top",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  btn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16, letterSpacing: 0.2 },
});
