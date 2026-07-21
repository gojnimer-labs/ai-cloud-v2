// Typed as a plain string, not any page's own GroupBadgeColor union — those
// stay independently duplicated per slice on purpose (see e.g.
// admin-groups/model/types.ts), and coupling this shared component to one
// of them would undo that. Callers pass the raw color name (e.g. "blue");
// the var(--color-icon-*) construction happens here, in one place.
export const GroupBadgeColorSwatch = ({ color }: { color: string }) => (
  <span
    style={{
      backgroundColor: `var(--color-icon-${color})`,
      borderRadius: "50%",
      display: "inline-block",
      height: "var(--spacing-2)",
      width: "var(--spacing-2)",
    }}
  />
);
