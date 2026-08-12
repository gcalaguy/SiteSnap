import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "theme_preference_v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";

interface ThemeContextValue {
  /** What the user picked — may be "system", in which case `scheme` follows the OS setting. */
  preference: ThemePreference;
  /** The actual palette to render — always "light" or "dark", never "system". */
  scheme: ResolvedScheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
    });
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const scheme: ResolvedScheme = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemePreference must be used within a ThemeProvider");
  return ctx;
}
