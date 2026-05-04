import React, { useState } from "react";
import {
  KeyboardAvoidingView,
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
import { useColors } from "@/hooks/useColors";

type CalcId =
  | "concrete-slab"
  | "paint"
  | "lumber"
  | "roofing"
  | "drywall"
  | "flooring"
  | "ohms-law"
  | "markup";

interface CalcDef {
  id: CalcId;
  name: string;
  icon: string;
  color: string;
  description: string;
  fields: { id: string; label: string; unit?: string; placeholder?: string }[];
  calculate: (vals: Record<string, string>) => { label: string; value: string; highlight?: boolean }[] | null;
}

const CALCS: CalcDef[] = [
  {
    id: "concrete-slab",
    name: "Concrete Slab",
    icon: "grid",
    color: "#78716C",
    description: "Volume & bags for any slab",
    fields: [
      { id: "length", label: "Length", unit: "ft", placeholder: "20" },
      { id: "width", label: "Width", unit: "ft", placeholder: "12" },
      { id: "depth", label: "Depth", unit: "in", placeholder: "4" },
    ],
    calculate({ length, width, depth }) {
      const l = parseFloat(length), w = parseFloat(width), d = parseFloat(depth);
      if (!l || !w || !d) return null;
      const cubicFt = l * w * (d / 12);
      const cubicYd = cubicFt / 27;
      const bags80lb = Math.ceil(cubicYd / 0.022 * 1.1);
      return [
        { label: "Cubic yards", value: `${cubicYd.toFixed(2)} yd³`, highlight: true },
        { label: "Cubic feet", value: `${cubicFt.toFixed(1)} ft³` },
        { label: "80 lb bags (+ 10% waste)", value: `${bags80lb} bags`, highlight: true },
      ];
    },
  },
  {
    id: "paint",
    name: "Paint Coverage",
    icon: "droplet",
    color: "#3B82F6",
    description: "Litres needed for any room",
    fields: [
      { id: "length", label: "Room Length", unit: "ft", placeholder: "14" },
      { id: "width", label: "Room Width", unit: "ft", placeholder: "12" },
      { id: "height", label: "Wall Height", unit: "ft", placeholder: "9" },
      { id: "doors", label: "Doors / Windows", unit: "count", placeholder: "2" },
    ],
    calculate({ length, width, height, doors }) {
      const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height), d = parseFloat(doors) || 0;
      if (!l || !w || !h) return null;
      const wallArea = 2 * (l + w) * h - d * 20; // ~20 sqft per door/window
      const coats = 2;
      const litres = Math.ceil((wallArea * coats) / 40); // ~40 sqft/litre
      const gallons = Math.ceil(litres / 3.785);
      return [
        { label: "Wall area", value: `${wallArea.toFixed(0)} ft²` },
        { label: "Litres needed (2 coats)", value: `${litres} L`, highlight: true },
        { label: "Gallons needed", value: `${gallons} gal`, highlight: true },
      ];
    },
  },
  {
    id: "lumber",
    name: "Lumber Board Feet",
    icon: "align-left",
    color: "#D97706",
    description: "Board feet for framing",
    fields: [
      { id: "pieces", label: "Number of pieces", placeholder: "10" },
      { id: "thickness", label: "Thickness", unit: "in", placeholder: "2" },
      { id: "width", label: "Width", unit: "in", placeholder: "6" },
      { id: "length", label: "Length", unit: "ft", placeholder: "8" },
    ],
    calculate({ pieces, thickness, width, length }) {
      const p = parseFloat(pieces), t = parseFloat(thickness), w = parseFloat(width), l = parseFloat(length);
      if (!p || !t || !w || !l) return null;
      const boardFeet = p * (t * w * l) / 12;
      return [
        { label: "Board feet", value: `${boardFeet.toFixed(2)} bf`, highlight: true },
        { label: "Per piece", value: `${(boardFeet / p).toFixed(2)} bf` },
      ];
    },
  },
  {
    id: "roofing",
    name: "Roofing Squares",
    icon: "home",
    color: "#EF4444",
    description: "Shingles for any roof area",
    fields: [
      { id: "length", label: "Roof Length", unit: "ft", placeholder: "40" },
      { id: "width", label: "Roof Width", unit: "ft", placeholder: "30" },
      { id: "pitch", label: "Pitch (rise/12)", unit: "/12", placeholder: "6" },
    ],
    calculate({ length, width, pitch }) {
      const l = parseFloat(length), w = parseFloat(width), p = parseFloat(pitch) || 0;
      if (!l || !w) return null;
      const pitchFactor = Math.sqrt(1 + (p / 12) ** 2);
      const roofArea = l * w * pitchFactor;
      const squares = roofArea / 100;
      const bundles = Math.ceil(squares * 3 * 1.1); // 3 bundles/square + 10% waste
      return [
        { label: "Roof area", value: `${roofArea.toFixed(0)} ft²` },
        { label: "Squares", value: `${squares.toFixed(2)} sq`, highlight: true },
        { label: "Bundles (+ 10% waste)", value: `${bundles} bundles`, highlight: true },
      ];
    },
  },
  {
    id: "drywall",
    name: "Drywall Sheets",
    icon: "layers",
    color: "#8B5CF6",
    description: "4×8 sheets for walls & ceilings",
    fields: [
      { id: "area", label: "Total area", unit: "ft²", placeholder: "500" },
    ],
    calculate({ area }) {
      const a = parseFloat(area);
      if (!a) return null;
      const sheets = Math.ceil((a / 32) * 1.1);
      return [
        { label: "4×8 sheets (+ 10% waste)", value: `${sheets} sheets`, highlight: true },
        { label: "Area per sheet", value: "32 ft²" },
      ];
    },
  },
  {
    id: "flooring",
    name: "Flooring / Tile",
    icon: "square",
    color: "#10B981",
    description: "Material needed for any floor",
    fields: [
      { id: "length", label: "Room Length", unit: "ft", placeholder: "15" },
      { id: "width", label: "Room Width", unit: "ft", placeholder: "12" },
      { id: "tileSize", label: "Tile / Plank size", unit: "in²", placeholder: "144" },
    ],
    calculate({ length, width, tileSize }) {
      const l = parseFloat(length), w = parseFloat(width), ts = parseFloat(tileSize) || 144;
      if (!l || !w) return null;
      const roomSqft = l * w;
      const sqftWithWaste = roomSqft * 1.1;
      const tiles = Math.ceil((sqftWithWaste * 144) / ts);
      return [
        { label: "Floor area", value: `${roomSqft.toFixed(1)} ft²` },
        { label: "With 10% waste", value: `${sqftWithWaste.toFixed(1)} ft²` },
        { label: "Tiles / planks needed", value: `${tiles}`, highlight: true },
      ];
    },
  },
  {
    id: "ohms-law",
    name: "Ohm's Law",
    icon: "zap",
    color: "#F59E0B",
    description: "Voltage, current & resistance",
    fields: [
      { id: "voltage", label: "Voltage (V)", unit: "V", placeholder: "120" },
      { id: "resistance", label: "Resistance (Ω)", unit: "Ω", placeholder: "20" },
    ],
    calculate({ voltage, resistance }) {
      const v = parseFloat(voltage), r = parseFloat(resistance);
      if (!v || !r) return null;
      const amps = v / r;
      const watts = v * amps;
      return [
        { label: "Current", value: `${amps.toFixed(3)} A`, highlight: true },
        { label: "Power", value: `${watts.toFixed(1)} W`, highlight: true },
        { label: "Resistance", value: `${r} Ω` },
      ];
    },
  },
  {
    id: "markup",
    name: "Job Markup",
    icon: "percent",
    color: "#FF6600",
    description: "Material + labour pricing",
    fields: [
      { id: "materials", label: "Materials cost", unit: "$", placeholder: "2500" },
      { id: "labour", label: "Labour cost", unit: "$", placeholder: "1800" },
      { id: "markup", label: "Markup %", unit: "%", placeholder: "20" },
    ],
    calculate({ materials, labour, markup }) {
      const mat = parseFloat(materials) || 0;
      const lab = parseFloat(labour) || 0;
      const mkp = parseFloat(markup) || 0;
      const subtotal = mat + lab;
      const markupAmt = subtotal * (mkp / 100);
      const total = subtotal + markupAmt;
      const hst = total * 0.13;
      return [
        { label: "Subtotal", value: `$${subtotal.toFixed(2)}` },
        { label: `Markup (${mkp}%)`, value: `$${markupAmt.toFixed(2)}` },
        { label: "Job price (pre-tax)", value: `$${total.toFixed(2)}`, highlight: true },
        { label: "HST (13%)", value: `$${hst.toFixed(2)}` },
        { label: "Total with HST", value: `$${(total + hst).toFixed(2)}`, highlight: true },
      ];
    },
  },
];

