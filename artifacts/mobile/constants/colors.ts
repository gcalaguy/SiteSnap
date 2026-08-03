// Both palettes below share the same charcoal/black/gold identity used by the
// web dashboard's dark theme — see hooks/useColors.ts for why this app does
// not switch to a white background on light-mode devices. `success`/`warning`
// were added for the mobile redesign's status system (construction-yellow
// primary accent stays reserved for brand/CTA use, not status). `draft` rounds
// that out into the 4-state Approved/Pending/Draft/Void system used by
// StatusPill — a slate tone so an un-submitted record doesn't read as
// "trouble" the way amber/red would. `overlay`/`sheetHandle` back the
// BottomSheet primitive: `overlay` is the backdrop scrim, `sheetHandle` the
// drag-grip color (needs contrast against `card`, not `background`).
const colors = {
  light: {
    text: "#FAFAFA",
    tint: "#C9A84C",
    background: "#0F0F0F",
    foreground: "#FAFAFA",
    card: "#1A1A1A",
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
    input: "#2A2A2A",
    sidebar: "#0A0A0A",
    sidebarForeground: "#FAFAFA",
    overlay: "rgba(0,0,0,0.6)",
    sheetHandle: "#3A3A3A",
  },
  dark: {
    text: "#FAFAFA",
    tint: "#C9A84C",
    background: "#0F0F0F",
    foreground: "#FAFAFA",
    card: "#1A1A1A",
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
    input: "#2A2A2A",
    sidebar: "#0A0A0A",
    sidebarForeground: "#FAFAFA",
    overlay: "rgba(0,0,0,0.6)",
    sheetHandle: "#3A3A3A",
  },
  radius: 6,
};

export default colors;
