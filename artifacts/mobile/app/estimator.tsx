import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Pressable,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";

const GOLD = "#C9A84C";

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedParams = {
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
};

type LineItem = {
  id: string;
  description: string;
  category: "labour" | "materials" | "addon" | "overhead";
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  editable: boolean;
};

type EstimateSummary = {
  laborTotal: number;
  materialsTotal: number;
  addonsTotal: number;
  overhead: number;
  overheadPct: number;
  subtotal: number;
  contingency: number;
  contingencyPct: number;
  totalLow: number;
  totalHigh: number;
  suggestedMarginPct: number;
  suggestedMarginAmount: number;
  priceToClient: number;
};

type EstimateResult = {
  lineItems: LineItem[];
  summary: EstimateSummary;
  costModelUsed: { id: number; name: string; projectType: string; finishLevel: string; notes: string | null };
  params: { projectType: string; squareFeet: number; finishLevel: string; addons: string[] };
};

type SavedEstimate = {
  id: number;
  title: string;
  scopeText: string | null;
  status: string;
  result: Record<string, any> | null;
  createdAt: string;
};

type AddonModel = {
  id: number;
  addonKey: string;
  name: string;
  description: string | null;
  costType: string;
  amount: string;
  applicableTypes: string | null;
};

type CostModel = {
  id: number;
  projectType: string;
  finishLevel: string;
  name: string;
  baseCostPerSqft: string;
  laborCostPerSqft: string;
  materialCostPerSqft: string;
  overheadPct: string;
  contingencyPct: string;
  notes: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_TYPE_LABELS: Record<string, string> = {
  residential_new_build: "Residential New Build",
  commercial_new_build: "Commercial New Build",
  renovation_residential: "Residential Renovation",
  renovation_commercial: "Commercial Renovation",
  addition: "Home Addition",
  garage: "Garage",
  deck_patio: "Deck / Patio",
  basement_finish: "Basement Finish",
  roofing: "Roofing",
  concrete_flatwork: "Concrete Flatwork",
  framing_only: "Framing Only",
  landscaping: "Landscaping",
};

const FINISH_LEVEL_LABELS: Record<string, { label: string; desc: string }> = {
  basic:    { label: "Basic",    desc: "Builder-grade / functional" },
  standard: { label: "Standard", desc: "Mid-range / good quality" },
  premium:  { label: "Premium",  desc: "High-end finishes & fixtures" },
  luxury:   { label: "Luxury",   desc: "Bespoke / custom everything" },
};

const CATEGORY_COLORS: Record<string, string> = {
  labour:    "#3b82f6",
  materials: "#10b981",
  addon:     "#8b5cf6",
  overhead:  "#f59e0b",
};

const MARGIN_PRESETS = [0, 10, 15, 20, 25, 30];

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function EstimatorScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { scanId: rawScanId, scanName } = useLocalSearchParams<{ scanId?: string; scanName?: string }>();
  const incomingScanId = rawScanId ? parseInt(rawScanId, 10) : undefined;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputMode, setInputMode] = useState<"text" | "form" | "voice">("text");

  // Step 1
  const [freeText, setFreeText] = useState("");

  // Step 2
  const [params, setParams] = useState<ParsedParams>({
    project_type: "renovation_residential",
    square_feet: 1000,
    finish_level: "standard",
    addons: [],
    confidence: 100,
    notes: "",
  });
  const [marginPct, setMarginPct] = useState(15);

  // Step 3
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // UI state
  const [showHistory, setShowHistory] = useState(false);
  const [savedEstimateId, setSavedEstimateId] = useState<number | null>(null);

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");

  // To-quote dialog
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteClientName, setQuoteClientName] = useState("");
  const [quoteClientEmail, setQuoteClientEmail] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [createdQuoteNum, setCreatedQuoteNum] = useState<string | null>(null);

  // Voice pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);
  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [pulseAnim]);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: modelsData } = useQuery<{ models: CostModel[]; addons: AddonModel[] }>({
    queryKey: ["estimator-cost-models"],
    queryFn: () => customFetch("/api/estimator/cost-models"),
  });

  const { data: savedEstimates = [] } = useQuery<SavedEstimate[]>({
    queryKey: ["smart-estimates"],
    queryFn: () => customFetch("/api/estimator/smart-estimates"),
  });

  const addons = modelsData?.addons ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────────

  const parseMutation = useMutation({
    mutationFn: (prompt: string) =>
      customFetch<ParsedParams>("/api/estimator/parse", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: (data) => {
      setParams(data);
      setStep(2);
    },
    onError: (err: any) => Alert.alert("Parse Error", err?.message ?? "Failed to parse description"),
  });

  const calculateMutation = useMutation({
    mutationFn: (p: ParsedParams & { margin_pct: number }) =>
      customFetch<EstimateResult>("/api/estimator/calculate", {
        method: "POST",
        body: JSON.stringify({
          project_type: p.project_type,
          square_feet: p.square_feet,
          finish_level: p.finish_level,
          addons: p.addons,
          margin_pct: p.margin_pct,
        }),
      }),
    onSuccess: (data) => {
      setEstimateResult(data);
      setLineItems(data.lineItems);
      setMarginPct(data.summary.suggestedMarginPct);
      setStep(3);
    },
    onError: (err: any) => Alert.alert("Calculation Error", err?.message ?? "Failed to calculate estimate"),
  });

  const saveMutation = useMutation({
    mutationFn: (body: { title: string; params: object; result: object; sourcePrompt?: string; scanId?: number }) =>
      customFetch<{ id: number }>("/api/estimator/smart-estimates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      setSavedEstimateId(saved.id);
      setShowSaveDialog(false);
      queryClient.invalidateQueries({ queryKey: ["smart-estimates"] });
      Alert.alert("Saved!", "Estimate saved. Record the actual cost when the project is complete to improve future estimates.");
    },
    onError: (err: any) => Alert.alert("Save Error", err?.message ?? "Failed to save estimate"),
  });

  const toQuoteMutation = useMutation({
    mutationFn: (body: {
      title: string;
      clientName: string;
      clientEmail?: string;
      notes?: string;
      sourcePrompt?: string;
      lineItems: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
    }) =>
      customFetch<{ id: number; quoteNumber: string }>("/api/estimator/to-quote", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setCreatedQuoteNum(data.quoteNumber);
      setShowQuoteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    onError: (err: any) => Alert.alert("Quote Error", err?.message ?? "Failed to create quote"),
  });

  // ── Voice transcript handler ─────────────────────────────────────────────────

  const handleTranscript = useCallback(async (text: string) => {
    setFreeText(text);
    parseMutation.mutate(text);
  }, []);

  const voiceRecorder = useVoiceRecorder(handleTranscript);

  const handleMicPress = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (voiceRecorder.state === "idle") {
      startPulse();
      await voiceRecorder.toggle();
    } else if (voiceRecorder.state === "recording") {
      stopPulse();
      await voiceRecorder.toggle();
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleParseAndNext = () => {
    if (inputMode === "text") {
      if (freeText.trim().length < 10) {
        Alert.alert("Too short", "Please describe your project in at least 10 characters.");
        return;
      }
      parseMutation.mutate(freeText.trim());
    } else {
      setStep(2);
    }
  };

  const handleCalculate = () => {
    if (params.square_feet <= 0) {
      Alert.alert("Invalid", "Please enter a square footage greater than 0.");
      return;
    }
    calculateMutation.mutate({ ...params, margin_pct: marginPct });
  };

  const handleSave = () => {
    if (!estimateResult || !saveTitle.trim()) return;
    const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const liveContingency = Math.round(liveSubtotal * (estimateResult.summary.contingencyPct / 100));
    const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
    saveMutation.mutate({
      title: saveTitle.trim(),
      sourcePrompt: freeText || undefined,
      scanId: incomingScanId,
      params: { ...params, margin_pct: marginPct },
      result: {
        lineItems,
        summary: {
          ...estimateResult.summary,
          priceToClient: liveSubtotal + liveContingency + liveMargin,
          suggestedMarginPct: marginPct,
          suggestedMarginAmount: liveMargin,
        },
        costModelUsed: estimateResult.costModelUsed,
      },
    });
  };

  const handleToQuote = () => {
    if (!estimateResult || !quoteClientName.trim()) return;
    const title = `${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`;
    toQuoteMutation.mutate({
      title,
      clientName: quoteClientName.trim(),
      clientEmail: quoteClientEmail.trim() || undefined,
      notes: quoteNotes.trim() || undefined,
      sourcePrompt: freeText || undefined,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitCost,
        total: li.total,
      })),
    });
  };

  const handleReset = () => {
    setStep(1);
    setFreeText("");
    setEstimateResult(null);
    setLineItems([]);
    setSavedEstimateId(null);
    setCreatedQuoteNum(null);
    setParams({ project_type: "renovation_residential", square_feet: 1000, finish_level: "standard", addons: [], confidence: 100, notes: "" });
    setMarginPct(15);
    stopPulse();
  };

  const toggleAddon = (key: string) => {
    setParams((p) => ({
      ...p,
      addons: p.addons.includes(key) ? p.addons.filter((k) => k !== key) : [...p.addons, key],
    }));
  };

  // ── Live calculation (step 3) ────────────────────────────────────────────────

  const liveSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const liveContingency = estimateResult
    ? Math.round(liveSubtotal * (estimateResult.summary.contingencyPct / 100))
    : 0;
  const liveMargin = Math.round((liveSubtotal + liveContingency) * (marginPct / 100));
  const livePriceToClient = liveSubtotal + liveContingency + liveMargin;

  const isLoading = parseMutation.isPending || calculateMutation.isPending;

  // ── Render ───────────────────────────────────────────────────────────────────

  const c = colors;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.background }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Step Indicator ── */}
      <View style={s.stepRow}>
        {([
          { n: 1, label: "Describe" },
          { n: 2, label: "Review" },
          { n: 3, label: "Estimate" },
        ] as const).map(({ n, label }, idx, arr) => (
          <React.Fragment key={n}>
            <View style={s.stepItem}>
              <View style={[
                s.stepCircle,
                step > n && { backgroundColor: GOLD },
                step === n && { backgroundColor: "transparent", borderWidth: 2, borderColor: GOLD },
                step < n && { backgroundColor: c.muted },
              ]}>
                {step > n
                  ? <Feather name="check" size={12} color="#111" />
                  : <Text style={[s.stepNum, { color: step === n ? GOLD : c.mutedForeground }]}>{n}</Text>
                }
              </View>
              <Text style={[s.stepLabel, { color: step === n ? c.foreground : c.mutedForeground }]}>{label}</Text>
            </View>
            {idx < arr.length - 1 && (
              <View style={[s.stepLine, { backgroundColor: step > n ? GOLD : c.border }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* ── History Panel ── */}
      <TouchableOpacity
        style={[s.historyHeader, { backgroundColor: c.card, borderColor: c.border }]}
        onPress={() => setShowHistory((v) => !v)}
        activeOpacity={0.8}
      >
        <Feather name="clock" size={14} color={GOLD} />
        <Text style={[s.historyHeaderText, { color: c.foreground }]}>
          Saved Estimates
          {savedEstimates.length > 0 && (
            <Text style={{ color: GOLD }}> ({savedEstimates.length})</Text>
          )}
        </Text>
        <Feather name={showHistory ? "chevron-up" : "chevron-down"} size={14} color={c.mutedForeground} />
      </TouchableOpacity>

      {showHistory && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {savedEstimates.length === 0 ? (
            <Text style={[s.muted, { color: c.mutedForeground, textAlign: "center", padding: 12 }]}>
              No saved estimates yet.
            </Text>
          ) : (
            savedEstimates.map((e) => {
              const res = e.result as any;
              const price = res?.summary?.priceToClient;
              return (
                <View key={e.id} style={[s.historyRow, { borderBottomColor: c.border }]}>
                  <Feather name="file-text" size={14} color={c.mutedForeground} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyTitle, { color: c.foreground }]} numberOfLines={1}>{e.title}</Text>
                    <Text style={[s.muted, { color: c.mutedForeground }]}>{format(new Date(e.createdAt), "MMM d, yyyy")}</Text>
                  </View>
                  {price != null && (
                    <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13 }}>{fmt(price)}</Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ═══════════════════════════════ STEP 1 ═══════════════════════════════ */}
      {step === 1 && (
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.foreground }]}>Describe Your Project</Text>

          {/* Mode toggle */}
          <View style={[s.modeTabs, { backgroundColor: c.muted, borderColor: c.border }]}>
            {(["text", "form", "voice"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setInputMode(m)}
                style={[s.modeTab, inputMode === m && { backgroundColor: c.card }]}
                activeOpacity={0.7}
              >
                <Text style={[s.modeTabText, { color: inputMode === m ? c.foreground : c.mutedForeground }]}>
                  {m === "text" ? "Free Text" : m === "form" ? "Manual Form" : "🎙 Voice"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Free Text mode */}
          {inputMode === "text" && (
            <>
              <View style={[s.textareaWrap, { borderColor: c.border, backgroundColor: c.input }]}>
                <TextInput
                  style={[s.textarea, { color: c.foreground }]}
                  placeholder="e.g. Finish a 1,200 sqft basement in Toronto with a bedroom, bathroom, and bar area. Mid-range finishes, LVP flooring."
                  placeholderTextColor={c.mutedForeground}
                  value={freeText}
                  onChangeText={setFreeText}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  onPress={handleMicPress}
                  style={[s.inlineMic, { backgroundColor: voiceRecorder.state !== "idle" ? "#EF4444" : c.secondary }]}
                  activeOpacity={0.8}
                >
                  <Feather
                    name={voiceRecorder.state === "recording" ? "square" : "mic"}
                    size={16}
                    color={voiceRecorder.state !== "idle" ? "#fff" : c.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
              {voiceRecorder.state === "recording" && (
                <View style={s.voiceIndicator}>
                  <View style={s.voiceDot} />
                  <Text style={[s.voiceText, { color: "#EF4444" }]}>Recording… tap mic to stop</Text>
                </View>
              )}
              {voiceRecorder.state === "transcribing" && (
                <View style={s.voiceIndicator}>
                  <ActivityIndicator size="small" color={GOLD} />
                  <Text style={[s.voiceText, { color: c.mutedForeground }]}>Transcribing…</Text>
                </View>
              )}
              {voiceRecorder.error && (
                <Text style={{ color: colors.destructive, fontSize: 12 }}>{voiceRecorder.error}</Text>
              )}
              <Text style={[s.hint, { color: c.mutedForeground }]}>
                Include scope, size, finish quality, and location for the best result. AI parses your description — pricing comes from our database.
              </Text>
            </>
          )}

          {/* Voice-only mode */}
          {inputMode === "voice" && (
            <View style={s.voiceCenter}>
              <Text style={[s.hint, { color: c.mutedForeground, textAlign: "center", marginBottom: 24 }]}>
                {voiceRecorder.state === "recording"
                  ? "Listening… tap the mic to stop"
                  : voiceRecorder.state === "transcribing"
                  ? "Transcribing your description…"
                  : "Tap the mic and describe your project out loud"}
              </Text>
              <Animated.View style={[s.micPulse, { transform: [{ scale: pulseAnim }], backgroundColor: voiceRecorder.state === "recording" ? "#EF444420" : `${GOLD}18` }]} />
              <Pressable
                onPress={handleMicPress}
                style={({ pressed }) => [
                  s.micBtn,
                  {
                    backgroundColor: voiceRecorder.state === "recording" ? "#EF4444" : GOLD,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                {voiceRecorder.state === "transcribing"
                  ? <ActivityIndicator color="#fff" />
                  : <Feather name={voiceRecorder.state === "recording" ? "square" : "mic"} size={32} color="#fff" />
                }
              </Pressable>
              {freeText.length > 0 && (
                <View style={[s.transcriptBox, { backgroundColor: c.muted, borderColor: c.border }]}>
                  <Text style={[{ color: c.mutedForeground, fontSize: 12 }]} numberOfLines={4}>"{freeText}"</Text>
                </View>
              )}
              {voiceRecorder.error && (
                <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 8 }}>{voiceRecorder.error}</Text>
              )}
            </View>
          )}

          {/* Manual Form mode */}
          {inputMode === "form" && (
            <View style={{ gap: 14 }}>
              <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Project Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setParams((p) => ({ ...p, project_type: k }))}
                    style={[
                      s.chip,
                      { borderColor: params.project_type === k ? GOLD : c.border, backgroundColor: params.project_type === k ? `${GOLD}18` : "transparent" },
                    ]}
                  >
                    <Text style={{ fontSize: 12, color: params.project_type === k ? GOLD : c.foreground }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Square Footage</Text>
              <TextInput
                style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input }]}
                value={String(params.square_feet)}
                onChangeText={(v) => setParams((p) => ({ ...p, square_feet: parseFloat(v) || 0 }))}
                keyboardType="numeric"
                placeholderTextColor={c.mutedForeground}
              />

              <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Finish Level</Text>
              <View style={s.finishGrid}>
                {Object.entries(FINISH_LEVEL_LABELS).map(([k, v]) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setParams((p) => ({ ...p, finish_level: k }))}
                    style={[
                      s.finishCard,
                      { borderColor: params.finish_level === k ? GOLD : c.border, backgroundColor: params.finish_level === k ? `${GOLD}14` : c.muted },
                    ]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: params.finish_level === k ? GOLD : c.foreground }}>{v.label}</Text>
                    <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 2 }}>{v.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* CTA — only show for text/form modes; voice auto-advances */}
          {inputMode !== "voice" && (
            <TouchableOpacity
              style={[s.primaryBtn, { opacity: isLoading ? 0.6 : 1 }]}
              onPress={handleParseAndNext}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {parseMutation.isPending ? (
                <ActivityIndicator color="#111" size="small" />
              ) : (
                <>
                  <Feather name={inputMode === "text" ? "zap" : "arrow-right"} size={16} color="#111" />
                  <Text style={s.primaryBtnText}>{inputMode === "text" ? "Extract Parameters with AI" : "Continue to Review"}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ═══════════════════════════════ STEP 2 ═══════════════════════════════ */}
      {step === 2 && (
        <View style={{ gap: 12 }}>
          {/* Confidence warning */}
          {params.confidence < 70 && (
            <View style={[s.warnBox, { backgroundColor: "#451a0350", borderColor: "#f59e0b50" }]}>
              <Feather name="alert-circle" size={14} color="#f59e0b" />
              <Text style={{ color: "#f59e0b", fontSize: 12, flex: 1 }}>
                Low AI confidence ({params.confidence}%) — please review and adjust the fields below.
              </Text>
            </View>
          )}
          {params.confidence >= 70 && params.notes.length > 0 && (
            <View style={[s.warnBox, { backgroundColor: "#1e3a5f50", borderColor: "#3b82f640" }]}>
              <Feather name="info" size={14} color="#60a5fa" />
              <Text style={{ color: "#93c5fd", fontSize: 12, flex: 1 }}>{params.notes}</Text>
            </View>
          )}

          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.row}>
              <Text style={[s.cardTitle, { color: c.foreground }]}>Review & Adjust</Text>
              {params.confidence > 0 && (
                <View style={[s.badge, { borderColor: c.border }]}>
                  <Text style={{ fontSize: 10, color: c.mutedForeground }}>AI: {params.confidence}%</Text>
                </View>
              )}
            </View>

            {/* Project type */}
            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Project Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
              {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setParams((p) => ({ ...p, project_type: k }))}
                  style={[
                    s.chip,
                    { borderColor: params.project_type === k ? GOLD : c.border, backgroundColor: params.project_type === k ? `${GOLD}18` : "transparent" },
                  ]}
                >
                  <Text style={{ fontSize: 12, color: params.project_type === k ? GOLD : c.foreground }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Square footage */}
            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Square Footage</Text>
            <TextInput
              style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input }]}
              value={String(params.square_feet)}
              onChangeText={(v) => setParams((p) => ({ ...p, square_feet: parseFloat(v) || 0 }))}
              keyboardType="numeric"
              placeholderTextColor={c.mutedForeground}
            />

            {/* Finish level */}
            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Finish Level</Text>
            <View style={s.finishGrid}>
              {Object.entries(FINISH_LEVEL_LABELS).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setParams((p) => ({ ...p, finish_level: k }))}
                  style={[
                    s.finishCard,
                    { borderColor: params.finish_level === k ? GOLD : c.border, backgroundColor: params.finish_level === k ? `${GOLD}14` : c.muted },
                  ]}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: params.finish_level === k ? GOLD : c.foreground }}>{v.label}</Text>
                  <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 2 }}>{v.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Profit margin */}
            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Profit Margin</Text>
            <View style={s.marginRow}>
              {MARGIN_PRESETS.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  onPress={() => setMarginPct(pct)}
                  style={[
                    s.marginChip,
                    { borderColor: marginPct === pct ? GOLD : c.border, backgroundColor: marginPct === pct ? `${GOLD}18` : "transparent" },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: marginPct === pct ? GOLD : c.foreground }}>{pct}%</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setMarginPct((v) => Math.max(0, v - 1))}
                style={[s.marginChip, { borderColor: c.border }]}
              >
                <Feather name="minus" size={14} color={c.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMarginPct((v) => Math.min(60, v + 1))}
                style={[s.marginChip, { borderColor: c.border }]}
              >
                <Feather name="plus" size={14} color={c.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: -4 }}>
              Current: <Text style={{ color: GOLD, fontWeight: "700" }}>{marginPct}%</Text>
            </Text>

            {/* Add-ons */}
            {addons.length > 0 && (
              <>
                <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Add-ons & Upgrades</Text>
                <View style={s.addonGrid}>
                  {addons.map((a) => {
                    const on = params.addons.includes(a.addonKey);
                    return (
                      <TouchableOpacity
                        key={a.addonKey}
                        onPress={() => toggleAddon(a.addonKey)}
                        style={[
                          s.addonCard,
                          { borderColor: on ? GOLD : c.border, backgroundColor: on ? `${GOLD}14` : c.muted },
                        ]}
                        activeOpacity={0.7}
                      >
                        <View style={[s.checkbox, { borderColor: on ? GOLD : c.mutedForeground, backgroundColor: on ? GOLD : "transparent" }]}>
                          {on && <Feather name="check" size={10} color="#111" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: "500", color: on ? GOLD : c.foreground }}>{a.name}</Text>
                          <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 1 }}>
                            {a.costType === "per_sqft" ? `$${a.amount}/sqft` : `${fmt(parseFloat(a.amount))} flat`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* DB note */}
            <View style={[s.dbNote, { backgroundColor: c.muted, borderColor: c.border }]}>
              <Feather name="database" size={12} color={GOLD} />
              <Text style={{ fontSize: 11, color: c.mutedForeground, flex: 1 }}>
                Pricing will be looked up from the <Text style={{ color: c.foreground, fontWeight: "600" }}>database cost models</Text> based on project type and finish level. The AI only identified the parameters — it cannot change the rates.
              </Text>
            </View>

            {/* Buttons */}
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.outlineBtn, { borderColor: c.border, paddingHorizontal: 16 }]} onPress={() => setStep(1)}>
                <Feather name="arrow-left" size={14} color={c.foreground} />
                <Text style={{ color: c.foreground, fontSize: 14 }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, marginLeft: 8, flexDirection: "row", gap: 8, opacity: calculateMutation.isPending ? 0.7 : 1 }]}
                onPress={handleCalculate}
                disabled={calculateMutation.isPending}
                activeOpacity={0.8}
              >
                {calculateMutation.isPending
                  ? <ActivityIndicator color="#111" size="small" />
                  : <>
                      <Feather name="zap" size={16} color="#111" />
                      <Text style={s.primaryBtnText}>Generate Estimate</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════ STEP 3 ═══════════════════════════════ */}
      {step === 3 && estimateResult && (
        <View style={{ gap: 12 }}>
          {/* Model banner */}
          <View style={[s.modelBanner, { backgroundColor: `${GOLD}14`, borderColor: `${GOLD}40` }]}>
            <Feather name="database" size={14} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: GOLD, fontWeight: "600", fontSize: 13 }}>
                Pricing model: {estimateResult.costModelUsed.name}
              </Text>
              {estimateResult.costModelUsed.notes && (
                <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>
                  {estimateResult.costModelUsed.notes}
                </Text>
              )}
            </View>
            <View style={[s.badge, { borderColor: `${GOLD}40` }]}>
              <Text style={{ fontSize: 10, color: GOLD }}>{params.square_feet.toLocaleString()} sqft</Text>
            </View>
          </View>

          {/* Cost breakdown grid */}
          <View style={s.costGrid}>
            {[
              { label: "Labour",    value: lineItems.filter(i => i.category === "labour").reduce((s, i) => s + i.total, 0),    color: "#3b82f6" },
              { label: "Materials", value: lineItems.filter(i => i.category === "materials").reduce((s, i) => s + i.total, 0), color: "#10b981" },
              { label: "Add-ons",   value: lineItems.filter(i => i.category === "addon").reduce((s, i) => s + i.total, 0),     color: "#8b5cf6" },
              { label: "Overhead",  value: lineItems.filter(i => i.category === "overhead").reduce((s, i) => s + i.total, 0),  color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <View key={label} style={[s.costCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={{ fontSize: 11, color: c.mutedForeground }}>{label}</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color, marginTop: 3 }}>{fmt(value)}</Text>
              </View>
            ))}
          </View>

          {/* Line Items */}
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.cardTitle, { color: c.foreground }]}>
              <Feather name="list" size={14} color={GOLD} />{" "}Line Items
            </Text>
            {lineItems.map((item, idx) => (
              <View
                key={item.id}
                style={[s.lineItem, { borderTopColor: c.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}
              >
                <View style={[s.catDot, { backgroundColor: CATEGORY_COLORS[item.category] ?? c.mutedForeground }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: c.foreground }}>{item.description}</Text>
                  <Text style={{ fontSize: 11, color: c.mutedForeground, marginTop: 2 }}>
                    {item.quantity.toLocaleString()} {item.unit} × {fmt(item.unitCost)}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.foreground }}>{fmt(item.total)}</Text>
              </View>
            ))}
            {/* Line items total */}
            <View style={[s.lineItem, { borderTopColor: c.border, borderTopWidth: 1, paddingTop: 10 }]}>
              <Text style={{ flex: 1, fontSize: 12, color: c.mutedForeground, textAlign: "right" }}>Line Items Total</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.foreground }}>{fmt(liveSubtotal)}</Text>
            </View>
          </View>

          {/* Cost summary */}
          <View style={[s.card, { backgroundColor: c.card, borderColor: c.border, gap: 10 }]}>
            <Text style={[s.cardTitle, { color: c.foreground }]}>Cost Breakdown</Text>

            <SummaryLine label="Subtotal" value={fmt(liveSubtotal)} colors={c} />
            <View style={[s.divider, { backgroundColor: c.border }]} />
            <SummaryLine
              label={`Contingency (${estimateResult.summary.contingencyPct}%)`}
              value={`+${fmt(liveContingency)}`}
              valueColor="#f59e0b"
              colors={c}
            />
            <View style={[s.divider, { backgroundColor: c.border }]} />

            {/* Margin selector */}
            <View style={s.row}>
              <Text style={{ fontSize: 13, color: c.mutedForeground }}>Profit Margin</Text>
              <View style={s.marginRow}>
                <TouchableOpacity onPress={() => setMarginPct((v) => Math.max(0, v - 1))} style={[s.marginChip, { borderColor: c.border }]}>
                  <Feather name="minus" size={12} color={c.foreground} />
                </TouchableOpacity>
                <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13, minWidth: 36, textAlign: "center" }}>{marginPct}%</Text>
                <TouchableOpacity onPress={() => setMarginPct((v) => Math.min(60, v + 1))} style={[s.marginChip, { borderColor: c.border }]}>
                  <Feather name="plus" size={12} color={c.foreground} />
                </TouchableOpacity>
              </View>
            </View>
            <SummaryLine
              label={`Margin (${marginPct}%)`}
              value={`+${fmt(liveMargin)}`}
              valueColor={GOLD}
              colors={c}
            />

            <View style={[s.divider, { backgroundColor: c.border }]} />

            {/* Total to client */}
            <View style={[s.totalCard, { backgroundColor: "#0A0A0A" }]}>
              <View>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Price to Client (CAD)
                </Text>
                <Text style={{ fontSize: 28, fontWeight: "900", color: GOLD, marginTop: 4 }}>{fmt(livePriceToClient)}</Text>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  excl. HST/GST · {params.square_feet.toLocaleString()} sqft
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Cost: {fmt(liveSubtotal)}</Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>+Cont: {fmt(liveContingency)}</Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>+Margin: {fmt(liveMargin)}</Text>
              </View>
            </View>
          </View>

          {/* Saved badge */}
          {savedEstimateId && (
            <View style={[s.warnBox, { backgroundColor: "#14532d30", borderColor: "#166534" }]}>
              <Feather name="check-circle" size={14} color="#22c55e" />
              <Text style={{ color: "#86efac", fontSize: 12, flex: 1 }}>
                Estimate saved! Record the actual cost when the project is complete to improve future accuracy.
              </Text>
            </View>
          )}

          {createdQuoteNum && (
            <View style={[s.warnBox, { backgroundColor: `${GOLD}14`, borderColor: `${GOLD}40` }]}>
              <Feather name="check-circle" size={14} color={GOLD} />
              <Text style={{ color: GOLD, fontSize: 12, flex: 1 }}>
                Quote <Text style={{ fontWeight: "700" }}>{createdQuoteNum}</Text> created as a draft.
              </Text>
            </View>
          )}

          {/* DB source note */}
          <View style={[s.dbNote, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="database" size={12} color={GOLD} />
            <Text style={{ fontSize: 11, color: c.mutedForeground, flex: 1 }}>
              All pricing sourced from database models — not AI-generated.
            </Text>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: GOLD }]}
              onPress={() => {
                setSaveTitle(`${PROJECT_TYPE_LABELS[params.project_type] ?? params.project_type} — ${params.square_feet} sqft`);
                setShowSaveDialog(true);
              }}
              disabled={saveMutation.isPending}
              activeOpacity={0.8}
            >
              <Feather name="save" size={14} color="#111" />
              <Text style={{ color: "#111", fontWeight: "700", fontSize: 13 }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: `${GOLD}50` }]}
              onPress={() => setShowQuoteDialog(true)}
              activeOpacity={0.8}
            >
              <Feather name="send" size={14} color={GOLD} />
              <Text style={{ color: GOLD, fontWeight: "600", fontSize: 13 }}>To Quotes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}
              onPress={() => setStep(2)}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={14} color={c.foreground} />
              <Text style={{ color: c.foreground, fontSize: 13 }}>Adjust</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.outlineBtn, { borderColor: c.border, alignSelf: "stretch" }]}
            onPress={handleReset}
          >
            <Feather name="refresh-ccw" size={14} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Start New Estimate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Save Modal ──────────────────────────────────────────────────────────── */}
      <Modal visible={showSaveDialog} transparent animationType="fade" onRequestClose={() => setShowSaveDialog(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.cardTitle, { color: c.foreground, marginBottom: 4 }]}>Save Estimate</Text>
            <Text style={[s.hint, { color: c.mutedForeground, marginBottom: 12 }]}>Give your estimate a name so you can find it later.</Text>
            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Estimate Name</Text>
            <TextInput
              style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input }]}
              value={saveTitle}
              onChangeText={setSaveTitle}
              placeholder="e.g. Smith Basement Renovation"
              placeholderTextColor={c.mutedForeground}
              autoFocus
            />
            <View style={[s.btnRow, { marginTop: 16 }]}>
              <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: c.border }]} onPress={() => setShowSaveDialog(false)}>
                <Text style={{ color: c.foreground, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, marginLeft: 8, opacity: !saveTitle.trim() || saveMutation.isPending ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={!saveTitle.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? <ActivityIndicator color="#111" size="small" />
                  : <Text style={s.primaryBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── To-Quote Modal ──────────────────────────────────────────────────────── */}
      <Modal visible={showQuoteDialog} transparent animationType="fade" onRequestClose={() => setShowQuoteDialog(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.cardTitle, { color: c.foreground, marginBottom: 4 }]}>Send to Quotes</Text>
            <Text style={[s.hint, { color: c.mutedForeground, marginBottom: 12 }]}>
              Creates a draft quote in the Quotes section using the current line items and pricing.
            </Text>

            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Client Name *</Text>
            <TextInput
              style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input, marginBottom: 10 }]}
              value={quoteClientName}
              onChangeText={setQuoteClientName}
              placeholder="e.g. John Smith or Acme Construction"
              placeholderTextColor={c.mutedForeground}
              autoCapitalize="words"
            />

            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Client Email (optional)</Text>
            <TextInput
              style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input, marginBottom: 10 }]}
              value={quoteClientEmail}
              onChangeText={setQuoteClientEmail}
              placeholder="client@example.com"
              placeholderTextColor={c.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[s.fieldLabel, { color: c.mutedForeground }]}>Notes (optional)</Text>
            <TextInput
              style={[s.input, { color: c.foreground, borderColor: c.border, backgroundColor: c.input }]}
              value={quoteNotes}
              onChangeText={setQuoteNotes}
              placeholder="Any additional notes…"
              placeholderTextColor={c.mutedForeground}
            />

            <View style={[s.btnRow, { marginTop: 16 }]}>
              <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: c.border }]} onPress={() => setShowQuoteDialog(false)}>
                <Text style={{ color: c.foreground, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1, marginLeft: 8, opacity: !quoteClientName.trim() || toQuoteMutation.isPending ? 0.6 : 1 }]}
                onPress={handleToQuote}
                disabled={!quoteClientName.trim() || toQuoteMutation.isPending}
              >
                {toQuoteMutation.isPending
                  ? <ActivityIndicator color="#111" size="small" />
                  : <Text style={s.primaryBtnText}>Create Quote</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SummaryLine({ label, value, valueColor, colors }: { label: string; value: string; valueColor?: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={s.row}>
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: valueColor ?? colors.foreground }}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },

  // Step indicator
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepItem: { alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontWeight: "700" },
  stepLabel: { fontSize: 11, marginTop: 4, fontWeight: "500" },
  stepLine: { flex: 1, height: 2, marginHorizontal: 8, marginBottom: 16 },

  // History
  historyHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  historyHeaderText: { flex: 1, fontSize: 13, fontWeight: "600" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  historyTitle: { fontSize: 13, fontWeight: "500" },

  // Cards
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  divider: { height: StyleSheet.hairlineWidth },
  muted: { fontSize: 12 },
  hint: { fontSize: 12, lineHeight: 18 },

  // Input mode tabs
  modeTabs: { flexDirection: "row", borderRadius: 8, padding: 3, borderWidth: 1, gap: 2 },
  modeTab: { flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center" },
  modeTabText: { fontSize: 12, fontWeight: "600" },

  // Text area
  textareaWrap: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 120, position: "relative" },
  textarea: { fontSize: 14, minHeight: 100, textAlignVertical: "top", paddingRight: 40 },
  inlineMic: { position: "absolute", right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  // Voice
  voiceIndicator: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4 },
  voiceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  voiceText: { fontSize: 12 },
  voiceCenter: { alignItems: "center", paddingVertical: 20, gap: 16 },
  micPulse: { position: "absolute", width: 100, height: 100, borderRadius: 50 },
  micBtn: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  transcriptBox: { borderWidth: 1, borderRadius: 8, padding: 10, maxWidth: "100%", marginTop: 8 },

  // Inputs
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 },

  // Chips
  chipScroll: { flexGrow: 0 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },

  // Finish level
  finishGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  finishCard: { flex: 1, minWidth: "46%", borderWidth: 1, borderRadius: 8, padding: 10 },

  // Margin
  marginRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  marginChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", justifyContent: "center" },

  // Add-ons
  addonGrid: { gap: 8 },
  addonCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 8, padding: 10 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" },

  // DB note
  dbNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },

  // Buttons
  btnRow: { flexDirection: "row", alignItems: "center" },
  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#111", fontWeight: "700", fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },

  // Warnings
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },

  // Step 3
  modelBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  costGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  costCard: { flex: 1, minWidth: "44%", borderWidth: 1, borderRadius: 10, padding: 12 },
  lineItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  totalCard: { borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalBox: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20, gap: 8 },

  // Summary lines
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
});
