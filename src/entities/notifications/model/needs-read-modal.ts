const INLINE_BODY_CHAR_LIMIT = 140;

// Whether a notification needs the full read-modal (see
// ui/notification-read-modal.tsx) rather than being fully readable inline in
// the notification box: long text or an embedded line break both mean the
// box's two-line truncation would cut off real content, and a link has
// nowhere to go inline at all — the read-modal is the only place a
// notification's href is ever rendered as an actual link (see
// notification-item.tsx's own comment on why the row doesn't get a second,
// nested interactive element for it). Content-fit based rather than tied to
// a specific variant, since any variant can carry either a short or a long
// message.
export const needsReadModal = (
  body: string | undefined,
  href: string | undefined
): boolean => {
  if (href) {
    return true;
  }
  if (!body) {
    return false;
  }
  return body.length > INLINE_BODY_CHAR_LIMIT || body.includes("\n");
};
