// Shared layout tokens for the mobile redesign's component library
// (components/ui/*). Kept separate from colors.ts's `radius` export (a plain
// number consumed by app/sign-in.tsx) so existing screens are unaffected.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  full: 999,
} as const;

export type FontWeight = "regular" | "medium" | "semibold" | "bold";

export const fontFamily: Record<FontWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

type TypeStyle = { fontSize: number; lineHeight: number; fontFamily: string };

function type(fontSize: number, lineHeight: number, weight: FontWeight): TypeStyle {
  return { fontSize, lineHeight, fontFamily: fontFamily[weight] };
}

// Mobile-first hierarchy: fewer sizes than the web dashboard, tuned for
// one-handed field use (larger tap targets, higher-contrast labels).
export const typography = {
  display: type(28, 34, "bold"),
  title: type(20, 26, "bold"),
  heading: type(16, 22, "semibold"),
  body: type(15, 21, "regular"),
  bodyMedium: type(15, 21, "medium"),
  caption: type(13, 18, "regular"),
  captionMedium: type(13, 18, "medium"),
  label: type(12, 16, "semibold"),
};

// Micro-interaction timing — shared so every swipe reveal / sheet transition
// in the app decelerates the same way instead of each screen picking its own
// number. `snappy` is for anything the user's finger is actively driving
// (swipe actions, sheet drag-release); `standard` is for anything
// programmatic (sheet open/close, filter chip toggles).
export const motion = {
  duration: { snappy: 180, standard: 240 },
} as const;

// Cards stay flat everywhere per Card's "no shadows" rule — elevation is
// reserved for surfaces that visually leave the page flow: bottom sheets and
// their scrim. Kept here rather than inline so the one legitimate shadow in
// the app has a single definition.
export const elevation = {
  sheet: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
} as const;
