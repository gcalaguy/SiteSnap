import colors from "@/constants/colors";
import { useThemePreference } from "@/context/ThemeContext";

/**
 * Returns the design tokens for the resolved color scheme (the user's
 * light/dark/system preference from ThemeContext, with "system" resolved
 * against the OS setting).
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 */
export function useColors() {
  const { scheme } = useThemePreference();
  const palette = scheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
