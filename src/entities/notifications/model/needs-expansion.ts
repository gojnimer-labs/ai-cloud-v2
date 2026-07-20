export const INLINE_BODY_CHAR_LIMIT = 140;

// Whether a body is short enough to read inline, or needs some "show more"
// affordance instead — the full read-modal for a notification inbox item
// (see ui/notification-item.tsx) or Banner's own collapsible content area
// for a system alert (see ui/system-alert-banners.tsx). Long text or an
// embedded line break both mean a fixed-height inline area would cut off or
// visually break on real content. Content-fit based rather than tied to a
// specific variant, since any variant can carry either a short or a long
// message.
export const needsExpansion = (body: string | undefined): boolean => {
  if (!body) {
    return false;
  }
  return body.length > INLINE_BODY_CHAR_LIMIT || body.includes("\n");
};

// A short preview for the collapsed/inline state — cut at the first line
// break if there is one (so a multi-line body's preview doesn't show a
// literal line break), otherwise at the char limit. Returns the body
// unchanged when it already fits inline (see needsExpansion).
export const truncateForInline = (body: string): string => {
  if (!needsExpansion(body)) {
    return body;
  }
  const newlineIndex = body.indexOf("\n");
  const cutoff =
    newlineIndex === -1
      ? INLINE_BODY_CHAR_LIMIT
      : Math.min(newlineIndex, INLINE_BODY_CHAR_LIMIT);
  return `${body.slice(0, cutoff).trimEnd()}…`;
};
