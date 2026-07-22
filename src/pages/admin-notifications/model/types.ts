import type { Id } from "@convex/_generated/dataModel";

import type {
  NotificationVariant,
  SystemAlertAudience,
} from "@/entities/notifications";

// A synthetic UserSelect option value (see notification-compose-dialog.tsx)
// standing in for "every currently-registered user" — not a real userId, so
// the compose dialog checks for it explicitly on submit to route to
// broadcastToEveryone instead of sendToUser.
export const EVERYONE_TARGET_VALUE = "__everyone__";

// Shared by both compose dialogs (notification and system alert) — title is
// a short headline shown in banners/table rows, body has more room since the
// notification box's own read-modal exists for anything that overflows the
// inline two-line preview, but both still need a hard cap so a form field
// can't accept an unbounded amount of text.
export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 1000;

// A notification's target is either a name (a specific user, or "Everyone")
// or one or more groups — mutually exclusive, not a mode switch: the name
// field is simply disabled once a group is picked (see
// notification-compose-dialog.tsx).
export interface NotificationFormState {
  body: string;
  groupIds: Id<"groups">[];
  href: string;
  title: string;
  userId: string;
  variant: NotificationVariant;
}

export const EMPTY_NOTIFICATION_FORM_STATE: NotificationFormState = {
  body: "",
  groupIds: [],
  href: "",
  title: "",
  userId: "",
  variant: "info",
};

export interface AlertFormState {
  audience: SystemAlertAudience;
  body: string;
  href: string;
  isDismissable: boolean;
  title: string;
  variant: NotificationVariant;
}

export const EMPTY_ALERT_FORM_STATE: AlertFormState = {
  audience: "everyone",
  body: "",
  href: "",
  isDismissable: true,
  title: "",
  variant: "info",
};
