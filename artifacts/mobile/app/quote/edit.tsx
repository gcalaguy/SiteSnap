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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { updateQuoteBodyTitleMax } from "@workspace/api-zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  useGetQuote,
  useUpdateQuote,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  getListAllQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const CYAN = "#06b6d4";

function fmtCAD(v: string | number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));
}

function calcItemTotal(qty: number, price: number): number {
  return Math.round(qty * price * 100) / 100;
}

function calcTotals(items: LineItem[]): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; total: number };

export default function QuoteEditScreen() {
  const { id, projectId: projectIdParam } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const quoteId = parseInt(id ?? "0");
  const projectId = parseInt(projectIdParam ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: quote, isLoading } = useGetQuote(projectId, quoteId);
  const updateQuote = useUpdateQuote();

  const [voiceTarget, setVoiceTarget] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const descriptionRefs = useRef<(TextInput | null)[]>([]);
  const notesRef = useRef<TextInput | null>(null);

  React.useEffect(() => {
    if (quote) {
      setTitle(quote.title ?? "");
      setClientName(quote.clientName ?? "");
      setClientEmail(quote.clientEmail ?? "");
      setClientCompanyName((quote as any).clientCompanyName ?? "");
      setClientAddress((quote as any).clientAddress ?? "");
      setClientPhone((quote as any).clientPhone ?? "");
      setNotes(quote.notes ?? "");
      setValidUntil(quote.validUntil ?? null);
      setLineItems((quote.lineItems ?? []) as LineItem[]);
    }
  }, [quote]);

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
    if (!quote) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Please enter a quote title.");
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

    updateQuote.mutate(
      {
        projectId,
        quoteId,
        data: {
          title: trimmedTitle,
          clientName: clientName.trim() || undefined,
          clientEmail: clientEmail.trim() || null,
          clientCompanyName: clientCompanyName.trim() || null,
          clientAddress: clientAddress.trim() || null,
          clientPhone: clientPhone.trim() || null,
          notes: notes.trim() || null,
          validUntil: validUntil || null,
          lineItems,
        },
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          qc.invalidateQueries({ queryKey: getGetQuoteQueryKey(projectId, quoteId) });
          qc.invalidateQueries({ queryKey: getListQuotesQueryKey(projectId) });
          qc.invalidateQueries({ queryKey: getListAllQuotesQueryKey({}) });
          Alert.alert("Quote Updated", "Your changes have been saved.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        },
        onError: () => {
          Alert.alert("Failed to save", "Please try again.");
        },
      }
    );
  }

  const topInsets = Platform.OS === "web" ? 67 : insets.top;
  const isSaving = updateQuote.isPending;
  const isRecording = voiceRecorder.state === "recording";

  function VoiceMic({ target, active }: { target: string; active: boolean }) {
    return (
      <TouchableOpacity
        onPress={() => handleMicPress(target)}
        style={[styles.micBtn, active && { backgroundColor: "#ef444420" }]}
        hitSlop={8}
      >
        <Feather name={active ? "mic" : "mic"} size={16} color={active ? "#ef4444" : colors.mutedForeground} />
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Quote</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Quote</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Quote not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Quote</Text>
        <Pressable onPress={handleSave} disabled={isSaving} hitSlop={10} style={styles.saveHeaderBtn}>
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Feather name="check" size={22} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Quote Title</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Basement Renovation Quote"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              maxLength={updateQuoteBodyTitleMax}
            />
            <VoiceMic target="title" active={isRecording && voiceTarget === "title"} />
          </View>
        </View>

        {/* Client Info */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Client</Text>
          <TextInput
            value={clientName}
            onChangeText={setClientName}
            placeholder="Client name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, marginBottom: 8 }]}
          />
          <TextInput
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="Email"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, marginBottom: 8 }]}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            value={clientCompanyName}
            onChangeText={setClientCompanyName}
            placeholder="Company name (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, marginBottom: 8 }]}
          />
          <TextInput
            value={clientAddress}
            onChangeText={setClientAddress}
            placeholder="Address (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, marginBottom: 8 }]}
          />
          <TextInput
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="Phone (optional)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            keyboardType="phone-pad"
          />
        </View>

        {/* Valid Until */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Valid Until</Text>
          <Pressable
            style={[styles.dateBtn, { borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
            <Text style={[styles.dateText, { color: validUntil ? colors.foreground : colors.mutedForeground }]}>
              {validUntil ? new Date(validUntil).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "Select a date"}
            </Text>
            {validUntil && (
              <TouchableOpacity onPress={() => setValidUntil(null)} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={validUntil ? new Date(validUntil) : new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === "ios");
                if (selectedDate && event.type !== "dismissed") {
                  setValidUntil(selectedDate.toISOString().split("T")[0]);
                }
              }}
            />
          )}
        </View>

        {/* Line Items */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.lineItemHeader}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Line Items</Text>
            <TouchableOpacity onPress={addLineItem} style={[styles.addBtn, { backgroundColor: `${CYAN}18` }]}>
              <Feather name="plus" size={14} color={CYAN} />
              <Text style={[styles.addBtnText, { color: CYAN }]}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {lineItems.map((item, index) => (
            <View key={index} style={[styles.lineItemRow, { borderBottomColor: colors.border, borderBottomWidth: index < lineItems.length - 1 ? 1 : 0 }]}>
              {/* Description */}
              <View style={styles.inputRow}>
                <TextInput
                  ref={(el) => { descriptionRefs.current[index] = el; }}
                  value={item.description}
                  onChangeText={(text) => updateLineItem(index, { description: text })}
                  placeholder={`Item ${index + 1} description`}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, flex: 1 }]}
                  multiline
                />
                <VoiceMic target={`desc-${index}`} active={isRecording && voiceTarget === `desc-${index}`} />
              </View>

              {/* Numeric row */}
              <View style={styles.numericRow}>
                <View style={[styles.numField, { borderColor: colors.border }]}>
                  <Text style={[styles.numLabel, { color: colors.mutedForeground }]}>Qty</Text>
                  <TextInput
                    value={String(item.quantity)}
                    onChangeText={(text) => {
                      const val = parseFloat(text) || 0;
                      updateLineItem(index, { quantity: val });
                    }}
                    style={[styles.numInput, { color: colors.foreground }]}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                </View>
                <View style={[styles.numField, { borderColor: colors.border, flex: 1.5 }]}>
                  <Text style={[styles.numLabel, { color: colors.mutedForeground }]}>Unit</Text>
                  <TextInput
                    value={item.unit}
                    onChangeText={(text) => updateLineItem(index, { unit: text })}
                    style={[styles.numInput, { color: colors.foreground }]}
                    placeholder="ea"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={[styles.numField, { borderColor: colors.border }]}>
                  <Text style={[styles.numLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <TextInput
                    value={item.unitPrice > 0 ? item.unitPrice.toString() : ""}
                    onChangeText={(text) => {
                      const val = parseFloat(text) || 0;
                      updateLineItem(index, { unitPrice: val });
                    }}
                    style={[styles.numInput, { color: colors.foreground }]}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={[styles.numField, { borderColor: colors.border, backgroundColor: `${CYAN}08` }]}>
                  <Text style={[styles.numLabel, { color: colors.mutedForeground }]}>Total</Text>
                  <Text style={[styles.numInput, { color: CYAN, fontFamily: "Inter_700Bold" }]}>
                    {fmtCAD(item.total)}
                  </Text>
                </View>
              </View>

              {/* Remove */}
              <TouchableOpacity onPress={() => removeLineItem(index)} style={styles.removeBtn}>
                <Feather name="trash-2" size={14} color="#ef4444" />
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          {lineItems.length === 0 && (
            <View style={styles.emptyLineItems}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                No line items yet. Tap "Add Item" to start.
              </Text>
            </View>
          )}
        </View>

        {/* Totals */}
        {lineItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
              <Text style={[styles.totalValue, { color: colors.foreground }]}>{fmtCAD(calcTotals(lineItems).subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>HST (13%)</Text>
              <Text style={[styles.totalValue, { color: colors.foreground }]}>{fmtCAD(calcTotals(lineItems).taxAmount)}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Total</Text>
              <Text style={[styles.totalValue, { color: CYAN, fontFamily: "Inter_700Bold" }]}>{fmtCAD(calcTotals(lineItems).total)}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.notesHeader}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes</Text>
            <VoiceMic target="notes" active={isRecording && voiceTarget === "notes"} />
          </View>
          <TextInput
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any notes or terms here..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.notesInput, { color: colors.foreground }]}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: isSaving ? colors.border : CYAN }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Feather name="save" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.saveBtnText}>{isSaving ? "Saving…" : "Save Changes"}</Text>
        </TouchableOpacity>

        {/* Voice error */}
        {voiceRecorder.error && (
          <View style={[styles.errorBanner, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
            <Feather name="alert-circle" size={14} color="#ef4444" />
            <Text style={styles.errorText}>{voiceRecorder.error}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF", flex: 1, textAlign: "center" },
  saveHeaderBtn: { width: 36, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 8 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#00000008",
    minHeight: 40,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00000008",
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  lineItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  lineItemRow: { paddingVertical: 12, gap: 8 },
  numericRow: { flexDirection: "row", gap: 8 },
  numField: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  numLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  numInput: { fontSize: 14, fontFamily: "Inter_400Regular", padding: 0, minHeight: 20 },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  removeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#ef4444" },
  emptyLineItems: { paddingVertical: 16, alignItems: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  totalValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, marginVertical: 8 },
  notesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  notesInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#00000008",
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#ef4444" },
});
