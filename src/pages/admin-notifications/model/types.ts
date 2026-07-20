import type { Id } from "@convex/_generated/dataModel";

import type {
  NotificationVariant,
  SystemAlertAudience,
} from "@/entities/notifications";

export type TargetMode = "alert" | "everyone" | "groups" | "user";

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
