import { Calculator, Zap, Droplets, Wind, Home, Layers } from "lucide-react";

export interface CalcField {
  id: string; label: string; unit?: string;
  type?: "number" | "select"; options?: string[]; placeholder?: string; step?: string;
}
export interface CalcResult { label: string; value: string; highlight?: boolean }
export interface CalcStep { label: string; formula: string; result: string }
export interface CalcDef {
  id: string; category: string; name: string; description: string;
  icon: React.ElementType; fields: CalcField[];
  calculate: (inputs: Record<string, string>) => { results: CalcResult[]; steps: CalcStep[]; summary: string } | null;
}

export const CATEGORIES = ["All", "Concrete", "Framing", "Electrical", "Plumbing", "Roofing", "HVAC", "General"] as const;

export const categoryMeta: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  Concrete:   { icon: Layers,     color: "text-stone-700",  bg: "bg-stone-100" },
  Framing:    { icon: Home,       color: "text-amber-700",  bg: "bg-amber-100" },
  Electrical: { icon: Zap,        color: "text-yellow-700", bg: "bg-yellow-100" },
  Plumbing:   { icon: Droplets,   color: "text-blue-700",   bg: "bg-blue-100" },
  Roofing:    { icon: Home,       color: "text-red-700",    bg: "bg-red-100" },
  HVAC:       { icon: Wind,       color: "text-cyan-700",   bg: "bg-cyan-100" },
  General:    { icon: Calculator, color: "text-purple-700", bg: "bg-purple-100" },
};

