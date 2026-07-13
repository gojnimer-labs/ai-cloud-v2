import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { getLocale, type Locale, setLocale } from "@/paraglide/runtime";

const LABELS: Record<Locale, string> = {
  en: "EN",
  pt: "PT",
};

export function LocaleSwitcher() {
  return (
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
}
