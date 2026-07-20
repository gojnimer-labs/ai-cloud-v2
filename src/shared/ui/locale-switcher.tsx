import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";

import type { Locale } from "@/paraglide/runtime";
import { getLocale, setLocale } from "@/paraglide/runtime";

const LABELS: Record<Locale, string> = {
  en: "EN",
  pt: "PT",
};

export const LocaleSwitcher = () => (
  <SegmentedControl
    label="Language"
    onChange={(value) => {
      setLocale(value as Locale);
    }}
    size="sm"
    value={getLocale()}
  >
    {Object.entries(LABELS).map(([locale, label]) => (
      <SegmentedControlItem key={locale} label={label} value={locale} />
    ))}
  </SegmentedControl>
);
