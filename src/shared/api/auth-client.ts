import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [crossDomainClient(), convexClient(), adminClient()],
  // Default refetchOnWindowFocus revalidates the session on every tab
  // focus/reconnect (rate-limited to 1 per 5s) — this was the single
  // largest Convex function-call driver in the old app's usage (~4.7M of
  // 12M calls over 4 months, per Convex dashboard). A coarse interval
  // still catches long-idle-session staleness without the per-focus-event
  // volume.
  sessionOptions: {
    refetchInterval: 300,
    refetchOnWindowFocus: false,
  },
});
