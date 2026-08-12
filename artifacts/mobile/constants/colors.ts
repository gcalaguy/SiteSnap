// `dark` is the original charcoal/black/gold identity used by the web
// dashboard's dark theme. `light` is a warm off-white counterpart built for
// the appearance toggle (see context/ThemeContext.tsx) — same gold accent
// and status colors carried over so branding stays consistent, only the
// neutral surface/text tokens flip. `success`/`warning` were added for the
// mobile redesign's status system (construction-yellow primary accent stays
// reserved for brand/CTA use, not status). `draft` rounds that out into the
// 4-state Approved/Pending/Draft/Void system used by StatusPill — a slate
// tone so an un-submitted record doesn't read as "trouble" the way
// amber/red would. `overlay`/`sheetHandle` back the BottomSheet primitive:
// `overlay` is the backdrop scrim, `sheetHandle` the drag-grip color (needs
// contrast against `card`, not `background`).
//
// `cardElevated`/`borderSoft` back the elevated Card variant. On a near-black
// background a drop shadow does almost nothing on its own, so the lifted
// surface carries most of the depth: dark's `cardElevated` sits one step
// above `card`, and `borderSoft` is a translucent white edge that reads as a
// light catch. On a white/light background real shadows read fine, so
// light's `cardElevated` matches `card` and lets `elevation.card` do the
// lifting, and `borderSoft` is a translucent black edge instead.
//
// `sidebar`/`sidebarForeground` stay a fixed dark charcoal band with light
// text in BOTH palettes — several screens (e.g. the Profile header) treat it
// as an always-dark brand accent and hardcode white text against it, so it
// intentionally does not flip with the rest of the theme.
const colors = {
  light: {
    text: "#17140F",
    tint: "#B4923D",
    background: "#F7F5F0",
    foreground: "#17140F",
    card: "#FFFFFF",
    cardElevated: "#FFFFFF",
    cardForeground: "#17140F",
    primary: "#B4923D",
    primaryForeground: "#1A1400",
    secondary: "#ECE7DC",
    secondaryForeground: "#17140F",
    muted: "#F0ECE3",
    mutedForeground: "#6B6558",
    accent: "#F0ECE3",
    accentForeground: "#17140F",
    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",
    success: "#22C55E",
    successForeground: "#0B1F12",
    warning: "#F59E0B",
    warningForeground: "#1F1400",
    draft: "#64748B",
    draftForeground: "#F1F5F9",
    border: "#E6E1D6",
    borderSoft: "rgba(0,0,0,0.08)",
    input: "#E6E1D6",
    sidebar: "#0A0A0A",
    sidebarForeground: "#FAFAFA",
    overlay: "rgba(0,0,0,0.6)",
    sheetHandle: "#DCD6C9",
  },
  dark: {
    text: "#FAFAFA",
    tint: "#C9A84C",
    background: "#0F0F0F",
    foreground: "#FAFAFA",
    card: "#1A1A1A",
    cardElevated: "#1F1F1F",
    cardForeground: "#FAFAFA",
    primary: "#C9A84C",
    primaryForeground: "#111111",
    secondary: "#242424",
    secondaryForeground: "#FAFAFA",
    muted: "#1C1C1C",
    mutedForeground: "#888888",
    accent: "#1C1C1C",
    accentForeground: "#FAFAFA",
    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",
    success: "#22C55E",
    successForeground: "#0B1F12",
    warning: "#F59E0B",
    warningForeground: "#1F1400",
    draft: "#64748B",
    draftForeground: "#F1F5F9",
    border: "#2A2A2A",
    borderSoft: "rgba(255,255,255,0.06)",
    input: "#2A2A2A",
    sidebar: "#0A0A0A",
    sidebarForeground: "#FAFAFA",
    overlay: "rgba(0,0,0,0.6)",
    sheetHandle: "#3A3A3A",
  },
  radius: 6,
};

export default colors;
