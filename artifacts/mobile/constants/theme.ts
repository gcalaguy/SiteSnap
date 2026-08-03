// Shared layout tokens for the mobile component library (components/ui/*).
// Kept separate from colors.ts's `radius` export (a plain number consumed by
// app/sign-in.tsx) so existing screens are unaffected.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// Page-level rhythm. The old screens hardcoded `spacing.xl` (20) as the
// horizontal gutter and `spacing.xxl` (24) between sections; both are a step
// tighter than the airy, premium spacing this design language wants, and
// reusing the raw spacing scale for two different jobs made them impossible to
// tune independently. `gutter`/`sectionGap` are the knobs for page density.
export const layout = {
  gutter: 24,
  sectionGap: 32,
} as const;

// Large, soft corners are the most recognisable trait of the reference design.
// `sm` is for small inline chrome (icon tiles, inputs), `md` the default card /
// button radius, `lg` for hero surfaces and sheets, `full` for pills.
export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  xl: 32,
  full: 999,
} as const;

export type FontWeight = "regular" | "medium" | "semibold" | "bold" | "extrabold";

// Nunito Sans — a humanist sans in the Avenir family of shapes. Chosen over
// Inter for its warmer, more editorial feel at display sizes; it keeps the tall
// x-height and open apertures that made Inter legible in direct sun, so the
// small-size legibility rationale in docs/MOBILE_DESIGN_SYSTEM.md still holds.
export const fontFamily: Record<FontWeight, string> = {
  regular: "NunitoSans_400Regular",
  medium: "NunitoSans_500Medium",
  semibold: "NunitoSans_600SemiBold",
  bold: "NunitoSans_700Bold",
  extrabold: "NunitoSans_800ExtraBold",
};

type TypeStyle = { fontSize: number; lineHeight: number; fontFamily: string };

function type(fontSize: number, lineHeight: number, weight: FontWeight): TypeStyle {
  return { fontSize, lineHeight, fontFamily: fontFamily[weight] };
}

// Mobile-first hierarchy: fewer sizes than the web dashboard, tuned for
// one-handed field use (larger tap targets, higher-contrast labels). The top of
// the scale is deliberately large — a screen hero is meant to dominate — while
// `caption` stays at 13px, the documented floor for anything load-bearing on a
// phone held at arm's length in bright sun.
export const typography = {
  hero: type(40, 46, "extrabold"),
  display: type(34, 40, "bold"),
  title: type(22, 28, "bold"),
  heading: type(18, 24, "semibold"),
  body: type(16, 23, "regular"),
  bodyMedium: type(16, 23, "medium"),
  caption: type(13, 18, "regular"),
  captionMedium: type(13, 18, "medium"),
  // Section eyebrows are set in spaced uppercase — the letter-spacing is what
  // makes a 12px all-caps label read as deliberate typography rather than a
  // shrunken heading.
  label: { ...type(12, 16, "semibold"), letterSpacing: 1.4 },
};

// Micro-interaction timing — shared so every swipe reveal / sheet transition
// in the app decelerates the same way instead of each screen picking its own
// number. `snappy` is for anything the user's finger is actively driving
// (swipe actions, sheet drag-release); `standard` is for anything
// programmatic (sheet open/close, filter chip toggles).
export const motion = {
  duration: { snappy: 180, standard: 240 },
} as const;

// A black shadow on a near-black background is almost invisible, so `card`
// elevation is only half the effect — it pairs with the lighter `cardElevated`
// surface in constants/colors.ts. Use both together or neither; a shadow alone
// won't read. `sheet` is unchanged: it casts upward because sheets enter from
// the bottom edge.
export const elevation = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 3,
  },
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
} as const;
