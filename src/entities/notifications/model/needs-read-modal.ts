const INLINE_BODY_CHAR_LIMIT = 140;

// Whether a notification's body is short enough to read inline in the
// notification box, or needs the full read-modal (see
// ui/notification-read-modal.tsx) — long text or an embedded line break both
// mean the box's two-line truncation would cut off real content. A link
// doesn't factor in here — it gets its own inline open-link action on the
// item row (see notification-item.tsx) rather than forcing the modal open.
// Content-fit based rather than tied to a specific variant, since any
// variant can carry either a short or a long message.
export const needsReadModal = (body: string | undefined): boolean => {
  if (!body) {
    return false;
  }
  return body.length > INLINE_BODY_CHAR_LIMIT || body.includes("\n");
};
