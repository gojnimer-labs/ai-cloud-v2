import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NotificationsPage } from "@/pages/admin-notifications";

const NOTIFICATIONS_MODAL_KINDS = [
  "compose-notification",
  "compose-alert",
] as const;

export const Route = createFileRoute("/_authed/admin/notifications")({
  component: NotificationsPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    modal: z.enum(NOTIFICATIONS_MODAL_KINDS).optional().catch(undefined),
  }),
});
