import type { Id } from "@convex/_generated/dataModel";

import type {
  NotificationVariant,
  SystemAlertAudience,
} from "@/entities/notifications";

export type TargetMode = "alert" | "groups" | "user";

// A synthetic UserSelect option value (see notification-compose-dialog.tsx)
// standing in for "every currently-registered user" — not a real userId, so
// the compose dialog checks for it explicitly on submit to route to
// broadcastToEveryone instead of sendToUser.
export const EVERYONE_TARGET_VALUE = "__everyone__";

export interface ComposeFormState {
  audience: SystemAlertAudience;
  body: string;
  groupIds: Id<"groups">[];
  href: string;
  isDismissable: boolean;
  targetMode: TargetMode;
  title: string;
  userId: string;
  variant: NotificationVariant;
}

export const EMPTY_COMPOSE_FORM_STATE: ComposeFormState = {
  audience: "everyone",
  body: "",
  groupIds: [],
  href: "",
  isDismissable: true,
  targetMode: "user",
  title: "",
  userId: "",
  variant: "info",
};
