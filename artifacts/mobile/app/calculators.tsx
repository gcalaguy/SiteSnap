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
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CalcField {
  id: string;
  label: string;
  unit?: string;
  type?: "number" | "select";
  options?: string[];
  placeholder?: string;
}
interface CalcResult { label: string; value: string; highlight?: boolean }
interface CalcStep { label: string; formula: string; result: string }
interface CalcDef {
  id: string;
  category: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  fields: CalcField[];
  calculate: (inputs: Record<string, string>) => { results: CalcResult[]; steps: CalcStep[]; summary: string } | null;
}

// ── Calculator definitions ─────────────────────────────────────────────────────
const CALCS: CalcDef[] = [
  // CONCRETE
  {
    id: "concrete-slab", category: "Concrete", name: "Concrete Slab", description: "Volume and bags needed for any slab",
    icon: "grid", color: "#78716C",
    fields: [
      { id: "length", label: "Length", unit: "ft", type: "number", placeholder: "20" },
      { id: "width",  label: "Width",  unit: "ft", type: "number", placeholder: "12" },
      { id: "depth",  label: "Depth",  unit: "in", type: "number", placeholder: "4" },
      { id: "mix",    label: "Bag mix", type: "select", options: ["40 lb bag", "60 lb bag", "80 lb bag"] },
    ],
    calculate({ length, width, depth, mix }) {
      const l = parseFloat(length), w = parseFloat(width), d = parseFloat(depth);
      if (!l || !w || !d) return null;
      const cubicFt = l * w * (d / 12);
      const cubicYd = cubicFt / 27;
      const yieldPerBag: Record<string, number> = { "40 lb bag": 0.011, "60 lb bag": 0.017, "80 lb bag": 0.022 };
      const bags = Math.ceil(cubicYd * (1 / (yieldPerBag[mix] ?? 0.022)) * 1.1);
      return {
        results: [
          { label: "Volume", value: `${cubicYd.toFixed(2)} yd³`, highlight: true },
          { label: "Cubic feet", value: `${cubicFt.toFixed(1)} ft³` },
          { label: `${mix ?? "80 lb"} bags needed`, value: `${bags} bags (incl. 10% waste)`, highlight: true },
        ],
        steps: [
          { label: "Depth to feet", formula: `${d}" ÷ 12`, result: `${(d/12).toFixed(4)} ft` },
          { label: "Cubic feet", formula: `${l} × ${w} × ${(d/12).toFixed(4)}`, result: `${cubicFt.toFixed(2)} ft³` },
          { label: "Cubic yards", formula: `${cubicFt.toFixed(2)} ÷ 27`, result: `${cubicYd.toFixed(2)} yd³` },
        ],
        summary: `For a ${l}×${w} ft slab at ${d}" deep, you need ${cubicYd.toFixed(2)} yd³ (${bags} × ${mix ?? "80 lb"} bags).`,
      };
    },
  },
  {
    id: "concrete-footing", category: "Concrete", name: "Footing Calculator", description: "Continuous footing volume and bags",
    icon: "grid", color: "#78716C",
    fields: [
      { id: "length", label: "Total run length", unit: "ft", type: "number", placeholder: "60" },
      { id: "width",  label: "Footing width",    unit: "in", type: "number", placeholder: "16" },
      { id: "depth",  label: "Footing depth",    unit: "in", type: "number", placeholder: "8" },
      { id: "mix",    label: "Bag mix", type: "select", options: ["40 lb bag", "60 lb bag", "80 lb bag"] },
    ],
    calculate({ length, width, depth, mix }) {
      const l = parseFloat(length), w = parseFloat(width), d = parseFloat(depth);
      if (!l || !w || !d) return null;
      const cubicFt = l * (w / 12) * (d / 12);
      const cubicYd = cubicFt / 27;
      const yieldPerBag: Record<string, number> = { "40 lb bag": 0.011, "60 lb bag": 0.017, "80 lb bag": 0.022 };
      const bags = Math.ceil(cubicYd * (1 / (yieldPerBag[mix] ?? 0.022)) * 1.1);
      return {
        results: [
          { label: "Volume", value: `${cubicYd.toFixed(2)} yd³`, highlight: true },
          { label: "Bags needed", value: `${bags} bags (10% waste)`, highlight: true },
        ],
        steps: [
          { label: "Width in feet", formula: `${w}" ÷ 12`, result: `${(w/12).toFixed(3)} ft` },
          { label: "Depth in feet", formula: `${d}" ÷ 12`, result: `${(d/12).toFixed(3)} ft` },
          { label: "Cubic yards", formula: `÷ 27`, result: `${cubicYd.toFixed(2)} yd³` },
        ],
        summary: `A ${l} ft footing at ${w}"×${d}" requires ${cubicYd.toFixed(2)} yd³ concrete (${bags} bags).`,
      };
    },
  },
  {
    id: "sonotube", category: "Concrete", name: "Sonotube / Column", description: "Circular column volume and bags",
    icon: "circle", color: "#78716C",
    fields: [
      { id: "diameter", label: "Diameter",          unit: "in", type: "number", placeholder: "10" },
      { id: "height",   label: "Height",             unit: "ft", type: "number", placeholder: "4" },
      { id: "count",    label: "Number of columns",  type: "number", placeholder: "4" },
    ],
    calculate({ diameter, height, count }) {
      const d = parseFloat(diameter), h = parseFloat(height), n = parseFloat(count) || 1;
      if (!d || !h) return null;
      const r = (d / 12) / 2;
      const volOne = Math.PI * r * r * h;
      const volAll = volOne * n;
      const cubicYdAll = volAll / 27;
      const bags80 = Math.ceil(cubicYdAll / 0.022 * 1.1);
      return {
        results: [
          { label: "Volume per column", value: `${(volOne / 27).toFixed(3)} yd³` },
          { label: "Total volume", value: `${cubicYdAll.toFixed(3)} yd³`, highlight: true },
          { label: "80 lb bags", value: `${bags80} bags`, highlight: true },
        ],
        steps: [
          { label: "Radius (ft)", formula: `(${d}" ÷ 12) ÷ 2`, result: `${r.toFixed(4)} ft` },
          { label: "Volume / column", formula: `π × r² × h`, result: `${volOne.toFixed(3)} ft³` },
          { label: `Total (${n} col)`, formula: `× ${n} ÷ 27`, result: `${cubicYdAll.toFixed(3)} yd³` },
        ],
        summary: `${n} sonotube${n > 1 ? "s" : ""} (${d}" × ${h} ft) = ${cubicYdAll.toFixed(3)} yd³ total (${bags80} × 80 lb bags).`,
      };
    },
  },

  // FRAMING
  {
    id: "stud-count", category: "Framing", name: "Stud Count", description: "Number of studs for a wall",
    icon: "align-justify", color: "#D97706",
    fields: [
      { id: "length",  label: "Wall length", unit: "ft", type: "number", placeholder: "16" },
      { id: "spacing", label: "Stud spacing", type: "select", options: ['12" OC', '16" OC', '24" OC'] },
    ],
    calculate({ length, spacing }) {
      const l = parseFloat(length);
      if (!l) return null;
      const oc: Record<string, number> = { '12" OC': 12, '16" OC': 16, '24" OC': 24 };
      const sp = oc[spacing] ?? 16;
      const studs = Math.ceil((l * 12) / sp) + 1;
      const withWaste = Math.ceil(studs * 1.1);
      return {
        results: [
          { label: "Studs required", value: `${studs} studs`, highlight: true },
          { label: "With 10% waste", value: `${withWaste} studs`, highlight: true },
        ],
        steps: [
          { label: "Length in inches", formula: `${l} × 12`, result: `${(l * 12).toFixed(0)}"` },
          { label: "Stud count", formula: `⌈÷ ${sp}⌉ + 1`, result: `${studs} studs` },
        ],
        summary: `A ${l} ft wall at ${spacing ?? '16" OC'} needs ${studs} studs (${withWaste} with waste).`,
      };
    },
  },
  {
    id: "rafter-length", category: "Framing", name: "Rafter Length", description: "True rafter length from pitch and run",
    icon: "trending-up", color: "#D97706",
    fields: [
      { id: "run",   label: "Horizontal run", unit: "ft", type: "number", placeholder: "12" },
      { id: "pitch", label: "Roof pitch", type: "select", options: ["3:12","4:12","5:12","6:12","7:12","8:12","9:12","10:12","12:12"] },
    ],
    calculate({ run, pitch }) {
      const r = parseFloat(run);
      if (!r) return null;
      const [rise] = (pitch ?? "6:12").split(":").map(Number);
      const riseFt = (rise * r) / 12;
      const rafter = Math.sqrt(r * r + riseFt * riseFt);
      const angle = Math.atan(riseFt / r) * (180 / Math.PI);
      return {
        results: [
          { label: "Rafter length", value: `${rafter.toFixed(2)} ft`, highlight: true },
          { label: "Total rise", value: `${(riseFt * 12).toFixed(1)}"` },
          { label: "Angle", value: `${angle.toFixed(1)}°` },
        ],
        steps: [
          { label: "Rise", formula: `(${rise}/12) × ${r}`, result: `${riseFt.toFixed(3)} ft` },
          { label: "Rafter (Pythagoras)", formula: `√(run² + rise²)`, result: `${rafter.toFixed(3)} ft` },
        ],
        summary: `With a ${pitch ?? "6:12"} pitch over ${r} ft run, rafter = ${rafter.toFixed(2)} ft at ${angle.toFixed(1)}°.`,
      };
    },
  },
  {
    id: "board-feet", category: "Framing", name: "Board Feet", description: "Lumber volume in board feet",
    icon: "align-left", color: "#D97706",
    fields: [
      { id: "thickness", label: "Thickness", unit: "in", type: "number", placeholder: "2" },
      { id: "width",     label: "Width",     unit: "in", type: "number", placeholder: "6" },
      { id: "length",    label: "Length",    unit: "ft", type: "number", placeholder: "8" },
      { id: "pieces",    label: "# of pieces", type: "number", placeholder: "10" },
    ],
    calculate({ thickness, width, length, pieces }) {
      const t = parseFloat(thickness), w = parseFloat(width), l = parseFloat(length), n = parseFloat(pieces) || 1;
      if (!t || !w || !l) return null;
      const bfEach = (t * w * l) / 12;
      const bfTotal = bfEach * n;
      return {
        results: [
          { label: "Board feet / piece", value: `${bfEach.toFixed(2)} BF` },
          { label: "Total board feet", value: `${bfTotal.toFixed(2)} BF`, highlight: true },
        ],
        steps: [
          { label: "Formula", formula: "(T × W × L) / 12", result: "" },
          { label: "Per piece", formula: `(${t} × ${w} × ${l}) / 12`, result: `${bfEach.toFixed(2)} BF` },
          { label: "Total", formula: `${bfEach.toFixed(2)} × ${n}`, result: `${bfTotal.toFixed(2)} BF` },
        ],
        summary: `${n} piece${n > 1 ? "s" : ""} of ${t}×${w}×${l} lumber = ${bfTotal.toFixed(2)} board feet.`,
      };
    },
  },

  // ELECTRICAL
  {
    id: "voltage-drop", category: "Electrical", name: "Voltage Drop", description: "Wire voltage drop over distance",
    icon: "zap", color: "#F59E0B",
    fields: [
      { id: "voltage",  label: "Voltage",    unit: "V", type: "select", options: ["120V","208V","240V","347V","600V"] },
      { id: "amperage", label: "Load",       unit: "A", type: "number", placeholder: "20" },
      { id: "wire",     label: "Wire gauge", type: "select", options: ["#14 AWG","#12 AWG","#10 AWG","#8 AWG","#6 AWG","#4 AWG","#2 AWG","#1/0 AWG","#2/0 AWG","#3/0 AWG"] },
      { id: "length",   label: "One-way run", unit: "ft", type: "number", placeholder: "150" },
      { id: "material", label: "Conductor", type: "select", options: ["Copper","Aluminum"] },
    ],
    calculate({ voltage, amperage, wire, length, material }) {
      const v = parseFloat(voltage), a = parseFloat(amperage), l = parseFloat(length);
      if (!v || !a || !l) return null;
      const resistMap: Record<string, Record<string, number>> = {
        Copper:   { "#14 AWG":3.14,"#12 AWG":1.98,"#10 AWG":1.24,"#8 AWG":0.778,"#6 AWG":0.491,"#4 AWG":0.308,"#2 AWG":0.194,"#1/0 AWG":0.122,"#2/0 AWG":0.0967,"#3/0 AWG":0.0766 },
        Aluminum: { "#14 AWG":5.17,"#12 AWG":3.25,"#10 AWG":2.04,"#8 AWG":1.28,"#6 AWG":0.808,"#4 AWG":0.508,"#2 AWG":0.319,"#1/0 AWG":0.201,"#2/0 AWG":0.159,"#3/0 AWG":0.126 },
      };
      const mat = material ?? "Copper";
      const resistPer1000 = resistMap[mat]?.[wire ?? "#12 AWG"] ?? 1.98;
      const resist = (resistPer1000 / 1000) * (l * 2);
      const drop = resist * a;
      const dropPct = (drop / v) * 100;
      const ok = dropPct <= 3;
      return {
        results: [
          { label: "Voltage drop", value: `${drop.toFixed(2)} V`, highlight: true },
          { label: "% drop", value: `${dropPct.toFixed(2)}%`, highlight: true },
          { label: "CEC code", value: ok ? "✓ Within 3% (fine)" : "⚠ Exceeds 3% — upsize wire" },
        ],
        steps: [
          { label: "Resistance / 1000 ft", formula: `${mat} ${wire ?? "#12 AWG"}`, result: `${resistPer1000} Ω/1000 ft` },
          { label: "Round-trip resistance", formula: `(${resistPer1000}/1000) × ${l*2}`, result: `${resist.toFixed(4)} Ω` },
          { label: "Voltage drop (V=IR)", formula: `${resist.toFixed(4)} × ${a}`, result: `${drop.toFixed(2)} V` },
        ],
        summary: `${mat} ${wire ?? "#12 AWG"} over ${l} ft at ${a}A drops ${drop.toFixed(2)} V (${dropPct.toFixed(2)}%). ${ok ? "Meets CEC 3% limit." : "Exceeds CEC 3%."}`,
      };
    },
  },
  {
    id: "breaker-load", category: "Electrical", name: "Breaker Load", description: "Circuit load and breaker sizing",
    icon: "zap", color: "#F59E0B",
    fields: [
      { id: "voltage", label: "Voltage", unit: "V", type: "select", options: ["120V","240V","208V"] },
      { id: "watts",   label: "Total watts", unit: "W", type: "number", placeholder: "3600" },
      { id: "pf",      label: "Power factor", type: "select", options: ["1.0 (resistive)","0.95","0.90","0.85","0.80"] },
    ],
    calculate({ voltage, watts, pf }) {
      const v = parseFloat(voltage), w = parseFloat(watts);
      const pfVal = parseFloat((pf ?? "1.0 (resistive)").split(" ")[0]);
      if (!v || !w) return null;
      const amps = w / (v * pfVal);
      const breakerSizes = [15,20,25,30,40,50,60,70,80,100,125,150,200];
      const breaker = breakerSizes.find((b) => b >= amps * 1.25) ?? 200;
      return {
        results: [
          { label: "Load current", value: `${amps.toFixed(2)} A`, highlight: true },
          { label: "Min. breaker (125%)", value: `${Math.ceil(amps * 1.25)} A` },
          { label: "Recommended breaker", value: `${breaker} A`, highlight: true },
        ],
        steps: [
          { label: "Current I = P/(V×PF)", formula: `${w}/(${v}×${pfVal})`, result: `${amps.toFixed(3)} A` },
          { label: "125% rule", formula: `${amps.toFixed(3)} × 1.25`, result: `${(amps*1.25).toFixed(2)} A` },
          { label: "Next standard size", formula: `≥ ${(amps*1.25).toFixed(2)} A`, result: `${breaker} A` },
        ],
        summary: `${w}W at ${v}V draws ${amps.toFixed(2)}A — requires a ${breaker}A breaker.`,
      };
    },
  },
  {
    id: "ohms-law", category: "Electrical", name: "Ohm's Law", description: "Voltage, current & resistance",
    icon: "zap", color: "#F59E0B",
    fields: [
      { id: "voltage",    label: "Voltage (V)",    unit: "V", placeholder: "120" },
      { id: "resistance", label: "Resistance (Ω)", unit: "Ω", placeholder: "20" },
    ],
    calculate({ voltage, resistance }) {
      const v = parseFloat(voltage), r = parseFloat(resistance);
      if (!v || !r) return null;
      const amps = v / r;
      const watts = v * amps;
      return {
        results: [
          { label: "Current", value: `${amps.toFixed(3)} A`, highlight: true },
          { label: "Power",   value: `${watts.toFixed(1)} W`, highlight: true },
          { label: "Resistance", value: `${r} Ω` },
        ],
        steps: [
          { label: "I = V / R", formula: `${v} / ${r}`, result: `${amps.toFixed(3)} A` },
          { label: "P = V × I", formula: `${v} × ${amps.toFixed(3)}`, result: `${watts.toFixed(1)} W` },
        ],
        summary: `${v}V through ${r}Ω draws ${amps.toFixed(3)}A (${watts.toFixed(1)}W).`,
      };
    },
  },

  // PLUMBING
  {
    id: "pipe-volume", category: "Plumbing", name: "Pipe Volume", description: "Volume of liquid in any pipe",
    icon: "droplet", color: "#3B82F6",
    fields: [
      { id: "diameter", label: "Inner diameter", unit: "in", type: "number", placeholder: "2" },
      { id: "length",   label: "Pipe length",    unit: "ft", type: "number", placeholder: "100" },
    ],
    calculate({ diameter, length }) {
      const d = parseFloat(diameter), l = parseFloat(length);
      if (!d || !l) return null;
      const r = (d / 12) / 2;
      const cubicFt = Math.PI * r * r * l;
      const gallons = cubicFt * 7.48052;
      const litres = gallons * 3.78541;
      return {
        results: [
          { label: "Volume", value: `${gallons.toFixed(2)} US gal`, highlight: true },
          { label: "Metric", value: `${litres.toFixed(1)} L` },
          { label: "Cubic feet", value: `${cubicFt.toFixed(4)} ft³` },
        ],
        steps: [
          { label: "Radius (ft)", formula: `(${d}/12)/2`, result: `${r.toFixed(5)} ft` },
          { label: "Volume (ft³)", formula: `π × r² × ${l}`, result: `${cubicFt.toFixed(5)} ft³` },
          { label: "US gallons", formula: `× 7.48052`, result: `${gallons.toFixed(3)} gal` },
        ],
        summary: `A ${d}" ID pipe, ${l} ft long holds ${gallons.toFixed(2)} US gal (${litres.toFixed(1)} L).`,
      };
    },
  },
  {
    id: "slope-fall", category: "Plumbing", name: "Drain Slope / Fall", description: "Required drop for proper drainage",
    icon: "trending-down", color: "#3B82F6",
    fields: [
      { id: "length", label: "Pipe run length", unit: "ft", type: "number", placeholder: "20" },
      { id: "slope",  label: "Slope", type: "select", options: ['1/8" per ft (min)', '1/4" per ft (standard)', '1/2" per ft', '1" per ft'] },
    ],
    calculate({ length, slope }) {
      const l = parseFloat(length);
      if (!l) return null;
      const slopeMap: Record<string, number> = {
        '1/8" per ft (min)': 0.125,
        '1/4" per ft (standard)': 0.25,
        '1/2" per ft': 0.5,
        '1" per ft': 1.0,
      };
      const s = slopeMap[slope ?? '1/4" per ft (standard)'] ?? 0.25;
      const dropIn = l * s;
      const pct = (s / 12) * 100;
      return {
        results: [
          { label: "Total fall", value: `${dropIn.toFixed(2)}" (${(dropIn/12).toFixed(3)} ft)`, highlight: true },
          { label: "Grade %", value: `${pct.toFixed(2)}%` },
        ],
        steps: [
          { label: "Slope rate", formula: `${s}" per ft`, result: `${pct.toFixed(3)}%` },
          { label: "Total drop", formula: `${l} ft × ${s}" per ft`, result: `${dropIn.toFixed(3)}"` },
        ],
        summary: `A ${l} ft drain at ${slope} requires ${dropIn.toFixed(2)}" of fall.`,
      };
    },
  },

  // ROOFING
  {
    id: "shingle-estimator", category: "Roofing", name: "Shingle Estimator", description: "Squares and bundles for any roof",
    icon: "home", color: "#EF4444",
    fields: [
      { id: "length", label: "Roof length",   unit: "ft", type: "number", placeholder: "40" },
      { id: "width",  label: "Slope width",   unit: "ft", type: "number", placeholder: "16" },
      { id: "slopes", label: "# of slopes",  type: "select", options: ["1","2","4"] },
      { id: "waste",  label: "Waste factor", type: "select", options: ["10%","15%","20%"] },
    ],
    calculate({ length, width, slopes, waste }) {
      const l = parseFloat(length), w = parseFloat(width), sl = parseFloat(slopes) || 2;
      const wastePct = parseFloat((waste ?? "15%").replace("%","")) / 100;
      if (!l || !w) return null;
      const area = l * w * sl;
      const withWaste = area * (1 + wastePct);
      const squares = withWaste / 100;
      const bundles = Math.ceil(squares * 3);
      return {
        results: [
          { label: "Roof area", value: `${area.toFixed(0)} ft²` },
          { label: "With waste", value: `${withWaste.toFixed(0)} ft²` },
          { label: "Squares", value: `${squares.toFixed(2)} sq`, highlight: true },
          { label: "Bundles (3/sq)", value: `${bundles} bundles`, highlight: true },
        ],
        steps: [
          { label: "Area", formula: `${l}×${w}×${sl} slopes`, result: `${area.toFixed(0)} ft²` },
          { label: "With waste", formula: `× (1 + ${wastePct})`, result: `${withWaste.toFixed(0)} ft²` },
          { label: "Squares", formula: `÷ 100`, result: `${squares.toFixed(2)}` },
        ],
        summary: `${sl}-slope roof (${l}×${w} ft) with ${waste ?? "15%"} waste = ${squares.toFixed(2)} sq, ${bundles} bundles.`,
      };
    },
  },
  {
    id: "roof-pitch-area", category: "Roofing", name: "Roof Pitch & Area", description: "True area and angle from pitch",
    icon: "trending-up", color: "#EF4444",
    fields: [
      { id: "footprint", label: "Horizontal footprint", unit: "ft²", type: "number", placeholder: "1200" },
      { id: "pitch",     label: "Roof pitch", type: "select", options: ["3:12","4:12","5:12","6:12","7:12","8:12","9:12","10:12","12:12"] },
    ],
    calculate({ footprint, pitch }) {
      const fp = parseFloat(footprint);
      if (!fp) return null;
      const [rise] = (pitch ?? "6:12").split(":").map(Number);
      const multiplier = Math.sqrt(1 + (rise / 12) ** 2);
      const trueArea = fp * multiplier;
      const angle = Math.atan(rise / 12) * (180 / Math.PI);
      return {
        results: [
          { label: "Pitch multiplier", value: multiplier.toFixed(4) },
          { label: "True roof area", value: `${trueArea.toFixed(1)} ft²`, highlight: true },
          { label: "Pitch angle", value: `${angle.toFixed(1)}°` },
        ],
        steps: [
          { label: "Multiplier", formula: `√(1+(${rise}/12)²)`, result: multiplier.toFixed(5) },
          { label: "True area", formula: `${fp} × ${multiplier.toFixed(4)}`, result: `${trueArea.toFixed(1)} ft²` },
        ],
        summary: `${fp} ft² footprint with ${pitch ?? "6:12"} pitch = ${trueArea.toFixed(1)} ft² true area at ${angle.toFixed(1)}°.`,
      };
    },
  },

  // HVAC
  {
    id: "btu-room", category: "HVAC", name: "BTU Room Load", description: "Heating/cooling BTU for a room",
    icon: "wind", color: "#06B6D4",
    fields: [
      { id: "length",  label: "Room length",  unit: "ft", type: "number", placeholder: "20" },
      { id: "width",   label: "Room width",   unit: "ft", type: "number", placeholder: "15" },
      { id: "height",  label: "Ceiling height", unit: "ft", type: "number", placeholder: "9" },
      { id: "climate", label: "Climate zone", type: "select", options: ["Cold (Canada)","Mixed","Hot & humid"] },
      { id: "windows", label: "Window area",  unit: "ft²", type: "number", placeholder: "40" },
    ],
    calculate({ length, width, height, climate, windows }) {
      const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height);
      const win = parseFloat(windows) || 0;
      if (!l || !w || !h) return null;
      const area = l * w;
      const btusPerSqFt: Record<string, number> = { "Cold (Canada)": 30, Mixed: 25, "Hot & humid": 20 };
      const base = area * (btusPerSqFt[climate ?? "Cold (Canada)"] ?? 30);
      const windowBtu = win * 1000;
      const total = Math.round((base + windowBtu) / 500) * 500;
      const tons = total / 12000;
      return {
        results: [
          { label: "Estimated BTU", value: `${total.toLocaleString()} BTU/h`, highlight: true },
          { label: "Tonnage", value: `${tons.toFixed(2)} tons`, highlight: true },
          { label: "Room volume", value: `${(area * h).toFixed(0)} ft³` },
        ],
        steps: [
          { label: "Base load", formula: `${area} ft² × ${btusPerSqFt[climate ?? "Cold (Canada)"] ?? 30}`, result: `${base.toLocaleString()} BTU/h` },
          { label: "Window load", formula: `${win} ft² × 1,000`, result: `${windowBtu.toLocaleString()} BTU/h` },
          { label: "Total (±500)", formula: `${base + windowBtu} → round`, result: `${total.toLocaleString()} BTU/h` },
        ],
        summary: `${l}×${w} ft room (${climate ?? "Cold (Canada)"}) needs ${total.toLocaleString()} BTU/h (${tons.toFixed(2)} tons).`,
      };
    },
  },

  // GENERAL
  {
    id: "paint", category: "General", name: "Paint Coverage", description: "Litres needed for any room",
    icon: "droplet", color: "#8B5CF6",
    fields: [
      { id: "length", label: "Room Length", unit: "ft", type: "number", placeholder: "14" },
      { id: "width",  label: "Room Width",  unit: "ft", type: "number", placeholder: "12" },
      { id: "height", label: "Wall Height", unit: "ft", type: "number", placeholder: "9" },
      { id: "doors",  label: "Doors / Windows", unit: "count", type: "number", placeholder: "2" },
    ],
    calculate({ length, width, height, doors }) {
      const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height), d = parseFloat(doors) || 0;
      if (!l || !w || !h) return null;
      const wallArea = 2 * (l + w) * h - d * 20;
      const litres = Math.ceil((wallArea * 2) / 40);
      const gallons = Math.ceil(litres / 3.785);
      return {
        results: [
          { label: "Wall area", value: `${wallArea.toFixed(0)} ft²` },
          { label: "Litres (2 coats)", value: `${litres} L`, highlight: true },
          { label: "Gallons", value: `${gallons} gal`, highlight: true },
        ],
        steps: [
          { label: "Wall area", formula: `2(${l}+${w})×${h} - ${d}×20`, result: `${wallArea.toFixed(0)} ft²` },
          { label: "Litres (40 ft²/L)", formula: `${wallArea.toFixed(0)}×2 ÷ 40`, result: `${litres} L` },
        ],
        summary: `Room ${l}×${w}×${h} ft with ${d} openings needs ${litres}L (${gallons} gal) for 2 coats.`,
      };
    },
  },
  {
    id: "drywall", category: "General", name: "Drywall Sheets", description: "4×8 sheets for walls & ceilings",
    icon: "layers", color: "#8B5CF6",
    fields: [
      { id: "area", label: "Total area", unit: "ft²", type: "number", placeholder: "500" },
    ],
    calculate({ area }) {
      const a = parseFloat(area);
      if (!a) return null;
      const sheets = Math.ceil((a / 32) * 1.1);
      return {
        results: [
          { label: "4×8 sheets (+ 10% waste)", value: `${sheets} sheets`, highlight: true },
          { label: "Area per sheet", value: "32 ft²" },
        ],
        steps: [
          { label: "Raw sheets", formula: `${a} ÷ 32`, result: `${(a/32).toFixed(2)}` },
          { label: "+ 10% waste", formula: `× 1.10 → ⌈⌉`, result: `${sheets} sheets` },
        ],
        summary: `${a} ft² of drywall requires ${sheets} × 4×8 sheets (10% waste included).`,
      };
    },
  },
  {
    id: "flooring", category: "General", name: "Flooring / Tile", description: "Material needed for any floor",
    icon: "square", color: "#10B981",
    fields: [
      { id: "length",   label: "Room Length", unit: "ft", type: "number", placeholder: "15" },
      { id: "width",    label: "Room Width",  unit: "ft", type: "number", placeholder: "12" },
      { id: "tileSize", label: "Tile / Plank size", unit: "in²", type: "number", placeholder: "144" },
    ],
    calculate({ length, width, tileSize }) {
      const l = parseFloat(length), w = parseFloat(width), ts = parseFloat(tileSize) || 144;
      if (!l || !w) return null;
      const roomSqft = l * w;
      const sqftWithWaste = roomSqft * 1.1;
      const tiles = Math.ceil((sqftWithWaste * 144) / ts);
      return {
        results: [
          { label: "Floor area", value: `${roomSqft.toFixed(1)} ft²` },
          { label: "With 10% waste", value: `${sqftWithWaste.toFixed(1)} ft²` },
          { label: "Tiles / planks", value: `${tiles}`, highlight: true },
        ],
        steps: [
          { label: "Area", formula: `${l} × ${w}`, result: `${roomSqft.toFixed(1)} ft²` },
          { label: "+ 10% waste", formula: `× 1.10`, result: `${sqftWithWaste.toFixed(1)} ft²` },
          { label: "Tiles", formula: `÷ (${ts}/144)`, result: `${tiles}` },
        ],
        summary: `${l}×${w} ft floor needs ${tiles} tiles/planks (${sqftWithWaste.toFixed(1)} ft² with 10% waste).`,
      };
    },
  },
  {
    id: "markup", category: "General", name: "Job Markup", description: "Material + labour pricing",
    icon: "percent", color: "#D4AF37",
    fields: [
      { id: "materials", label: "Materials cost", unit: "$", type: "number", placeholder: "2500" },
      { id: "labour",    label: "Labour cost",    unit: "$", type: "number", placeholder: "1800" },
      { id: "markup",    label: "Markup %",       unit: "%", type: "number", placeholder: "20" },
    ],
    calculate({ materials, labour, markup }) {
      const mat = parseFloat(materials) || 0;
      const lab = parseFloat(labour) || 0;
      const mkp = parseFloat(markup) || 0;
      const subtotal = mat + lab;
      const markupAmt = subtotal * (mkp / 100);
      const total = subtotal + markupAmt;
      const hst = total * 0.13;
      return {
        results: [
          { label: "Subtotal", value: `$${subtotal.toFixed(2)}` },
          { label: `Markup (${mkp}%)`, value: `$${markupAmt.toFixed(2)}` },
          { label: "Job price (pre-tax)", value: `$${total.toFixed(2)}`, highlight: true },
          { label: "HST (13%)", value: `$${hst.toFixed(2)}` },
          { label: "Total with HST", value: `$${(total + hst).toFixed(2)}`, highlight: true },
        ],
        steps: [
          { label: "Subtotal", formula: `$${mat} + $${lab}`, result: `$${subtotal.toFixed(2)}` },
          { label: `Markup (${mkp}%)`, formula: `× ${mkp / 100}`, result: `$${markupAmt.toFixed(2)}` },
          { label: "HST 13%", formula: `$${total.toFixed(2)} × 0.13`, result: `$${hst.toFixed(2)}` },
        ],
        summary: `Materials $${mat} + Labour $${lab} with ${mkp}% markup = $${total.toFixed(2)} pre-tax ($${(total + hst).toFixed(2)} with HST).`,
      };
    },
  },
];

