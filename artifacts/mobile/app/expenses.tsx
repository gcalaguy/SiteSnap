import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/useColors";
import { customFetch, useListProjects } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Expense {
  id: number;
  projectId: number;
  amount: string;
  description: string;
  receiptObjectPath: string | null;
  createdAt: string;
  submittedByName: string;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<number | null>(null);
  const activeProjectId = projectId ?? (projects[0]?.id ?? null);

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    data: expenses = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<Expense[]>({
    queryKey: ["expenses", activeProjectId],
    queryFn: () => customFetch(`/api/projects/${activeProjectId}/expenses`),
    enabled: !!activeProjectId,
  });

  const deleteExpense = useMutation({
    mutationFn: (id: number) => customFetch(`/api/projects/${activeProjectId}/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses", activeProjectId] }),
  });

  const pickReceipt = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access in Settings to attach a receipt.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets.length) return;
    setReceiptUri(result.assets[0].uri);
  }, []);

  const handleSubmit = useCallback(async () => {
    const amt = parseFloat(amount);
    if (!activeProjectId || !amt || amt <= 0 || !description.trim()) {
      Alert.alert("Missing info", "Enter an amount and description.");
      return;
    }
    setSubmitting(true);
    try {
      let receiptObjectPath: string | undefined;
      if (receiptUri) {
        const filename = `receipt_${Date.now()}.jpg`;
        const { uploadURL, objectPath } = (await customFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: filename, size: 0, contentType: "image/jpeg" }),
        })) as { uploadURL: string; objectPath: string };

        const dest = new URL(uploadURL);
        if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

        const result = await FileSystem.uploadAsync(uploadURL, receiptUri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": "image/jpeg" },
        });
        if (result.status < 200 || result.status >= 300) throw new Error(`Receipt upload failed: ${result.status}`);
        receiptObjectPath = objectPath;
      }

      await customFetch(`/api/projects/${activeProjectId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, description: description.trim(), receiptObjectPath }),
      });

      qc.invalidateQueries({ queryKey: ["expenses", activeProjectId] });
      setShowForm(false);
      setAmount("");
      setDescription("");
      setReceiptUri(null);
      Alert.alert("Submitted", "Expense submitted.");
    } catch (err: any) {
      Alert.alert("Failed to submit", err?.message ?? "Could not submit expense.");
    } finally {
      setSubmitting(false);
    }
  }, [activeProjectId, amount, description, receiptUri, qc]);

  const renderExpense = useCallback(({ item }: { item: Expense }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.amount, { color: colors.foreground }]}>{formatCurrency(parseFloat(item.amount))}</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>{item.description}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {item.submittedByName} · {new Date(item.createdAt).toLocaleDateString("en-CA")}
            {item.receiptObjectPath ? " · Receipt attached" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            Alert.alert("Delete Expense", "Remove this expense?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteExpense.mutate(item.id) },
            ])
          }
          hitSlop={10}
        >
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  ), [colors, deleteExpense]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Expenses</Text>
          <Text style={styles.headerSub}>Submit and track project expenses</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[styles.typePill, { backgroundColor: activeProjectId === p.id ? colors.primary : colors.card, borderColor: activeProjectId === p.id ? colors.primary : colors.border }]}
            >
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: activeProjectId === p.id ? "#fff" : colors.foreground }}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !activeProjectId ? (
        <View style={styles.empty}>
          <Feather name="credit-card" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No assigned projects</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderExpense}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No expenses yet</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowForm(true);
        }}
        disabled={!activeProjectId}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>Submit Expense</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[styles.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Submit Expense</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBody}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />
              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What was this expense for?"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, minHeight: 70 }]}
              />
              <TouchableOpacity
                onPress={pickReceipt}
                style={[styles.uploadBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, marginTop: 14 }]}
              >
                <Feather name="paperclip" size={16} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }}>
                  {receiptUri ? "Receipt attached" : "Attach receipt (optional)"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1, marginTop: 14 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 1 },
  typePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  desc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  sheetOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
});
