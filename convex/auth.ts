import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

// Local install (rather than the hosted component) is required because the
// admin plugin adds fields (role, banned, ...) to the user/session tables
// that the hosted component's fixed schema doesn't carry. See
// https://labs.convex.dev/better-auth/features/local-install
export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  { local: { schema: authSchema } }
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  // @convex-dev/better-auth's createApi() (used by convex/betterAuth/adapter.ts
  // for the admin plugin's local-install schema) calls this eagerly while
  // Convex statically analyzes the betterAuth component during deploy, before
  // the app's env vars are guaranteed to be in scope — so this must not throw
  // on a missing SITE_URL the way a normal request-time check would.
  const siteUrl = process.env.SITE_URL;

  // Local dev (`npm run dev`, vite on localhost:5173) talks to this same
  // self-hosted deployment, so it needs to be trusted alongside the deployed
  // site — there's no separate dev deployment the way Convex Cloud provides.
  const trustedOrigins = [siteUrl, "http://localhost:5173"].filter(
    (origin): origin is string => Boolean(origin)
  );

  return {
    baseURL: process.env.CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      crossDomain({ siteUrl: siteUrl ?? "" }),
      convex({ authConfig }),
      admin(),
    ],
    trustedOrigins,
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => await authComponent.safeGetAuthUser(ctx),
  // Vendored user shape from the Better Auth component; not one of our own
  // tables, so we can't express it as a precise v.object() here.
  returns: v.any(),
});
