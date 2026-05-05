/**
 * Canadian Payroll Tax Estimator — 2024 rates
 * Calculates weekly deductions from a weekly gross amount by annualizing.
 * Includes: Federal income tax, Provincial income tax, CPP, and EI.
 * Disclaimer: This is an estimate. Actual deductions depend on the worker's
 * personal tax credits, year-to-date earnings, and other factors.
 */

type Bracket = { limit: number; rate: number }[];

// ── Federal ──────────────────────────────────────────────────────────────────
const FEDERAL_BASIC_PERSONAL = 15_705;
const FEDERAL_BRACKETS: Bracket = [
  { limit: 57_375,  rate: 0.15   },
  { limit: 114_750, rate: 0.205  },
  { limit: 158_519, rate: 0.26   },
  { limit: 220_000, rate: 0.29   },
  { limit: Infinity, rate: 0.33  },
];

// ── CPP 2024 ──────────────────────────────────────────────────────────────────
const CPP_RATE              = 0.0595;
const CPP_BASIC_EXEMPTION   = 3_500;
const CPP_MAX_PENSIONABLE   = 68_500;
const CPP_MAX_ANNUAL        = 3_867.50;

// ── EI 2024 ──────────────────────────────────────────────────────────────────
const EI_RATE        = 0.0166;
const EI_MAX_INSURABLE = 63_200;
const EI_MAX_ANNUAL    = 1_049.12;

// ── Provincial configs ────────────────────────────────────────────────────────
type ProvincialConfig = {
  name: string;
  basic: number;
  brackets: Bracket;
};

