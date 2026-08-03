import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useColors } from "@/hooks/useColors";
import { customFetch, useListProjects } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SwipeableRow } from "@/components/ui";
import { CostRecordCard } from "@/components/cards/CostRecordCard";
import { getExpenseStatusTone, getExpenseStatusLabel } from "@/src/utils/expenseStatus";

interface Expense {
  id: number;
  projectId: number;
  amount: string;
  description: string;
  receiptObjectPath: string | null;
  vendorName: string | null;
  taxAmount: string | null;
  expenseDate: string | null;
  status: string;
  createdAt: string;
  submittedByName: string;
}

interface ScannedReceipt {
  vendor: string | null;
  amount: number | null;
  tax: number | null;
  date: string | null;
  confidence: string;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
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
  const [receiptAsset, setReceiptAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Scan Receipt (OCR quick-review) ─────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewObjectPath, setReviewObjectPath] = useState<string | null>(null);
  const [reviewVendor, setReviewVendor] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewTax, setReviewTax] = useState("");
  const [reviewDate, setReviewDate] = useState<Date>(new Date());
  const [reviewProjectId, setReviewProjectId] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [submittingReview, setSubmittingReview] = useState(false);

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
    setReceiptAsset(result.assets[0]);
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
      if (receiptAsset) {
        // Don't assume JPEG — the Photos library returns HEIC on most iPhones
        // by default, and storing it under a "image/jpeg" Content-Type left
        // receipts undecodable in any browser that opened the signed URL.
        const ext = (receiptAsset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
        const mimeType = receiptAsset.mimeType ?? `image/${ext}`;
        const filename = receiptAsset.fileName ?? `receipt_${Date.now()}.${ext}`;

        const { uploadURL, objectPath } = (await customFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: filename, size: receiptAsset.fileSize ?? 0, contentType: mimeType }),
        })) as { uploadURL: string; objectPath: string };

        const dest = new URL(uploadURL);
        if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

        const result = await FileSystem.uploadAsync(uploadURL, receiptAsset.uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": mimeType },
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
      setReceiptAsset(null);
      Alert.alert("Submitted", "Expense submitted.");
    } catch (err: any) {
      Alert.alert("Failed to submit", err?.message ?? "Could not submit expense.");
    } finally {
      setSubmitting(false);
    }
  }, [activeProjectId, amount, description, receiptAsset, qc]);

  const captureReceipt = useCallback(async (source: "camera" | "library") => {
    if (!activeProjectId) {
      Alert.alert("No assigned projects", "You need to be assigned to a project before you can scan a receipt.");
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow camera access in Settings to scan a receipt.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo library access in Settings to attach a receipt.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    }
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScanning(true);
    try {
      const ext = (asset.fileName?.split(".").pop() ?? "jpg").toLowerCase();
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const filename = asset.fileName ?? `receipt_${Date.now()}.${ext}`;

      const { uploadURL, objectPath } = (await customFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filename, size: asset.fileSize ?? 0, contentType: mimeType }),
      })) as { uploadURL: string; objectPath: string };

      const dest = new URL(uploadURL);
      if (!dest.protocol.startsWith("https")) throw new Error("Unexpected upload destination");

      const uploadResult = await FileSystem.uploadAsync(uploadURL, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) throw new Error(`Receipt upload failed: ${uploadResult.status}`);

      const scanned = (await customFetch(`/api/projects/${activeProjectId}/expenses/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      })) as ScannedReceipt;

      setReviewObjectPath(objectPath);
      setReviewVendor(scanned.vendor ?? "");
      setReviewAmount(scanned.amount != null ? String(scanned.amount) : "");
      setReviewTax(scanned.tax != null ? String(scanned.tax) : "");
      setReviewDate(scanned.date ? new Date(`${scanned.date}T00:00:00`) : new Date());
      setReviewProjectId(activeProjectId);
      setShowReview(true);
    } catch (err: any) {
      Alert.alert("Scan failed", err?.message ?? "Could not scan the receipt. You can still enter it manually.");
    } finally {
      setScanning(false);
    }
  }, [activeProjectId]);

  const handleScanReceipt = useCallback(() => {
    Alert.alert("Scan Receipt", "Capture or upload a receipt photo", [
      { text: "Take Photo", onPress: () => captureReceipt("camera") },
      { text: "Choose from Library", onPress: () => captureReceipt("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [captureReceipt]);

  const onReviewDateChange = useCallback((_event: DateTimePickerEvent, date: Date | undefined) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (date) setReviewDate(date);
    } else if (date) {
      setTempDate(date);
    }
  }, []);

  const confirmIOSReviewDate = useCallback(() => {
    setReviewDate(tempDate);
    setShowDatePicker(false);
  }, [tempDate]);

  const handleSubmitReview = useCallback(async () => {
    const amt = parseFloat(reviewAmount);
    if (!reviewProjectId || !amt || amt <= 0) {
      Alert.alert("Missing info", "Enter a valid total amount and select a project.");
      return;
    }
    const taxAmt = reviewTax.trim() ? parseFloat(reviewTax) : undefined;
    if (reviewTax.trim() && (Number.isNaN(taxAmt) || (taxAmt as number) < 0)) {
      Alert.alert("Invalid tax amount", "Enter a valid tax amount or leave it blank.");
      return;
    }

    setSubmittingReview(true);
    try {
      await customFetch(`/api/projects/${reviewProjectId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          description: reviewVendor.trim() ? `Receipt — ${reviewVendor.trim()}` : "Scanned receipt",
          receiptObjectPath: reviewObjectPath ?? undefined,
          vendorName: reviewVendor.trim() || undefined,
          taxAmount: taxAmt,
          expenseDate: isoDate(reviewDate),
          viaOcr: true,
        }),
      });

      qc.invalidateQueries({ queryKey: ["expenses", reviewProjectId] });
      setShowReview(false);
      setReviewObjectPath(null);
      setReviewVendor("");
      setReviewAmount("");
      setReviewTax("");
      Alert.alert("Submitted", "Expense submitted.");
    } catch (err: any) {
      Alert.alert("Failed to submit", err?.message ?? "Could not submit expense.");
    } finally {
      setSubmittingReview(false);
    }
  }, [reviewProjectId, reviewAmount, reviewTax, reviewVendor, reviewObjectPath, reviewDate, qc]);

  const activeProjectName = projects.find((p) => p.id === activeProjectId)?.name ?? "Project";

  function confirmDeleteExpense(id: number) {
    Alert.alert("Delete Expense", "Remove this expense?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteExpense.mutate(id) },
    ]);
  }

  const renderExpense = useCallback(({ item }: { item: Expense }) => (
    <SwipeableRow
      leftAction={{
        icon: "trash-2",
        label: "Delete",
        color: colors.destructive,
        onTrigger: () => confirmDeleteExpense(item.id),
      }}
    >
      <CostRecordCard
        vendorName={item.vendorName}
        description={item.description}
        amount={parseFloat(item.amount)}
        tone={getExpenseStatusTone(item.status)}
        statusLabel={getExpenseStatusLabel(item.status)}
        projectName={activeProjectName}
        date={item.expenseDate ?? item.createdAt}
        hasReceipt={!!item.receiptObjectPath}
      />
    </SwipeableRow>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [colors, deleteExpense, activeProjectName]);

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

      <TouchableOpacity
        onPress={handleScanReceipt}
        disabled={scanning || !activeProjectId}
        style={[styles.scanBtn, { backgroundColor: colors.primary, opacity: scanning || !activeProjectId ? 0.6 : 1 }]}
        activeOpacity={0.85}
      >
        {scanning ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Feather name="camera" size={17} color="#FFFFFF" />
        )}
        <Text style={styles.scanBtnText}>{scanning ? "Scanning receipt…" : "Scan Receipt"}</Text>
      </TouchableOpacity>

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
          if (!activeProjectId) {
            Alert.alert("No assigned projects", "You need to be assigned to a project before you can submit an expense.");
            return;
          }
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowForm(true);
        }}
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
                  {receiptAsset ? "Receipt attached" : "Attach receipt (optional)"}
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

      {showReview && (
        <View style={[styles.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Review Receipt</Text>
              <TouchableOpacity onPress={() => setShowReview(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12 }}>
                Confirm the details we picked up from your receipt before submitting.
              </Text>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Vendor Name</Text>
              <TextInput
                value={reviewVendor}
                onChangeText={setReviewVendor}
                placeholder="e.g. Home Depot"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Total Amount</Text>
              <TextInput
                value={reviewAmount}
                onChangeText={setReviewAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Tax Amount (optional)</Text>
              <TextInput
                value={reviewTax}
                onChangeText={setReviewTax}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Transaction Date</Text>
              <TouchableOpacity
                style={[styles.dateField, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { setTempDate(reviewDate); setShowDatePicker(true); }}
              >
                <Feather name="calendar" size={15} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 }}>
                  {formatDateDisplay(isoDate(reviewDate))}
                </Text>
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>

              {showDatePicker && Platform.OS === "android" && (
                <DateTimePicker value={reviewDate} mode="date" display="default" onChange={onReviewDateChange} maximumDate={new Date()} />
              )}

              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Project Assignment</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setReviewProjectId(p.id)}
                    style={[styles.typePill, { backgroundColor: reviewProjectId === p.id ? colors.primary : colors.card, borderColor: reviewProjectId === p.id ? colors.primary : colors.border }]}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: reviewProjectId === p.id ? "#fff" : colors.foreground }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                onPress={handleSubmitReview}
                disabled={submittingReview}
                style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: submittingReview ? 0.6 : 1, marginTop: 18, marginBottom: 8 }]}
              >
                {submittingReview ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Submit Expense</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {/* iOS date picker in modal — rendered above the review sheet so it isn't clipped by it */}
      {Platform.OS === "ios" && (
        <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.sheetOverlay}>
            <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} hitSlop={8}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Transaction Date</Text>
                <TouchableOpacity onPress={confirmIOSReviewDate} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onReviewDateChange} maximumDate={new Date()} />
            </View>
          </View>
        </Modal>
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
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 12, marginTop: 12, marginBottom: 4, paddingVertical: 13, borderRadius: 14,
  },
  scanBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14.5 },
  dateField: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  sheetOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, maxHeight: 480 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
});
