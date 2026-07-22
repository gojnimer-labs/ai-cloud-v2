import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type SystemAlertListItem = FunctionReturnType<
  typeof api.systemAlerts.queries.listActiveSystemAlertsForCurrentUser
>[number];

// Active, undismissed-by-me system alerts for a given topic (default
// "global", the app-shell banner) — rendered as page-level banners (see
// ui/system-alert-banners.tsx), a separate surface from the personal
// notification box (see use-notification-inbox.ts and convex/schema.ts's
// systemAlerts doc comment on why the two are architecturally distinct).
export const useSystemAlerts = (topic?: string) => {
  const alerts = useQuery(
    api.systemAlerts.queries.listActiveSystemAlertsForCurrentUser,
    { topic }
  );
  const dismissMutation = useMutation(
    api.systemAlerts.mutations.dismissSystemAlert
  );

  return {
    alerts,
    dismiss: (alertId: SystemAlertListItem["_id"]) =>
      dismissMutation({ alertId }),
  };
};
