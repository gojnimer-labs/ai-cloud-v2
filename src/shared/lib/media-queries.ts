// A matchMedia string, not CSS — can't reference a CSS custom property, so
// this can't be a design token. Shared so the breakpoint doesn't drift
// across independently-duplicated call sites; each caller's own comment
// explains why 640px specifically matters for that layout.
export const MOBILE_QUERY = "(max-width: 640px)";