const PROVINCES: Record<string, ProvincialConfig> = {
  AB: {
    name: "Alberta",
    basic: 21_003,
    brackets: [
      { limit: 148_269, rate: 0.10  },
      { limit: 177_922, rate: 0.12  },
      { limit: 237_230, rate: 0.13  },
      { limit: 355_845, rate: 0.14  },
      { limit: Infinity, rate: 0.15 },
    ],
  },
  BC: {
    name: "British Columbia",
    basic: 11_981,
    brackets: [
      { limit: 45_654,  rate: 0.0506 },
      { limit: 91_310,  rate: 0.077  },
      { limit: 104_835, rate: 0.105  },
      { limit: 127_299, rate: 0.1229 },
      { limit: 172_602, rate: 0.147  },
      { limit: 240_716, rate: 0.168  },
      { limit: Infinity, rate: 0.205 },
    ],
  },
  MB: {
    name: "Manitoba",
    basic: 15_780,
    brackets: [
      { limit: 36_842,  rate: 0.108  },
      { limit: 79_625,  rate: 0.1275 },
      { limit: Infinity, rate: 0.174 },
    ],
  },
  NB: {
    name: "New Brunswick",
    basic: 12_458,
    brackets: [
      { limit: 47_715,  rate: 0.094  },
      { limit: 95_431,  rate: 0.1382 },
      { limit: 176_756, rate: 0.1784 },
      { limit: Infinity, rate: 0.195 },
    ],
  },
  NL: {
    name: "Newfoundland and Labrador",
    basic: 10_818,
    brackets: [
      { limit: 43_198,  rate: 0.087  },
      { limit: 86_395,  rate: 0.145  },
      { limit: 154_244, rate: 0.158  },
      { limit: 215_943, rate: 0.178  },
      { limit: 275_870, rate: 0.198  },
      { limit: 551_739, rate: 0.208  },
      { limit: Infinity, rate: 0.213 },
    ],
  },
  NS: {
    name: "Nova Scotia",
    basic: 8_481,
    brackets: [
      { limit: 29_590,  rate: 0.0879 },
      { limit: 59_180,  rate: 0.1495 },
      { limit: 93_000,  rate: 0.1667 },
      { limit: 150_000, rate: 0.175  },
      { limit: Infinity, rate: 0.21  },
    ],
  },
  NT: {
    name: "Northwest Territories",
    basic: 16_593,
    brackets: [
      { limit: 50_597,  rate: 0.059  },
      { limit: 101_198, rate: 0.086  },
      { limit: 164_525, rate: 0.122  },
      { limit: Infinity, rate: 0.1405 },
    ],
  },
  NU: {
    name: "Nunavut",
    basic: 17_925,
    brackets: [
      { limit: 53_268,  rate: 0.04   },
      { limit: 106_537, rate: 0.07   },
      { limit: 173_205, rate: 0.09   },
      { limit: Infinity, rate: 0.115 },
    ],
  },
  ON: {
    name: "Ontario",
    basic: 11_865,
    brackets: [
      { limit: 51_446,  rate: 0.0505 },
      { limit: 102_894, rate: 0.0915 },
      { limit: 150_000, rate: 0.1116 },
      { limit: 220_000, rate: 0.1216 },
      { limit: Infinity, rate: 0.1316 },
    ],
  },
  PE: {
    name: "Prince Edward Island",
    basic: 12_000,
    brackets: [
      { limit: 32_656,  rate: 0.0965 },
      { limit: 64_313,  rate: 0.1363 },
      { limit: 105_000, rate: 0.1665 },
      { limit: 140_000, rate: 0.18   },
      { limit: Infinity, rate: 0.1875 },
    ],
  },
  QC: {
    name: "Quebec",
    basic: 17_183,
    brackets: [
      { limit: 51_780,  rate: 0.14   },
      { limit: 103_545, rate: 0.19   },
      { limit: 126_000, rate: 0.24   },
      { limit: Infinity, rate: 0.2575 },
    ],
  },
  SK: {
    name: "Saskatchewan",
    basic: 17_661,
    brackets: [
      { limit: 49_720,  rate: 0.105  },
      { limit: 142_058, rate: 0.125  },
      { limit: Infinity, rate: 0.145 },
    ],
  },
  YT: {
    name: "Yukon",
    basic: 15_705,
    brackets: [
      { limit: 57_375,  rate: 0.064  },
      { limit: 114_750, rate: 0.09   },
      { limit: 158_519, rate: 0.109  },
      { limit: 500_000, rate: 0.128  },
      { limit: Infinity, rate: 0.15  },
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function applyBrackets(taxableIncome: number, brackets: Bracket): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const { limit, rate } of brackets) {
    if (taxableIncome <= prev) break;
    const slice = Math.min(taxableIncome, limit) - prev;
    tax += slice * rate;
    prev = limit;
    if (limit === Infinity) break;
  }
  return tax;
}

export type TaxBreakdown = {
  grossWeekly: number;
  federalTax: number;
  provincialTax: number;
  cpp: number;
  ei: number;
  totalDeductions: number;
  netWeekly: number;
  provinceName: string;
  annualGross: number;
  effectiveRate: number; // as a decimal, e.g. 0.22
};

/**
 * Estimate weekly payroll deductions.
 * @param weeklyGross  — gross pay for this week (hours × rate)
 * @param provinceCode — 2-letter province abbreviation (e.g. "ON"), case-insensitive
 */
export function estimateTax(weeklyGross: number, provinceCode: string | null | undefined): TaxBreakdown | null {
  if (!weeklyGross || weeklyGross <= 0) return null;

  const code = provinceCode?.trim().toUpperCase() ?? "";
  const prov = PROVINCES[code];

  const annualGross = weeklyGross * 52;

  // ── Federal income tax ────────────────────────────────────────────────────
  const fedTaxable = Math.max(0, annualGross - FEDERAL_BASIC_PERSONAL);
  const annualFedTax = applyBrackets(fedTaxable, FEDERAL_BRACKETS);

  // ── Provincial income tax (fallback to AB if province not found) ───────────
  const cfg = prov ?? PROVINCES["ON"]!;
  const provTaxable = Math.max(0, annualGross - cfg.basic);
  const annualProvTax = applyBrackets(provTaxable, cfg.brackets);

  // ── CPP ───────────────────────────────────────────────────────────────────
  const annualCPP = Math.min(
    Math.max(0, annualGross - CPP_BASIC_EXEMPTION) * CPP_RATE,
    CPP_MAX_ANNUAL,
  );

  // ── EI ────────────────────────────────────────────────────────────────────
  const annualEI = Math.min(
    Math.min(annualGross, EI_MAX_INSURABLE) * EI_RATE,
    EI_MAX_ANNUAL,
  );

  // ── Weekly equivalents ────────────────────────────────────────────────────
  const fedTax   = annualFedTax  / 52;
  const provTax  = annualProvTax / 52;
  const cpp      = annualCPP     / 52;
  const ei       = annualEI      / 52;
  const totalDeductions = fedTax + provTax + cpp + ei;
  const netWeekly = weeklyGross - totalDeductions;

  return {
    grossWeekly: weeklyGross,
    federalTax: fedTax,
    provincialTax: provTax,
    cpp,
    ei,
    totalDeductions,
    netWeekly,
    provinceName: prov ? cfg.name : `${code} (unknown — ON rates used)`,
    annualGross,
    effectiveRate: totalDeductions / weeklyGross,
  };
}

/** Return the province name for a code, or the code itself if not found. */
export function provinceName(code: string | null | undefined): string {
  if (!code) return "—";
  return PROVINCES[code.trim().toUpperCase()]?.name ?? code;
}
