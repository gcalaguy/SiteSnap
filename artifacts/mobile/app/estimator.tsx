import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const GOLD = "#C9A84C";
const BLACK = "#0A0A0A";

type ParsedParams = {
  project_type: string;
  square_feet: number;
  finish_level: string;
  addons: string[];
  confidence: number;
  notes: string;
};

type EstimateResult = {
  summary: {
    laborTotal: number;
    materialsTotal: number;
    addonsTotal: number;
    overhead: number;
    subtotal: number;
    contingency: number;
    contingencyPct: number;
    priceToClient: number;
    suggestedMarginPct: number;
  };
  costModelUsed: { name: string; notes?: string | null };
};

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
};

const FINISH_LEVELS = ["basic", "standard", "premium", "luxury"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function EstimatorScreen() {
  const colors = useColors();
  const isDark = false;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState("");
  const [params, setParams] = useState<ParsedParams>({
    project_type: "renovation_residential",
    square_feet: 1000,
    finish_level: "standard",
    addons: [],
    confidence: 100,
    notes: "",
  });
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  async function handleParse() {
    if (description.trim().length < 10) {
      Alert.alert("Too short", "Please describe your project in more detail.");
      return;
    }
    setIsParsing(true);
    try {
      const data = await customFetch<ParsedParams>("/api/estimator/parse", {
        method: "POST",
        body: JSON.stringify({ prompt: description.trim() }),
      });
      setParams(data);
      setStep(2);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to parse project description");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCalculate() {
    setIsCalculating(true);
    try {
      const data = await customFetch<EstimateResult>("/api/estimator/calculate", {
        method: "POST",
        body: JSON.stringify({
          project_type: params.project_type,
          square_feet: params.square_feet,
          finish_level: params.finish_level,
          addons: params.addons,
          margin_pct: 15,
        }),
      });
      setResult(data);
      setStep(3);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to calculate estimate");
    } finally {
      setIsCalculating(false);
    }
  }

  function handleReset() {
    setStep(1);
    setDescription("");
    setResult(null);
    setParams({
      project_type: "renovation_residential",
      square_feet: 1000,
      finish_level: "standard",
      addons: [],
      confidence: 100,
      notes: "",
    });
  }

  const cardBg = colors.card;
  const borderColor = colors.border;
  const textPrimary = colors.foreground;
  const textMuted = colors.mutedForeground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Step indicator */}
      <View style={styles.steps}>
        {[
          { n: 1, label: "Describe" },
          { n: 2, label: "Review" },
          { n: 3, label: "Estimate" },
        ].map(({ n, label }, idx, arr) => (
          <React.Fragment key={n}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                { backgroundColor: step >= n ? GOLD : isDark ? "#333" : "#e5e7eb" },
              ]}>
                <Text style={[styles.stepNum, { color: step >= n ? BLACK : textMuted }]}>{n}</Text>
              </View>
              <Text style={[styles.stepLabel, { color: step === n ? textPrimary : textMuted }]}>{label}</Text>
            </View>
            {idx < arr.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: step > n ? GOLD : isDark ? "#333" : "#e5e7eb" }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* Step 1 — Describe project */}
      {step === 1 && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Describe your project</Text>
          <TextInput
            style={[
              styles.textarea,
              { color: textPrimary, backgroundColor: isDark ? "#111" : "#f9fafb", borderColor },
            ]}
            placeholder="e.g. Finish a 1,200 sqft basement in Toronto with a bedroom, bathroom, and bar area. Mid-range finishes, LVP flooring."
            placeholderTextColor={textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          <Text style={[styles.hint, { color: textMuted }]}>
            Include scope, size, finish quality, and location for the best result. AI parses your description — pricing comes from our database.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { opacity: isParsing || description.trim().length < 10 ? 0.6 : 1 }]}
            onPress={handleParse}
            disabled={isParsing || description.trim().length < 10}
            activeOpacity={0.8}
          >
            {isParsing ? (
              <ActivityIndicator color={BLACK} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Extract Parameters →</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 — Review params */}
      {step === 2 && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Review Parameters</Text>

          {params.confidence < 70 && (
            <View style={[styles.warningBox, { borderColor: "#f59e0b", backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "#fffbeb" }]}>
              <Text style={{ color: "#b45309", fontSize: 12 }}>
                Low confidence ({params.confidence}%) — please review and adjust the fields below.
              </Text>
            </View>
          )}

          {/* Project type */}
          <Text style={[styles.fieldLabel, { color: textMuted }]}>Project Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
              <TouchableOpacity
                key={k}
                onPress={() => setParams((p) => ({ ...p, project_type: k }))}
                style={[
                  styles.chip,
                  { borderColor: params.project_type === k ? GOLD : borderColor,
                    backgroundColor: params.project_type === k ? (isDark ? "rgba(201,168,76,0.15)" : "#fef9ec") : "transparent" },
                ]}
              >
                <Text style={{ fontSize: 12, color: params.project_type === k ? GOLD : textPrimary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Square footage */}
          <Text style={[styles.fieldLabel, { color: textMuted }]}>Square Footage</Text>
          <TextInput
            style={[styles.input, { color: textPrimary, backgroundColor: isDark ? "#111" : "#f9fafb", borderColor }]}
            value={String(params.square_feet)}
            onChangeText={(v) => setParams((p) => ({ ...p, square_feet: parseFloat(v) || 0 }))}
            keyboardType="numeric"
            placeholderTextColor={textMuted}
          />

          {/* Finish level */}
          <Text style={[styles.fieldLabel, { color: textMuted }]}>Finish Level</Text>
          <View style={styles.finishRow}>
            {FINISH_LEVELS.map((fl) => (
              <TouchableOpacity
                key={fl}
                onPress={() => setParams((p) => ({ ...p, finish_level: fl }))}
                style={[
                  styles.finishBtn,
                  { borderColor: params.finish_level === fl ? GOLD : borderColor,
                    backgroundColor: params.finish_level === fl ? (isDark ? "rgba(201,168,76,0.15)" : "#fef9ec") : "transparent" },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: params.finish_level === fl ? GOLD : textPrimary, textTransform: "capitalize" }}>{fl}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor }]} onPress={() => setStep(1)}>
              <Text style={{ color: textMuted, fontSize: 14 }}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1, marginLeft: 8, opacity: isCalculating ? 0.7 : 1 }]}
              onPress={handleCalculate}
              disabled={isCalculating}
            >
              {isCalculating ? (
                <ActivityIndicator color={BLACK} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Calculate Estimate →</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3 — Results */}
      {step === 3 && result && (
        <View style={styles.gap}>
          {/* Model banner */}
          <View style={[styles.infoBanner, { backgroundColor: isDark ? "rgba(201,168,76,0.08)" : "#fef9ec", borderColor: "rgba(201,168,76,0.3)" }]}>
            <Text style={{ fontSize: 12, color: GOLD, fontWeight: "600" }}>{result.costModelUsed.name}</Text>
            {result.costModelUsed.notes && (
              <Text style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{result.costModelUsed.notes}</Text>
            )}
          </View>

          {/* Cost cards */}
          <View style={styles.costGrid}>
            {[
              { label: "Labour", value: result.summary.laborTotal, color: "#3b82f6" },
              { label: "Materials", value: result.summary.materialsTotal, color: "#10b981" },
              { label: "Add-ons", value: result.summary.addonsTotal, color: "#8b5cf6" },
              { label: "Overhead", value: result.summary.overhead, color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <View key={label} style={[styles.costCard, { backgroundColor: cardBg, borderColor }]}>
                <Text style={{ fontSize: 11, color: textMuted }}>{label}</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color, marginTop: 2 }}>{fmt(value)}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={[styles.costCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.totalRow}>
              <Text style={{ fontSize: 13, color: textMuted }}>Subtotal</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: textPrimary }}>{fmt(result.summary.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={{ fontSize: 13, color: textMuted }}>Contingency ({result.summary.contingencyPct}%)</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#f59e0b" }}>+{fmt(result.summary.contingency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={{ fontSize: 13, color: textMuted }}>Margin (15%)</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: GOLD }}>+{fmt(result.summary.priceToClient - result.summary.subtotal - result.summary.contingency)}</Text>
            </View>
          </View>

          {/* Total price */}
          <View style={[styles.totalCard, { backgroundColor: BLACK }]}>
            <View>
              <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Price to Client (CAD)</Text>
              <Text style={{ fontSize: 28, fontWeight: "900", color: GOLD, marginTop: 4 }}>{fmt(result.summary.priceToClient)}</Text>
              <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>excl. HST/GST · {params.square_feet.toLocaleString()} sqft</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor, alignSelf: "stretch", paddingVertical: 12 }]}
            onPress={handleReset}
          >
            <Text style={{ color: textMuted, textAlign: "center", fontSize: 14 }}>Start New Estimate</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  stepItem: { alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontWeight: "700" },
  stepLabel: { fontSize: 11, marginTop: 4, fontWeight: "500" },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6, marginBottom: 16 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  textarea: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 120 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: BLACK, fontWeight: "700", fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  chipRow: { flexGrow: 0 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  finishRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  finishBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, flex: 1 },
  btnRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  warningBox: { borderWidth: 1, borderRadius: 8, padding: 10 },
  gap: { gap: 12 },
  infoBanner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  costGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  costCard: { flex: 1, minWidth: "45%", borderWidth: 1, borderRadius: 10, padding: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  totalCard: { borderRadius: 12, padding: 16 },
});
