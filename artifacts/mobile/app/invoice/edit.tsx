import React, { useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  useGetInvoice,
  getGetInvoiceQueryKey,
  getListAllInvoicesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";

function calcItemTotal(qty: number, price: number): number {
  return Math.round(qty * price * 100) / 100;
}

function calcTotals(items: LineItem[]): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}

function fmtCAD(v: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(v);
}

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  inputRef,
  onMicPress,
  micActive,
  micTranscribing,
  multiline,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  inputRef?: React.Ref<TextInput>;
  onMicPress?: () => void;
  micActive?: boolean;
  micTranscribing?: boolean;
  multiline?: boolean;
  onSubmitEditing?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: micActive ? colors.primary : colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          returnKeyType={multiline ? "default" : "next"}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={!multiline}
        />
        {onMicPress && (
          <Pressable onPress={onMicPress} hitSlop={8} style={styles.micBtn}>
            {micTranscribing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="mic" size={16} color={micActive ? colors.primary : colors.mutedForeground} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function InvoiceEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = parseInt(id ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: invoice, isLoading } = useGetInvoice(invoiceId);

  const updateInvoice = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
      qc.invalidateQueries({ queryKey: getListAllInvoicesQueryKey({}) });
    },
  });

  const [voiceTarget, setVoiceTarget] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const descriptionRefs = useRef<(TextInput | null)[]>([]);
  const notesRef = useRef<TextInput | null>(null);

  React.useEffect(() => {
    if (invoice) {
      setTitle(invoice.title ?? "");
      setClientName(invoice.clientName ?? "");
      setClientEmail(invoice.clientEmail ?? "");
      setNotes(invoice.notes ?? "");
      setLineItems((invoice.lineItems ?? []) as LineItem[]);
    }
  }, [invoice]);

  const handleTranscript = useCallback((text: string) => {
    if (!voiceTarget) return;
    if (voiceTarget === "notes") {
      setNotes((prev) => (prev ? prev + " " + text : text));
    } else if (voiceTarget.startsWith("desc-")) {
      const idx = parseInt(voiceTarget.replace("desc-", ""), 10);
      setLineItems((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, description: item.description ? item.description + " " + text : text } : item))
      );
    } else if (voiceTarget === "title") {
      setTitle((prev) => (prev ? prev + " " + text : text));
    }
    setVoiceTarget(null);
  }, [voiceTarget]);

  const voiceRecorder = useVoiceRecorder(handleTranscript);

  const handleMicPress = async (target: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (voiceRecorder.state === "idle") {
      setVoiceTarget(target);
      await voiceRecorder.toggle();
    } else if (voiceRecorder.state === "recording" && voiceTarget === target) {
      await voiceRecorder.toggle();
      setVoiceTarget(null);
    }
  };

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], ...patch };
      if (patch.quantity != null || patch.unitPrice != null) {
        item.total = calcItemTotal(item.quantity, item.unitPrice);
      }
      next[index] = item;
      return next;
    });
  }

  function addLineItem() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLineItems((prev) => [...prev, { description: "", quantity: 1, unit: "ea", unitPrice: 0, total: 0 }]);
    setTimeout(() => {
      const idx = lineItems.length;
      descriptionRefs.current[idx]?.focus();
    }, 100);
  }

  function removeLineItem(index: number) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!invoice) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Please enter an invoice title.");
      return;
    }
    if (lineItems.length === 0) {
      Alert.alert("Line items required", "Add at least one line item.");
      return;
    }
    const emptyDesc = lineItems.findIndex((i) => !i.description.trim());
    if (emptyDesc !== -1) {
      Alert.alert("Description required", `Line item ${emptyDesc + 1} is missing a description.`);
      return;
    }
    const { subtotal, taxAmount, total } = calcTotals(lineItems);
    updateInvoice.mutate(
      {
        title: trimmedTitle,
        clientName: clientName.trim() || "Client",
        clientEmail: clientEmail.trim() || null,
        lineItems,
        subtotal,
        taxRate: 0.13,
        taxAmount,
        total,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: () => Alert.alert("Save failed", "Could not save the invoice. Please try again."),
      }
    );
  }

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const { subtotal, taxAmount, total } = calcTotals(lineItems);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Invoice</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Invoice</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Invoice not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{invoice.invoiceNumber}</Text>
        <Pressable onPress={handleSave} disabled={updateInvoice.isPending} hitSlop={10}>
          {updateInvoice.isPending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.saveBtn}>Save</Text>}
        </Pressable>
      </View>

      {voiceRecorder.state === "recording" && (
        <View style={[styles.recordingBanner, { backgroundColor: "#EF444420", borderColor: "#EF4444" }]}>
          <Feather name="mic" size={14} color="#EF4444" />
          <Text style={styles.recordingText}>Recording — tap mic again to stop</Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>INVOICE DETAILS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LabeledInput
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Invoice title"
            onMicPress={() => handleMicPress("title")}
            micActive={voiceTarget === "title" && voiceRecorder.state === "recording"}
            micTranscribing={voiceTarget === "title" && voiceRecorder.state === "transcribing"}
          />
          <LabeledInput
            label="Client Name"
            value={clientName}
            onChangeText={setClientName}
            placeholder="Client or company name"
          />
          <LabeledInput
            label="Client Email"
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="client@example.com"
            keyboardType="email-address"
          />
          <LabeledInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Payment terms, special instructions…"
            multiline
            inputRef={notesRef}
            onMicPress={() => handleMicPress("notes")}
            micActive={voiceTarget === "notes" && voiceRecorder.state === "recording"}
            micTranscribing={voiceTarget === "notes" && voiceRecorder.state === "transcribing"}
          />
        </View>

        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 20 }]}>LINE ITEMS</Text>
        {lineItems.map((item, i) => (
          <View key={i} style={[styles.lineItemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.lineItemHeader}>
              <Text style={[styles.lineItemNum, { color: colors.mutedForeground }]}>#{i + 1}</Text>
              <Pressable onPress={() => removeLineItem(i)} hitSlop={8}>
                <Feather name="x" size={18} color="#EF4444" />
              </Pressable>
            </View>
            <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: (voiceTarget === `desc-${i}` && voiceRecorder.state === "recording") ? colors.primary : colors.border }]}>
              <TextInput
                ref={(r) => { descriptionRefs.current[i] = r; }}
                style={[styles.input, { color: colors.foreground, flex: 1 }]}
                value={item.description}
                onChangeText={(v) => updateLineItem(i, { description: v })}
                placeholder="Description of work"
                placeholderTextColor={colors.mutedForeground}
              />
              <Pressable onPress={() => handleMicPress(`desc-${i}`)} hitSlop={8} style={styles.micBtn}>
                {voiceRecorder.state === "transcribing" && voiceTarget === `desc-${i}`
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Feather name="mic" size={16} color={(voiceTarget === `desc-${i}` && voiceRecorder.state === "recording") ? colors.primary : colors.mutedForeground} />}
              </Pressable>
            </View>
            <View style={styles.lineItemNumbers}>
              <View style={styles.lineItemField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Qty</Text>
                <TextInput
                  style={[styles.numInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={String(item.quantity)}
                  onChangeText={(v) => updateLineItem(i, { quantity: parseFloat(v) || 0 })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.lineItemField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Unit</Text>
                <TextInput
                  style={[styles.numInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={item.unit}
                  onChangeText={(v) => updateLineItem(i, { unit: v })}
                  placeholder="ea"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineItemField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Unit Price</Text>
                <TextInput
                  style={[styles.numInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={String(item.unitPrice)}
                  onChangeText={(v) => updateLineItem(i, { unitPrice: parseFloat(v) || 0 })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.lineItemField}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Total</Text>
                <Text style={[styles.lineTotal, { color: colors.primary }]}>{fmtCAD(item.total)}</Text>
              </View>
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.addItemBtn, { borderColor: colors.primary, backgroundColor: colors.card }]}
          onPress={addLineItem}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[styles.addItemText, { color: colors.primary }]}>Add Line Item</Text>
        </Pressable>

        <View style={[styles.totalsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginBottom: 8 }]}>TOTALS</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalVal, { color: colors.foreground }]}>{fmtCAD(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>HST (13%)</Text>
            <Text style={[styles.totalVal, { color: colors.foreground }]}>{fmtCAD(taxAmount)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Total</Text>
            <Text style={[styles.totalVal, { color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 17 }]}>{fmtCAD(total)}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.saveFullBtn, { backgroundColor: colors.primary, opacity: updateInvoice.isPending ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={updateInvoice.isPending}
        >
          {updateInvoice.isPending
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Feather name="check" size={20} color="#FFFFFF" />}
          <Text style={styles.saveFullBtnText}>
            {updateInvoice.isPending ? "Saving…" : "Save Invoice"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF", flex: 1, textAlign: "center" },
  saveBtn: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  recordingBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  recordingText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#EF4444" },
  content: { padding: 16, gap: 8 },
  sectionHeader: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  input: { fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 22 },
  micBtn: { padding: 2 },
  lineItemCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10, marginBottom: 8 },
  lineItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineItemNum: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  lineItemNumbers: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  lineItemField: { gap: 4, flex: 1, minWidth: 60 },
  numInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  lineTotal: { fontSize: 14, fontFamily: "Inter_700Bold", paddingVertical: 8, textAlign: "center" },
  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 10, padding: 14, marginVertical: 4 },
  addItemText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  totalsCard: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 6, marginTop: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  totalVal: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1, marginVertical: 6 },
  saveFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 12, marginTop: 12 },
  saveFullBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" },
});