export default function CalculatorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<CalcDef | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ label: string; value: string; highlight?: boolean }[] | null>(null);

  function openCalc(calc: CalcDef) {
    setActive(calc);
    setVals({});
    setResults(null);
  }

  function closeCalc() {
    setActive(null);
    setVals({});
    setResults(null);
  }

  function calculate() {
    if (!active) return;
    const res = active.calculate(vals);
    setResults(res);
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calculators</Text>
        <View style={{ width: 38 }} />
      </View>

      {active ? (
        // ── Active calculator ──
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.calcScroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
            {/* Back to list */}
            <TouchableOpacity onPress={closeCalc} style={styles.calcBack}>
              <Feather name="chevron-left" size={16} color={colors.primary} />
              <Text style={[styles.calcBackText, { color: colors.primary }]}>All Calculators</Text>
            </TouchableOpacity>

            {/* Title */}
            <View style={[styles.calcHeader, { backgroundColor: active.color + "18" }]}>
              <View style={[styles.calcIconBox, { backgroundColor: active.color }]}>
                <Feather name={active.icon as any} size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.calcTitle, { color: colors.foreground }]}>{active.name}</Text>
                <Text style={[styles.calcDesc, { color: colors.mutedForeground }]}>{active.description}</Text>
              </View>
            </View>

            {/* Fields */}
            <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {active.fields.map((f) => (
                <View key={f.id} style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                    {f.label}{f.unit ? ` (${f.unit})` : ""}
                  </Text>
                  <TextInput
                    style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    keyboardType="decimal-pad"
                    placeholder={f.placeholder ?? "0"}
                    placeholderTextColor={colors.mutedForeground}
                    value={vals[f.id] ?? ""}
                    onChangeText={(t) => {
                      setVals((prev) => ({ ...prev, [f.id]: t }));
                      setResults(null);
                    }}
                    returnKeyType="done"
                  />
                </View>
              ))}
            </View>

            {/* Calculate button */}
            <Pressable
              style={[styles.calcBtn, { backgroundColor: active.color }]}
              onPress={calculate}
            >
              <Feather name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.calcBtnText}>Calculate</Text>
            </Pressable>

            {/* Results */}
            {results && (
              <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Results</Text>
                {results.map((r, i) => (
                  <View key={i} style={[styles.resultRow, i < results.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                    <Text style={[styles.resultValue, { color: r.highlight ? active.color : colors.foreground }]}>{r.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {results === null && active.fields.every((f) => vals[f.id]) && (
              <View style={[styles.resultsCard, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Text style={{ color: "#EF4444", fontSize: 14 }}>Please check your inputs.</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        // ── Calculator grid ──
        <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={[styles.gridHint, { color: colors.mutedForeground }]}>
            Tap a calculator to get started
          </Text>
          {CALCS.map((calc) => (
            <TouchableOpacity
              key={calc.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openCalc(calc)}
              activeOpacity={0.75}
            >
              <View style={[styles.cardIcon, { backgroundColor: calc.color + "20" }]}>
                <Feather name={calc.icon as any} size={22} color={calc.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { color: colors.foreground }]}>{calc.name}</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {calc.description}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.border} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  grid: { padding: 16, gap: 10 },
  gridHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 6 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  calcScroll: { padding: 16, gap: 14 },
  calcBack: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  calcBackText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  calcHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 12 },
  calcIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  calcTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  calcDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  fieldsCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  fieldRow: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  calcBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  calcBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resultsCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  resultsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  resultLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  resultValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
