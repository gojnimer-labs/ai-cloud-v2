import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Figtree is loaded via the Google Fonts <link> in index.html — Astryx never
// fetches fonts itself, it only wires the font-family token once a font is
// available (see `npx astryx docs typography`). Everything else stays on the
// default neutral theme.
export const appTheme = defineTheme({
  extends: neutralTheme,
  name: "app",
  typography: {
    body: {
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      family: "Figtree",
    },
  },
});
