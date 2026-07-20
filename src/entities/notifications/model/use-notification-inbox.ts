import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type NotificationListItem = FunctionReturnType<
  typeof api.notifications.queries.list
>[number];

// Wraps the self-serve inbox API (see convex/notifications/queries.ts and
// mutations.ts) into one hook the bell/panel share — a single useQuery for
// the list (capped at the package's own defaultListLimit of 50, plenty for a
// dropdown inbox) plus counts for the unread badge, and the four state
// mutations already exported as-is from the package.
export const useNotificationInbox = () => {
  const notifications = useQuery(api.notifications.queries.list, {});
  const counts = useQuery(api.notifications.queries.counts, {});
  const markSeenMutation = useMutation(api.notifications.mutations.markSeen);
  const markAllSeenMutation = useMutation(
    api.notifications.mutations.markAllSeen
  );
  const dismissMutation = useMutation(api.notifications.mutations.dismiss);
  const dismissAllMutation = useMutation(
    api.notifications.mutations.dismissAll
  );

  return {
    dismiss: (notificationId: NotificationListItem["_id"]) =>
      dismissMutation({ notificationId }),
    dismissAll: () => dismissAllMutation({}),
    markAllSeen: () => markAllSeenMutation({}),
    markSeen: (notificationId: NotificationListItem["_id"]) =>
      markSeenMutation({ notificationId }),
    notifications,
    unseenCount: counts?.unseen ?? 0,
  };
};
