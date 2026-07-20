import { m } from "@/paraglide/messages";

// Mirrors convex/schema.ts's notificationVariantValidator by hand — the
// frontend never imports server-side convex/ modules directly (same
// convention as src/shared/lib/get-error-message.ts's ERROR_MESSAGES vs.
// convex/lib/errors.ts's AppErrorCode), so adding a variant means updating
// both places.
export const NOTIFICATION_VARIANTS = [
  "info",
  "warning",
  "success",
  "error",
] as const;

export type NotificationVariant = (typeof NOTIFICATION_VARIANTS)[number];

// Neither StatusDot's own variant enum nor Icon's `color` prop has an
// "info" option (both cover success/warning/error/accent, no dedicated info
// tone) — "accent" is the closest stand-in for "info" in both, so this one
// mapping covers both call sites (see ui/notification-item.tsx's Icon
// `color`).
export const VARIANT_STATUS_DOT: Record<
  NotificationVariant,
  "accent" | "error" | "success" | "warning"
> = {
  error: "error",
  info: "accent",
  success: "success",
  warning: "warning",
};

// Banner's `status` prop is info/warning/error/success — a direct match.
export const VARIANT_BANNER_STATUS: Record<
  NotificationVariant,
  "error" | "info" | "success" | "warning"
> = {
  error: "error",
  info: "info",
  success: "success",
  warning: "warning",
};

export const variantLabel = (variant: NotificationVariant): string => {
  if (variant === "info") {
    return m.notification_variant_info();
  }
  if (variant === "warning") {
    return m.notification_variant_warning();
  }
  if (variant === "success") {
    return m.notification_variant_success();
  }
  return m.notification_variant_error();
};
