import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ThemeModeContext } from "@/shared/lib/theme-mode";

import { appTheme } from "./config/theme";

const STORAGE_KEY = "theme-mode";

const readInitialMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
};

// Wraps astryx's <Theme> to also own the mode as app state (Theme's `mode`
// prop is a plain controlled value with no built-in setter/persistence) so
// the settings modal can offer a light/dark/auto selector. Defaults to
// "system" (astryx's own live OS-preference tracking) until the user picks
// an explicit mode.
export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [storedMode, setStoredMode] = useState<ThemeMode>(readInitialMode);

  const setMode = useCallback((next: ThemeMode) => {
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
