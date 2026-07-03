import React, { createContext, useContext, useEffect, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";

/** What the user picks. `system` follows the OS. Independent of design version. */
export type ThemePreference = "light" | "dark" | "system";
/** The concrete theme actually applied (system is resolved to one of these). */
export type Theme = "light" | "dark";

interface ThemeContextType {
  /** Resolved theme applied to <html> — always light|dark. */
  theme: Theme;
  /** User's stored choice — light|dark|system. */
  themePreference: ThemePreference;
  setThemePreference: (t: ThemePreference) => void;
  /** Back-compat: toggles between light/dark (used by the Old shell button). */
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LS_KEY = "theme";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStored(defaultTheme: ThemePreference): ThemePreference {
  if (typeof window === "undefined") return defaultTheme;
  const v = localStorage.getItem(LS_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : defaultTheme;
}

function resolve(pref: ThemePreference): Theme {
  if (pref === "system") return prefersDark() ? "dark" : "light";
  return pref;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const prefs = usePreferences();
  const [themePreference, setPref] = useState<ThemePreference>(() =>
    switchable ? readStored(defaultTheme) : defaultTheme
  );
  const [theme, setResolved] = useState<Theme>(() => resolve(themePreference));

  // Reconcile with the server preference once it loads (cross-device).
  useEffect(() => {
    if (!switchable || !prefs.isLoaded) return;
    const serverPref = prefs.user["ui.theme"] ?? prefs.globals["ui.themeDefault"];
    if (serverPref === "light" || serverPref === "dark" || serverPref === "system") {
      setPref(prev => (localStorage.getItem(LS_KEY) ? prev : serverPref));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.isLoaded]);

  // Apply theme to <html>, react to OS changes when in system mode.
  useEffect(() => {
    const apply = () => {
      const next = resolve(themePreference);
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    apply();
    if (themePreference === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [themePreference]);

  const setThemePreference = (t: ThemePreference) => {
    setPref(t);
    if (switchable) {
      localStorage.setItem(LS_KEY, t);
      prefs.setPreference("ui.theme", t);
    }
  };

  const toggleTheme = switchable
    ? () => setThemePreference(theme === "light" ? "dark" : "light")
    : undefined;

  return (
    <ThemeContext.Provider
      value={{ theme, themePreference, setThemePreference, toggleTheme, switchable }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
