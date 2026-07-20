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