const CATEGORIES = ["All", "Concrete", "Framing", "Electrical", "Plumbing", "Roofing", "HVAC", "General"] as const;

const CAT_COLORS: Record<string, string> = {
  Concrete: "#78716C", Framing: "#D97706", Electrical: "#F59E0B",
  Plumbing: "#3B82F6", Roofing: "#EF4444", HVAC: "#06B6D4", General: "#8B5CF6",
};

// ── Select Field component ─────────────────────────────────────────────────────
function SelectField({ field, value, onChange, colors }: {
  field: CalcField; value: string; onChange: (v: string) => void; colors: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
      <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
        {field.options?.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                styles.optionPill,
                { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}15` : colors.card }
              ]}
            >
              <Text style={[styles.optionPillText, { color: selected ? colors.primary : colors.mutedForeground, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function CalculatorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<string>("All");
  const [active, setActive] = useState<CalcDef | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{ results: CalcResult[]; steps: CalcStep[]; summary: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = CALCS.filter((c) => category === "All" || c.category === category);

  function openCalc(calc: CalcDef) {
    const defaults: Record<string, string> = {};
    calc.fields.forEach((f) => {
      if (f.type === "select" && f.options) defaults[f.id] = f.options[0];
    });
    setActive(calc);
    setVals(defaults);
    setResults(null);
    setAiSummary(null);
  }

  function closeCalc() {
    setActive(null);
    setVals({});
    setResults(null);
    setAiSummary(null);
  }

  function calculate() {
    if (!active) return;
    const res = active.calculate(vals);
    setResults(res);
    setAiSummary(null);
  }

  async function getAiNote() {
    if (!results || !active) return;
    setAiLoading(true);
    try {
      const data = await customFetch<any>("/api/calculators/ai-summary", {
        method: "POST",
        body: JSON.stringify({ calculator: active.name, inputs: vals, summary: results.summary, results: results.results }),
      });
      setAiSummary(data?.summary ?? null);
    } catch {
      setAiSummary(null);
    } finally {
      setAiLoading(false);
    }
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.sidebar }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Calculators</Text>
        <View style={{ width: 38 }} />
      </View>

      {active ? (
        // ── Active calculator ──────────────────────────────────────────────────
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.calcScroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {/* Back */}
            <TouchableOpacity onPress={closeCalc} style={styles.calcBack}>
              <Feather name="chevron-left" size={16} color={colors.primary} />
              <Text style={[styles.calcBackText, { color: colors.primary }]}>All Calculators</Text>
            </TouchableOpacity>

            {/* Title */}
            <View style={[styles.calcHeader, { backgroundColor: active.color + "15" }]}>
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
                  {f.type === "select" ? (
                    <SelectField
                      field={f}
                      value={vals[f.id] ?? f.options?.[0] ?? ""}
                      onChange={(v) => { setVals((p) => ({ ...p, [f.id]: v })); setResults(null); }}
                      colors={colors}
                    />
                  ) : (
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="decimal-pad"
                      placeholder={f.placeholder ?? "0"}
                      placeholderTextColor={colors.mutedForeground}
                      value={vals[f.id] ?? ""}
                      onChangeText={(t) => { setVals((p) => ({ ...p, [f.id]: t })); setResults(null); }}
                      returnKeyType="done"
                    />
                  )}
                </View>
              ))}
            </View>

            {/* Calculate button */}
            <Pressable style={[styles.calcBtn, { backgroundColor: active.color }]} onPress={calculate}>
              <Feather name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.calcBtnText}>Calculate</Text>
            </Pressable>

            {/* Results */}
            {results && (
              <View style={{ gap: 10 }}>
                <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: `${active.color}40` }]}>
                  <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Results</Text>
                  {results.results.map((r, i) => (
                    <View key={i} style={[styles.resultRow, { backgroundColor: r.highlight ? `${active.color}12` : "transparent" }]}>
                      <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                      <Text style={[styles.resultValue, { color: r.highlight ? active.color : colors.foreground }]}>{r.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Steps */}
                {results.steps.length > 0 && (
                  <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.stepsTitle, { color: colors.mutedForeground }]}>How it's calculated</Text>
                    {results.steps.map((s, i) => (
                      <View key={i} style={styles.stepRow}>
                        <View style={[styles.stepDot, { backgroundColor: active.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.stepLabel, { color: colors.foreground }]}>{s.label}</Text>
                          {s.formula ? <Text style={[styles.stepFormula, { color: colors.mutedForeground }]}>{s.formula}{s.result ? ` = ${s.result}` : ""}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* AI field note */}
                <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {aiSummary ? (
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Feather name="cpu" size={13} color={colors.primary} />
                        <Text style={[styles.stepsTitle, { color: colors.foreground }]}>AI Field Note</Text>
                      </View>
                      <Text style={[styles.aiText, { color: colors.foreground, backgroundColor: `${colors.primary}10`, borderRadius: 8, padding: 10 }]}>{aiSummary}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} onPress={getAiNote} disabled={aiLoading}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="cpu" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Get AI field note</Text>
                      </View>
                      {aiLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="chevron-right" size={14} color={colors.border} />}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        // ── Calculator grid ────────────────────────────────────────────────────
        <View style={{ flex: 1 }}>
          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 10 }}>
            {CATEGORIES.map((cat) => {
              const sel = category === cat;
              const catColor = CAT_COLORS[cat] ?? colors.primary;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[styles.catPill, { backgroundColor: sel ? catColor : colors.card, borderColor: sel ? catColor : colors.border }]}
                >
                  <Text style={[styles.catPillText, { color: sel ? "#FFFFFF" : colors.mutedForeground }]}>{cat}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={[styles.gridHint, { color: colors.mutedForeground }]}>
              {filtered.length} calculator{filtered.length !== 1 ? "s" : ""} — tap to open
            </Text>
            {filtered.map((calc) => (
              <TouchableOpacity
                key={calc.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openCalc(calc)}
                activeOpacity={0.75}
              >
                <View style={[styles.cardIcon, { backgroundColor: calc.color + "18" }]}>
                  <Feather name={calc.icon as any} size={22} color={calc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.cardName, { color: colors.foreground }]}>{calc.name}</Text>
                    <View style={[styles.catTag, { backgroundColor: `${CAT_COLORS[calc.category] ?? colors.primary}18` }]}>
                      <Text style={[styles.catTagText, { color: CAT_COLORS[calc.category] ?? colors.primary }]}>{calc.category}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {calc.description}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.border} />
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  catBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  catPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  catPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  grid: { padding: 16, gap: 8 },
  gridHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  catTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  calcScroll: { padding: 16, gap: 12 },
  calcBack: { flexDirection: "row", alignItems: "center", gap: 4 },
  calcBackText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  calcHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14 },
  calcIconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  calcTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  calcDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  fieldsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 14 },
  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontFamily: "Inter_400Regular" },
  optionPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  optionPillText: { fontSize: 12 },
  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  calcBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resultsCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 2 },
  resultsTitle: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  resultLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  resultValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  stepsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  stepsTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  stepLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  stepFormula: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  aiCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  aiText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
