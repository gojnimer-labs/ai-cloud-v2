import r2 from "@convex-dev/r2/convex.config";
import selfHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

import betterAuth from "./betterAuth/convex.config";

// Both optional: SITE_URL is confirmed set on this deployment, but
// CONVEX_SITE_URL doesn't show up in `npx convex env list` at all — it's
// almost certainly platform-injected rather than something set via
// `npx convex env set`, so marking it required risks a push-time
// "environment variable not set" failure Convex's own tooling doesn't
// actually let us fix. Optional preserves the exact fallback behavior each
// call site already had.
const app = defineApp({
  env: {
    CONVEX_SITE_URL: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});
app.use(selfHosting);
app.use(betterAuth);
app.use(r2);

export default app;
