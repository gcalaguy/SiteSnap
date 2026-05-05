import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useRef } from "react";

type ParsedParams = {
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
};

type LineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
};

type EstimateResult = {
  lineItems: LineItem[];
  summary: {
    laborTotal: number;
    materialsTotal: number;
    addonsTotal: number;
    overhead: number;
    subtotal: number;
    contingency: number;
    contingencyPct: number;
    suggestedMarginPct: number;
    suggestedMarginAmount: number;
    priceToClient: number;
  };
  costModelUsed: { name: string };
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_new_build: "Residential New Build",
  renovation_residential: "Residential Renovation",
  commercial_new_build: "Commercial New Build",
  renovation_commercial: "Commercial Renovation",
  industrial: "Industrial",
  landscaping: "Landscaping",
  roofing: "Roofing",
  concrete: "Concrete Work",
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
};

const FINISH_LABELS: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
  luxury: "Luxury",
};

type Step = "idle" | "parsing" | "reviewing" | "calculating" | "result" | "saving";

export default function VoiceEstimateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const isWorker = me?.role === "worker";

  const [step, setStep] = useState<Step>("idle");
  const [transcript, setTranscript] = useState("");
  const [params, setParams] = useState<ParsedParams | null>(null);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Save as quote dialog state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [savedQuoteId, setSavedQuoteId] = useState<number | null>(null);

  // Pulse animation for mic
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [pulseAnim]);

  const handleTranscript = useCallback(async (text: string) => {
    setTranscript(text);
    setStep("parsing");
    setError(null);
    try {
      const data = await customFetch<ParsedParams>("/api/estimator/parse", {
        method: "POST",
        body: JSON.stringify({ prompt: text }),
      });
      setParams(data);
      setStep("reviewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse project description");
      setStep("idle");
    }
  }, []);

  const voiceRecorder = useVoiceRecorder(handleTranscript);

  const handleMicPress = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (voiceRecorder.state === "idle") {
      startPulse();
      await voiceRecorder.toggle();
    } else if (voiceRecorder.state === "recording") {
      stopPulse();
      setStep("parsing");
      await voiceRecorder.toggle();
    }
  };

  const handleCalculate = async () => {
    if (!params) return;
    setStep("calculating");
    setError(null);
    try {
      const data = await customFetch<EstimateResult>("/api/estimator/calculate", {
        method: "POST",
        body: JSON.stringify({
          project_type: params.project_type,
          square_feet: params.square_feet,
          finish_level: params.finish_level,
          addons: params.addons,
          margin_pct: params.confidence > 80 ? 15 : 20,
        }),
      });
      setResult(data);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate estimate");
      setStep("reviewing");
    }
  };

  const handleSaveAsQuote = async () => {
    if (!result || !clientName.trim()) return;
    setStep("saving");
    setError(null);
    try {
      const quoteLineItems = result.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitCost,
        total: li.total,
      }));
      const quote = await customFetch<{ id: number; quoteNumber: string }>("/api/estimator/to-quote", {
        method: "POST",
        body: JSON.stringify({
          title: params
            ? `${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`
            : "Voice Estimate",
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          notes: quoteNotes.trim() || undefined,
          sourcePrompt: transcript,
          lineItems: quoteLineItems,
        }),
      });
      setSavedQuoteId(quote.id);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quote");
      setStep("result");
    }
  };

  const handleReset = () => {
    setStep("idle");
    setTranscript("");
    setParams(null);
    setResult(null);
    setError(null);
    setClientName("");
    setClientEmail("");
    setQuoteNotes("");
    setSavedQuoteId(null);
    stopPulse();
  };

  const fmtCAD = (n: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  const topInsets = Platform.OS === "web" ? 67 : insets.top;

  if (isWorker) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInsets }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Voice Estimator</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={[styles.lockedTitle, { color: colors.foreground }]}>Owners & Foremen Only</Text>
          <Text style={[styles.lockedSub, { color: colors.mutedForeground }]}>
            Voice estimation is available for owners and foremen.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInsets + 8, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: "#FFFFFF" }]}>Voice Estimator</Text>
        {step !== "idle" ? (
          <TouchableOpacity onPress={handleReset} hitSlop={10}>
            <Feather name="refresh-ccw" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step: idle / recording ── */}
        {(step === "idle" || voiceRecorder.state !== "idle") && step !== "parsing" && step !== "reviewing" && step !== "calculating" && step !== "result" && step !== "saving" && (
          <View style={styles.micSection}>
            <Text style={[styles.micHint, { color: colors.mutedForeground }]}>
              {voiceRecorder.state === "recording"
                ? "Listening… Tap the mic to stop"
                : "Tap the mic and describe your project"}
            </Text>

            <View style={styles.micWrapper}>
              <Animated.View
                style={[
                  styles.micPulse,
                  {
                    transform: [{ scale: pulseAnim }],
                    backgroundColor: voiceRecorder.state === "recording" ? "#EF444430" : `${colors.primary}20`,
                  },
                ]}
              />
              <Pressable
                onPress={handleMicPress}
                style={({ pressed }) => [
                  styles.micButton,
                  {
                    backgroundColor: voiceRecorder.state === "recording" ? "#EF4444" : colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={voiceRecorder.state === "recording" ? "Stop recording" : "Start recording"}
              >
                <Feather
                  name={voiceRecorder.state === "recording" ? "square" : "mic"}
                  size={36}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>

            <Text style={[styles.micExamples, { color: colors.mutedForeground }]}>
              {"Example: \"2,000 sqft residential basement renovation, standard finishes, add flooring and painting\""}
            </Text>

            {(voiceRecorder.error) && (
              <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Feather name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{voiceRecorder.error}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Step: parsing / calculating ── */}
        {(step === "parsing" || step === "calculating") && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              {step === "parsing" ? "Analysing your description…" : "Calculating estimate…"}
            </Text>
          </View>
        )}

        {/* ── Step: reviewing params ── */}
        {step === "reviewing" && params && (
          <View style={{ gap: 16 }}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                <Feather name="check-circle" size={15} color={colors.primary} /> Parsed Parameters
              </Text>
              {transcript ? (
                <Text style={[styles.transcriptText, { color: colors.mutedForeground }]} numberOfLines={3}>
                  "{transcript}"
                </Text>
              ) : null}
              <View style={styles.paramRow}>
                <Text style={[styles.paramLabel, { color: colors.mutedForeground }]}>Project Type</Text>
                <Text style={[styles.paramValue, { color: colors.foreground }]}>
                  {PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type}
                </Text>
              </View>
              <View style={styles.paramRow}>
                <Text style={[styles.paramLabel, { color: colors.mutedForeground }]}>Square Footage</Text>
                <Text style={[styles.paramValue, { color: colors.foreground }]}>
                  {params.square_feet.toLocaleString()} sqft
                </Text>
              </View>
              <View style={styles.paramRow}>
                <Text style={[styles.paramLabel, { color: colors.mutedForeground }]}>Finish Level</Text>
                <Text style={[styles.paramValue, { color: colors.foreground }]}>
                  {FINISH_LABELS[params.finish_level] ?? params.finish_level}
                </Text>
              </View>
              {params.addons.length > 0 && (
                <View style={styles.paramRow}>
                  <Text style={[styles.paramLabel, { color: colors.mutedForeground }]}>Add-ons</Text>
                  <Text style={[styles.paramValue, { color: colors.foreground }]}>
                    {params.addons.join(", ")}
                  </Text>
                </View>
              )}
              <View style={styles.paramRow}>
                <Text style={[styles.paramLabel, { color: colors.mutedForeground }]}>AI Confidence</Text>
                <Text style={[styles.paramValue, { color: params.confidence >= 80 ? "#22C55E" : "#F59E0B" }]}>
                  {params.confidence}%
                </Text>
              </View>
              {params.notes ? (
                <View style={[styles.notesBox, { backgroundColor: colors.background }]}>
                  <Text style={[styles.notesText, { color: colors.mutedForeground }]}>{params.notes}</Text>
                </View>
              ) : null}
            </View>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Feather name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.rowGap}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={handleReset}
              >
                <Feather name="mic" size={16} color={colors.foreground} />
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleCalculate}
              >
                <Feather name="zap" size={16} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Calculate Estimate</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step: result ── */}
        {step === "result" && result && (
          <View style={{ gap: 16 }}>
            {/* Summary card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                <Feather name="file-text" size={15} color={colors.primary} /> Estimate Summary
              </Text>
              {params && (
                <Text style={[styles.modelBadge, { color: colors.mutedForeground }]}>
                  {result.costModelUsed.name}
                </Text>
              )}

              <View style={styles.summaryRows}>
                <SummaryRow label="Labour" value={fmtCAD(result.summary.laborTotal)} colors={colors} />
                <SummaryRow label="Materials" value={fmtCAD(result.summary.materialsTotal)} colors={colors} />
                {result.summary.addonsTotal > 0 && (
                  <SummaryRow label="Add-ons" value={fmtCAD(result.summary.addonsTotal)} colors={colors} />
                )}
                <SummaryRow label="Overhead" value={fmtCAD(result.summary.overhead)} colors={colors} />
                <SummaryRow
                  label={`Contingency (${result.summary.contingencyPct}%)`}
                  value={fmtCAD(result.summary.contingency)}
                  colors={colors}
                />
                <SummaryRow
                  label={`Margin (${result.summary.suggestedMarginPct}%)`}
                  value={fmtCAD(result.summary.suggestedMarginAmount)}
                  colors={colors}
                />
              </View>

              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>Price to Client (excl. HST)</Text>
                <Text style={[styles.totalValue, { color: colors.primary }]}>
                  {fmtCAD(result.summary.priceToClient)}
                </Text>
              </View>
            </View>

            {/* Line Items */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Line Items</Text>
              {result.lineItems.map((li, i) => (
                <View key={i} style={[styles.lineRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineDesc, { color: colors.foreground }]} numberOfLines={2}>{li.description}</Text>
                    <Text style={[styles.lineMeta, { color: colors.mutedForeground }]}>
                      {li.quantity} {li.unit} × {fmtCAD(li.unitCost)}
                    </Text>
                  </View>
                  <Text style={[styles.lineTotal, { color: colors.foreground }]}>{fmtCAD(li.total)}</Text>
                </View>
              ))}
            </View>

            {/* Save as Quote */}
            {!savedQuoteId ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  <Feather name="send" size={15} color={colors.primary} /> Save as Quote
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Client Name *</Text>
                  <TextInput
                    style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. John Smith"
                    placeholderTextColor={colors.mutedForeground}
                    value={clientName}
                    onChangeText={setClientName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Client Email (optional)</Text>
                  <TextInput
                    style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="client@example.com"
                    placeholderTextColor={colors.mutedForeground}
                    value={clientEmail}
                    onChangeText={setClientEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Any additional notes…"
                    placeholderTextColor={colors.mutedForeground}
                    value={quoteNotes}
                    onChangeText={setQuoteNotes}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {error && (
                  <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                    <Feather name="alert-circle" size={16} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    { backgroundColor: clientName.trim() ? colors.primary : colors.border },
                  ]}
                  onPress={handleSaveAsQuote}
                  disabled={!clientName.trim() || step === "saving"}
                >
                  {step === "saving" ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="send" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.btnPrimaryText}>
                    {step === "saving" ? "Saving…" : "Save as Quote"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.successBox, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
                <Feather name="check-circle" size={20} color="#22C55E" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.successTitle, { color: "#15803D" }]}>Quote saved!</Text>
                  <Text style={[styles.successSub, { color: "#166534" }]}>
                    Quote created for {clientName}. View it in the dashboard Quotes section.
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.btnSecondary, { borderColor: colors.border }]} onPress={handleReset}>
              <Feather name="mic" size={16} color={colors.foreground} />
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>New Estimate</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{value}</Text>
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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 16 },
  lockedTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  lockedSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },

  micSection: { alignItems: "center", paddingTop: 20, gap: 24 },
  micHint: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  micWrapper: { width: 160, height: 160, alignItems: "center", justifyContent: "center" },
  micPulse: { position: "absolute", width: 130, height: 130, borderRadius: 65 },
  micButton: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  micExamples: {
    fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center",
    paddingHorizontal: 24, lineHeight: 20, fontStyle: "italic",
  },

  loadingText: { fontSize: 16, fontFamily: "Inter_400Regular" },

  card: {
    borderRadius: 14, borderWidth: 1, padding: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  transcriptText: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic", lineHeight: 18 },
  modelBadge: { fontSize: 12, fontFamily: "Inter_400Regular" },

  paramRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paramLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  paramValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, paddingLeft: 12 },
  notesBox: { borderRadius: 8, padding: 10, marginTop: 4 },
  notesText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  summaryRows: { gap: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalRow: { borderTopWidth: 1, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  totalValue: { fontSize: 22, fontFamily: "Inter_700Bold" },

  lineRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  lineDesc: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 2 },
  lineMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lineTotal: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 70, textAlign: "right" },

  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  textInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, padding: 12 },
  errorText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  successBox: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderRadius: 12, padding: 16 },
  successTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  successSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  rowGap: { flexDirection: "row", gap: 10 },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
  },
  btnPrimaryText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  btnSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  btnSecondaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
