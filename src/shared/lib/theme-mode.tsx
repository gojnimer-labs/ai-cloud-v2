import type { ThemeMode } from "@astryxdesign/core/theme";
import { createContext, use } from "react";

export interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(
  null
);

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = use(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return ctx;
};
