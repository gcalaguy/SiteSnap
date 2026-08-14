// Single source of truth for the black & gold brand constants that can't be
// expressed as CSS custom properties, because dashboard.tsx/layout.tsx/
// projects.tsx use the `${GOLD}18`-style hex+alpha-suffix pattern, which only
// works with a literal 6-digit hex string (a var()/hsl() expression breaks
// it). Before this file existed, each page redeclared its own copy of these
// values — which is how the sidebar/dashboard gold and the Projects page
// gold could silently drift apart. Keep these in sync with index.css's
// --primary (43 62% 52%) and --sidebar/--sidebar-border tokens by hand.

export const GOLD = "#D4AF37";
export const GOLD_BORDER = "#2A2200";
export const BLACK = "#0A0A0A";

// Sidebar surfaces — always dark, theme-invariant (matches --sidebar).
export const SIDEBAR_SURFACE = "#141414";
export const SIDEBAR_SURFACE_HOVER = "#1C1C1C";

// Content-area surfaces — light theme only.
export const CONTENT_SURFACE = "#FFFFFF";
export const CONTENT_SURFACE_MUTED = "#F8F8F8";
export const CONTENT_SURFACE_SUNKEN = "#F0F0F0";
export const BORDER = "#E5E5E5";
export const TEXT = "#111111";
export const MUTED = "#888888";