export const CALCULATORS: CalcDef[] = [
  // CONCRETE
  {
    id: "concrete-slab", category: "Concrete", name: "Concrete Slab", description: "Volume and bags needed for any slab",
    icon: Layers,
    fields: [
      { id: "length", label: "Length", unit: "ft", type: "number", placeholder: "20" },
      { id: "width",  label: "Width",  unit: "ft", type: "number", placeholder: "12" },
      { id: "depth",  label: "Depth",  unit: "in", type: "number", placeholder: "4" },
      { id: "mix",    label: "Bag mix", type: "select", options: ["40 lb bag", "60 lb bag", "80 lb bag"] },
    ],
    calculate({ length, width, depth, mix }) {
      const l = parseFloat(length), w = parseFloat(width), d = parseFloat(depth);
      if (!l || !w || !d) return null;
      const depthFt = d / 12;
      const cubicFt = l * w * depthFt;
      const cubicYd = cubicFt / 27;
      const yieldPerBag: Record<string, number> = { "40 lb bag": 0.011, "60 lb bag": 0.017, "80 lb bag": 0.022 };
      const bagsPerYard = 1 / (yieldPerBag[mix] ?? 0.022);
      const bags = Math.ceil(cubicYd * bagsPerYard * 1.1);
      return {
        results: [
          { label: "Volume", value: `${cubicYd.toFixed(2)} yd³`, highlight: true },
          { label: "Cubic feet", value: `${cubicFt.toFixed(1)} ft³` },
          { label: `${mix ?? "80 lb"} bags needed`, value: `${bags} bags (incl. 10% waste)`, highlight: true },
        ],
        steps: [
          { label: "Depth to feet", formula: `${d}" ÷ 12`, result: `${depthFt.toFixed(4)} ft` },
          { label: "Cubic feet", formula: `${l} × ${w} × ${depthFt.toFixed(4)}`, result: `${cubicFt.toFixed(2)} ft³` },
          { label: "Cubic yards", formula: `${cubicFt.toFixed(2)} ÷ 27`, result: `${cubicYd.toFixed(2)} yd³` },
          { label: "Bags (+ 10% waste)", formula: `${cubicYd.toFixed(2)} × ${bagsPerYard.toFixed(1)} × 1.10`, result: `${bags} bags` },
        ],
        summary: `For a ${l}×${w} ft slab at ${d}" deep, you need ${cubicYd.toFixed(2)} yd³ of concrete (${bags} × ${mix ?? "80 lb"} bags including 10% waste).`,
      };
    },
  },
  {
    id: "concrete-footing", category: "Concrete", name: "Footing Calculator", description: "Continuous footing volume and bags",
    icon: Layers,
    fields: [
      { id: "length", label: "Total run length", unit: "ft", type: "number", placeholder: "60" },
      { id: "width",  label: "Footing width",   unit: "in", type: "number", placeholder: "16" },
      { id: "depth",  label: "Footing depth",   unit: "in", type: "number", placeholder: "8" },
      { id: "mix",    label: "Bag mix", type: "select", options: ["40 lb bag", "60 lb bag", "80 lb bag"] },
    ],
    calculate({ length, width, depth, mix }) {
      const l = parseFloat(length), w = parseFloat(width), d = parseFloat(depth);
      if (!l || !w || !d) return null;
      const wFt = w / 12, dFt = d / 12;
      const cubicFt = l * wFt * dFt;
      const cubicYd = cubicFt / 27;
      const yieldPerBag: Record<string, number> = { "40 lb bag": 0.011, "60 lb bag": 0.017, "80 lb bag": 0.022 };
      const bags = Math.ceil(cubicYd * (1 / (yieldPerBag[mix] ?? 0.022)) * 1.1);
      return {
        results: [
          { label: "Volume", value: `${cubicYd.toFixed(2)} yd³`, highlight: true },
          { label: "Bags needed", value: `${bags} bags (10% waste)`, highlight: true },
        ],
        steps: [
          { label: "Width in feet", formula: `${w}" ÷ 12`, result: `${wFt.toFixed(3)} ft` },
          { label: "Depth in feet", formula: `${d}" ÷ 12`, result: `${dFt.toFixed(3)} ft` },
          { label: "Cubic feet", formula: `${l} × ${wFt.toFixed(3)} × ${dFt.toFixed(3)}`, result: `${cubicFt.toFixed(2)} ft³` },
          { label: "Cubic yards", formula: `${cubicFt.toFixed(2)} ÷ 27`, result: `${cubicYd.toFixed(2)} yd³` },
        ],
        summary: `A ${l} ft footing at ${w}"×${d}" requires ${cubicYd.toFixed(2)} yd³ concrete (${bags} bags).`,
      };
    },
  },
  {
    id: "sonotube", category: "Concrete", name: "Sonotube / Column", description: "Circular column volume and bags",
    icon: Layers,
    fields: [
      { id: "diameter", label: "Diameter", unit: "in", type: "number", placeholder: "10" },
      { id: "height",   label: "Height",   unit: "ft", type: "number", placeholder: "4" },
      { id: "count",    label: "Number of columns", type: "number", placeholder: "4" },
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
          { label: "Volume / column", formula: `π × ${r.toFixed(4)}² × ${h}`, result: `${volOne.toFixed(3)} ft³` },
          { label: `Total (${n} columns)`, formula: `${volOne.toFixed(3)} × ${n}`, result: `${volAll.toFixed(3)} ft³` },
        ],
        summary: `${n} sonotube column${n > 1 ? "s" : ""} (${d}" dia × ${h} ft) need ${cubicYdAll.toFixed(3)} yd³ total (${bags80} × 80 lb bags).`,
      };
    },
  },

  // FRAMING
  {
    id: "stud-count", category: "Framing", name: "Stud Count", description: "Number of studs for a wall",
    icon: Home,
    fields: [
      { id: "length",  label: "Wall length", unit: "ft", type: "number", placeholder: "16" },
      { id: "spacing", label: "Stud spacing", type: "select", options: ["12\" OC", "16\" OC", "24\" OC"] },
    ],
    calculate({ length, spacing }) {
      const l = parseFloat(length);
      if (!l) return null;
      const oc: Record<string, number> = { "12\" OC": 12, "16\" OC": 16, "24\" OC": 24 };
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
          { label: "Stud count", formula: `⌈${(l * 12).toFixed(0)} ÷ ${sp}⌉ + 1`, result: `${studs} studs` },
        ],
        summary: `A ${l} ft wall at ${spacing ?? "16\" OC"} needs ${studs} studs (${withWaste} with waste).`,
      };
    },
  },
  {
    id: "rafter-length", category: "Framing", name: "Rafter Length", description: "True rafter length from pitch and run",
    icon: Home,
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
          { label: "Rafter (Pythagorean)", formula: `√(${r}² + ${riseFt.toFixed(3)}²)`, result: `${rafter.toFixed(3)} ft` },
          { label: "Pitch angle", formula: `arctan(${riseFt.toFixed(3)} / ${r})`, result: `${angle.toFixed(2)}°` },
        ],
        summary: `With a ${pitch ?? "6:12"} pitch over a ${r} ft run, rafter length is ${rafter.toFixed(2)} ft at ${angle.toFixed(1)}°.`,
      };
    },
  },
  {
    id: "board-feet", category: "Framing", name: "Board Feet", description: "Lumber volume in board feet",
    icon: Home,
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
        summary: `${n} piece${n > 1 ? "s" : ""} of ${t}×${w}×${l} lumber = ${bfTotal.toFixed(2)} board feet total.`,
      };
    },
  },

  // ELECTRICAL
  {
    id: "voltage-drop", category: "Electrical", name: "Voltage Drop", description: "Wire voltage drop over distance",
    icon: Zap,
    fields: [
      { id: "voltage",  label: "Voltage",    unit: "V", type: "select", options: ["120V", "208V", "240V", "347V", "600V"] },
      { id: "amperage", label: "Load",       unit: "A", type: "number", placeholder: "20" },
      { id: "wire",     label: "Wire gauge", type: "select", options: ["#14 AWG","#12 AWG","#10 AWG","#8 AWG","#6 AWG","#4 AWG","#2 AWG","#1/0 AWG","#2/0 AWG","#3/0 AWG"] },
      { id: "length",   label: "One-way run", unit: "ft", type: "number", placeholder: "150" },
      { id: "material", label: "Conductor", type: "select", options: ["Copper", "Aluminum"] },
    ],
    calculate({ voltage, amperage, wire, length, material }) {
      const v = parseFloat(voltage), a = parseFloat(amperage), l = parseFloat(length);
      if (!v || !a || !l) return null;
      const resistMap: Record<string, Record<string, number>> = {
        Copper:   { "#14 AWG": 3.14, "#12 AWG": 1.98, "#10 AWG": 1.24, "#8 AWG": 0.778, "#6 AWG": 0.491, "#4 AWG": 0.308, "#2 AWG": 0.194, "#1/0 AWG": 0.122, "#2/0 AWG": 0.0967, "#3/0 AWG": 0.0766 },
        Aluminum: { "#14 AWG": 5.17, "#12 AWG": 3.25, "#10 AWG": 2.04, "#8 AWG": 1.28,  "#6 AWG": 0.808, "#4 AWG": 0.508, "#2 AWG": 0.319, "#1/0 AWG": 0.201, "#2/0 AWG": 0.159,  "#3/0 AWG": 0.126 },
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
          { label: "Resistance per 1000 ft", formula: `${mat} ${wire ?? "#12 AWG"}`, result: `${resistPer1000} Ω/1000 ft` },
          { label: "Round-trip resistance", formula: `(${resistPer1000} / 1000) × ${l * 2}`, result: `${resist.toFixed(4)} Ω` },
          { label: "Voltage drop (V=IR)", formula: `${resist.toFixed(4)} × ${a}`, result: `${drop.toFixed(2)} V` },
          { label: "% drop", formula: `(${drop.toFixed(2)} / ${v}) × 100`, result: `${dropPct.toFixed(2)}%` },
        ],
        summary: `${mat} ${wire ?? "#12 AWG"} over ${l} ft at ${a}A on ${v}V drops ${drop.toFixed(2)} V (${dropPct.toFixed(2)}%). ${ok ? "Meets CEC 3% limit." : "Exceeds CEC 3% — consider upsizing."}`,
      };
    },
  },
  {
    id: "breaker-load", category: "Electrical", name: "Breaker Load", description: "Circuit load and breaker sizing",
    icon: Zap,
    fields: [
      { id: "voltage", label: "Voltage", unit: "V", type: "select", options: ["120V", "240V", "208V"] },
      { id: "watts",   label: "Total watts", unit: "W", type: "number", placeholder: "3600" },
      { id: "pf",      label: "Power factor", type: "select", options: ["1.0 (resistive)", "0.95", "0.90", "0.85", "0.80"] },
    ],
    calculate({ voltage, watts, pf }) {
      const v = parseFloat(voltage), w = parseFloat(watts);
      const pfVal = parseFloat((pf ?? "1.0 (resistive)").split(" ")[0]);
      if (!v || !w) return null;
      const amps = w / (v * pfVal);
      const breakerSizes = [15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 125, 150, 200];
      const breaker = breakerSizes.find((b) => b >= amps * 1.25) ?? 200;
      return {
        results: [
          { label: "Load current", value: `${amps.toFixed(2)} A`, highlight: true },
          { label: "Min. breaker (125% NEC)", value: `${Math.ceil(amps * 1.25)} A` },
          { label: "Recommended breaker", value: `${breaker} A`, highlight: true },
        ],
        steps: [
          { label: "Current I = P / (V × PF)", formula: `${w} / (${v} × ${pfVal})`, result: `${amps.toFixed(3)} A` },
          { label: "125% rule (NEC 210.20)", formula: `${amps.toFixed(3)} × 1.25`, result: `${(amps * 1.25).toFixed(2)} A` },
          { label: "Next standard size", formula: `≥ ${(amps * 1.25).toFixed(2)} A`, result: `${breaker} A breaker` },
        ],
        summary: `${w}W at ${v}V (PF ${pfVal}) draws ${amps.toFixed(2)}A — requires a ${breaker}A breaker per NEC 125% rule.`,
      };
    },
  },

  // PLUMBING
  {
    id: "pipe-volume", category: "Plumbing", name: "Pipe Volume", description: "Volume of liquid in any pipe",
    icon: Droplets,
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
          { label: "Radius (ft)", formula: `(${d} / 12) / 2`, result: `${r.toFixed(5)} ft` },
          { label: "Volume (ft³)", formula: `π × ${r.toFixed(5)}² × ${l}`, result: `${cubicFt.toFixed(5)} ft³` },
          { label: "US gallons", formula: `${cubicFt.toFixed(5)} × 7.48052`, result: `${gallons.toFixed(3)} gal` },
        ],
        summary: `A ${d}" ID pipe, ${l} ft long holds ${gallons.toFixed(2)} US gallons (${litres.toFixed(1)} L).`,
      };
    },
  },
  {
    id: "slope-fall", category: "Plumbing", name: "Drain Slope / Fall", description: "Required drop for proper drainage",
    icon: Droplets,
    fields: [
      { id: "length", label: "Pipe run length", unit: "ft", type: "number", placeholder: "20" },
      { id: "slope",  label: "Slope", type: "select", options: ["1/8\" per ft (min)", "1/4\" per ft (standard)", "1/2\" per ft", "1\" per ft"] },
    ],
    calculate({ length, slope }) {
      const l = parseFloat(length);
      if (!l) return null;
      const slopeMap: Record<string, number> = {
        "1/8\" per ft (min)": 0.125,
        "1/4\" per ft (standard)": 0.25,
        "1/2\" per ft": 0.5,
        "1\" per ft": 1.0,
      };
      const s = slopeMap[slope ?? "1/4\" per ft (standard)"] ?? 0.25;
      const dropIn = l * s;
      const dropFt = dropIn / 12;
      const pct = (s / 12) * 100;
      return {
        results: [
          { label: "Total fall", value: `${dropIn.toFixed(2)}" (${dropFt.toFixed(3)} ft)`, highlight: true },
          { label: "Grade %", value: `${pct.toFixed(2)}%` },
        ],
        steps: [
          { label: "Slope rate", formula: `${s}" per ft`, result: `${pct.toFixed(3)}%` },
          { label: "Total drop", formula: `${l} ft × ${s}" per ft`, result: `${dropIn.toFixed(3)}"` },
        ],
        summary: `A ${l} ft drain at ${slope ?? "1/4\" per ft"} requires ${dropIn.toFixed(2)}" of fall.`,
      };
    },
  },

  // ROOFING
  {
    id: "shingle-estimator", category: "Roofing", name: "Shingle Estimator", description: "Squares and bundles for any roof",
    icon: Home,
    fields: [
      { id: "length", label: "Roof length",  unit: "ft", type: "number", placeholder: "40" },
      { id: "width",  label: "Slope width",  unit: "ft", type: "number", placeholder: "16" },
      { id: "slopes", label: "# of slopes",  type: "select", options: ["1", "2", "4"] },
      { id: "waste",  label: "Waste factor", type: "select", options: ["10%", "15%", "20%"] },
    ],
    calculate({ length, width, slopes, waste }) {
      const l = parseFloat(length), w = parseFloat(width), sl = parseFloat(slopes) ?? 2;
      const wastePct = parseFloat((waste ?? "15%").replace("%", "")) / 100;
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
          { label: "Area", formula: `${l} × ${w} × ${sl} slopes`, result: `${area.toFixed(0)} ft²` },
          { label: "With waste", formula: `${area.toFixed(0)} × (1 + ${wastePct})`, result: `${withWaste.toFixed(0)} ft²` },
          { label: "Squares", formula: `${withWaste.toFixed(0)} ÷ 100`, result: `${squares.toFixed(2)}` },
          { label: "Bundles", formula: `⌈${squares.toFixed(2)} × 3⌉`, result: `${bundles}` },
        ],
        summary: `${sl}-slope roof (${l}×${w} ft) with ${waste ?? "15%"} waste = ${squares.toFixed(2)} squares, ${bundles} shingle bundles.`,
      };
    },
  },
  {
    id: "roof-pitch-area", category: "Roofing", name: "Roof Pitch & Area", description: "True area and angle from pitch",
    icon: Home,
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
          { label: "Multiplier", formula: `√(1 + (${rise}/12)²)`, result: multiplier.toFixed(5) },
          { label: "True area", formula: `${fp} × ${multiplier.toFixed(4)}`, result: `${trueArea.toFixed(1)} ft²` },
          { label: "Angle", formula: `arctan(${rise}/12)`, result: `${angle.toFixed(2)}°` },
        ],
        summary: `A ${fp} ft² footprint with ${pitch ?? "6:12"} pitch has a true area of ${trueArea.toFixed(1)} ft² at ${angle.toFixed(1)}°.`,
      };
    },
  },

  // HVAC
  {
    id: "btu-room", category: "HVAC", name: "BTU Room Load", description: "Heating/cooling BTU for a room",
    icon: Wind,
    fields: [
      { id: "length",  label: "Room length",  unit: "ft", type: "number", placeholder: "20" },
      { id: "width",   label: "Room width",   unit: "ft", type: "number", placeholder: "15" },
      { id: "height",  label: "Ceiling height", unit: "ft", type: "number", placeholder: "9" },
      { id: "climate", label: "Climate zone", type: "select", options: ["Cold (Canada)", "Mixed", "Hot & humid"] },
      { id: "windows", label: "Window area",  unit: "ft²", type: "number", placeholder: "40" },
    ],
    calculate({ length, width, height, climate, windows }) {
      const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height);
      const win = parseFloat(windows) || 0;
      if (!l || !w || !h) return null;
      const area = l * w;
      const volume = area * h;
      const btusPerSqFt: Record<string, number> = { "Cold (Canada)": 30, Mixed: 25, "Hot & humid": 20 };
      const base = area * (btusPerSqFt[climate ?? "Cold (Canada)"] ?? 30);
      const windowBtu = win * 1000;
      const total = Math.round((base + windowBtu) / 500) * 500;
      const tons = total / 12000;
      return {
        results: [
          { label: "Estimated BTU", value: `${total.toLocaleString()} BTU/h`, highlight: true },
          { label: "Tonnage", value: `${tons.toFixed(2)} tons`, highlight: true },
          { label: "Room volume", value: `${volume.toFixed(0)} ft³` },
        ],
        steps: [
          { label: "Area", formula: `${l} × ${w}`, result: `${area} ft²` },
          { label: "Base load", formula: `${area} × ${btusPerSqFt[climate ?? "Cold (Canada)"] ?? 30} BTU/ft²`, result: `${base.toLocaleString()} BTU/h` },
          { label: "Window load", formula: `${win} ft² × 1,000`, result: `${windowBtu.toLocaleString()} BTU/h` },
          { label: "Total (rounded to 500)", formula: `${base + windowBtu} → round`, result: `${total.toLocaleString()} BTU/h` },
        ],
        summary: `A ${l}×${w} ft room (${h} ft ceiling, ${win} ft² windows) needs ~${total.toLocaleString()} BTU/h (${tons.toFixed(2)} tons) in a ${climate ?? "Cold"} climate.`,
      };
    },
  },
  {
    id: "cfm-airflow", category: "HVAC", name: "CFM Airflow", description: "Required airflow for a space",
    icon: Wind,
    fields: [
      { id: "volume", label: "Room volume",   unit: "ft³", type: "number", placeholder: "2700" },
      { id: "ach",    label: "Air changes/hr", type: "select", options: ["4 ACH (bedroom)", "6 ACH (office)", "8 ACH (kitchen)", "12 ACH (lab/med)", "20 ACH (cleanroom)"] },
    ],
    calculate({ volume, ach }) {
      const vol = parseFloat(volume);
      if (!vol) return null;
      const achVal = parseFloat((ach ?? "6 ACH (office)").split(" ")[0]);
      const cfm = (vol * achVal) / 60;
      return {
        results: [
          { label: "Required CFM", value: `${cfm.toFixed(1)} CFM`, highlight: true },
          { label: "Air changes/hr", value: `${achVal} ACH` },
        ],
        steps: [
          { label: "Formula", formula: "(Volume × ACH) / 60", result: "" },
          { label: "CFM", formula: `(${vol} × ${achVal}) / 60`, result: `${cfm.toFixed(2)} CFM` },
        ],
        summary: `${vol} ft³ space at ${achVal} ACH needs ${cfm.toFixed(1)} CFM of airflow.`,
      };
    },
  },

  // GENERAL
  {
    id: "unit-converter", category: "General", name: "Unit Converter", description: "Imperial ↔ metric for construction",
    icon: Calculator,
    fields: [
      { id: "value", label: "Value",     type: "number", placeholder: "10" },
      { id: "from",  label: "From unit", type: "select", options: ["feet","inches","yards","miles","metres","cm","mm","km","sq ft","sq m","yd³","m³","lb","kg","°F","°C"] },
      { id: "to",    label: "To unit",   type: "select", options: ["metres","cm","mm","km","feet","inches","yards","miles","sq m","sq ft","m³","yd³","kg","lb","°C","°F"] },
    ],
    calculate({ value, from, to }) {
      const v = parseFloat(value);
      if (!v || !from || !to) return null;
      type Conv = [string, string, (x: number) => number];
      const conversions: Conv[] = [
        ["feet",  "metres",  (x) => x * 0.3048],  ["metres","feet",    (x) => x / 0.3048],
        ["inches","cm",      (x) => x * 2.54],     ["cm",    "inches",  (x) => x / 2.54],
        ["yards", "metres",  (x) => x * 0.9144],   ["metres","yards",   (x) => x / 0.9144],
        ["miles", "km",      (x) => x * 1.60934],  ["km",    "miles",   (x) => x / 1.60934],
        ["inches","metres",  (x) => x * 0.0254],   ["metres","inches",  (x) => x / 0.0254],
        ["feet",  "cm",      (x) => x * 30.48],    ["cm",    "feet",    (x) => x / 30.48],
        ["feet",  "mm",      (x) => x * 304.8],    ["mm",    "feet",    (x) => x / 304.8],
        ["sq ft", "sq m",    (x) => x * 0.092903], ["sq m",  "sq ft",   (x) => x / 0.092903],
        ["yd³",   "m³",      (x) => x * 0.764555], ["m³",    "yd³",     (x) => x / 0.764555],
        ["lb",    "kg",      (x) => x * 0.453592], ["kg",    "lb",      (x) => x / 0.453592],
        ["°F",    "°C",      (x) => (x - 32) * 5 / 9], ["°C", "°F",    (x) => x * 9 / 5 + 32],
      ];
      const conv = conversions.find(([f, t]) => f === from && t === to);
      if (!conv) return { results: [{ label: "Note", value: "Conversion not available for this pair" }], steps: [], summary: "" };
      const result = conv[2](v);
      return {
        results: [{ label: `${v} ${from} =`, value: `${result.toFixed(4)} ${to}`, highlight: true }],
        steps: [{ label: "Conversion applied", formula: `${v} ${from}`, result: `${result.toFixed(6)} ${to}` }],
        summary: `${v} ${from} = ${result.toFixed(4)} ${to}.`,
      };
    },
  },
  {
    id: "area-calculator", category: "General", name: "Area Calculator", description: "Area in sq ft and sq m",
    icon: Calculator,
    fields: [
      { id: "shape", label: "Shape", type: "select", options: ["Rectangle", "Circle", "Triangle"] },
      { id: "dim1",  label: "Dim 1 (L or Radius or Base)", unit: "ft", type: "number", placeholder: "20" },
      { id: "dim2",  label: "Dim 2 (W or — or Height)",   unit: "ft", type: "number", placeholder: "10" },
    ],
    calculate({ shape, dim1, dim2 }) {
      const d1 = parseFloat(dim1), d2 = parseFloat(dim2);
      if (!d1) return null;
      let area = 0, formula = "";
      const s = shape ?? "Rectangle";
      if (s === "Rectangle") { area = d1 * d2; formula = `${d1} × ${d2}`; }
      else if (s === "Circle") { area = Math.PI * d1 * d1; formula = `π × ${d1}²`; }
      else if (s === "Triangle") { area = 0.5 * d1 * d2; formula = `0.5 × ${d1} × ${d2}`; }
      const sqM = area * 0.092903;
      return {
        results: [
          { label: "Area (sq ft)", value: `${area.toFixed(2)} ft²`, highlight: true },
          { label: "Area (sq m)", value: `${sqM.toFixed(3)} m²` },
        ],
        steps: [{ label: `${s} area`, formula, result: `${area.toFixed(4)} ft²` }],
        summary: `${s} with dim ${d1}${d2 ? ` × ${d2}` : ""} ft = ${area.toFixed(2)} ft² (${sqM.toFixed(3)} m²).`,
      };
    },
  },
];
