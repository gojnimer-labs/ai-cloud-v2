import { Theme } from "@astryxdesign/core/theme";
import { createContext, use, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { appTheme } from "./config/theme";

type ColorMode = "light" | "dark";

const STORAGE_KEY = "theme-mode";

const readInitialMode = (): ColorMode => {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

interface ThemeModeContextValue {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = use(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return ctx;
};

// Wraps astryx's <Theme> to also own the mode as app state (Theme's `mode`
// prop is a plain controlled value with no built-in setter/persistence) so
// the settings modal can offer a dark-mode toggle.
export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [storedMode, setStoredMode] = useState<ColorMode>(readInitialMode);

  const setMode = useCallback((next: ColorMode) => {
    setStoredMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const ctxValue = useMemo(
    () => ({ mode: storedMode, setMode }),
    [storedMode, setMode]
  );

  return (
    <ThemeModeContext value={ctxValue}>
      <Theme mode={storedMode} theme={appTheme}>
        {children}
      </Theme>
    </ThemeModeContext>
  );
};
