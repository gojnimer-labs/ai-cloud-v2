import r2 from "@convex-dev/r2/convex.config";
import resend from "@convex-dev/resend/convex.config.js";
import selfHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

import betterAuth from "./betterAuth/convex.config";

// All optional: SITE_URL is confirmed set on this deployment, but
// CONVEX_SITE_URL doesn't show up in `npx convex env list` at all — it's
// almost certainly platform-injected rather than something set via
// `npx convex env set`, so marking it required risks a push-time
// "environment variable not set" failure Convex's own tooling doesn't
// actually let us fix. Optional preserves the exact fallback behavior each
// call site already had.
//
// JWKS is unset until the Static JWKS setup (convex/auth.ts#getLatestJwks)
// has been run once — until then, auth.config.ts and the convex() plugin
// both fall back to fetching /api/auth/convex/jwks live, exactly like today.
//
// RESEND_API_KEY isn't declared here — it's read internally by the Resend
// component itself from process.env, same as R2's credentials below.
// RESEND_FROM_ADDRESS and RESEND_IS_PROD are read by our own code
// (convex/email.ts, convex/admin/mutations.ts#createInvite):
// RESEND_FROM_ADDRESS is deployment-specific (the verified sending domain);
// RESEND_IS_PROD gates whether sends actually go out for real, since there's
// no separate dev deployment to default that behavior from. Env vars are
// always strings (no v.boolean() here) — "true" is the one value that
// counts as prod, everything else (including unset) stays in test mode.
const app = defineApp({
  env: {
    CONVEX_SITE_URL: v.optional(v.string()),
    JWKS: v.optional(v.string()),
    RESEND_FROM_ADDRESS: v.optional(v.string()),
    RESEND_IS_PROD: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});
app.use(selfHosting);
app.use(betterAuth);
app.use(r2);
app.use(resend);

export default app;
