import { Selector } from "@astryxdesign/core/Selector";

import type { Locale } from "@/paraglide/runtime";
import { getLocale, setLocale } from "@/paraglide/runtime";

// Language names are shown in their own language regardless of the active
// UI locale (standard language-picker convention), so these are plain
// strings, not paraglide messages.
const LABELS: Record<Locale, string> = {
  en: "English",
  pt: "Português",
};

const OPTIONS = Object.entries(LABELS).map(([value, label]) => ({
  label,
  value,
}));

export const LocaleSwitcher = () => (
  <Selector
    label="Language"
    onChange={(value) => {
      setLocale(value as Locale);
    }}
    options={OPTIONS}
    value={getLocale()}
  />
);
