import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
// Type-only: erased at compile time, so importing from the full "better-auth"
// entry point here doesn't pull its runtime in alongside the "minimal" one
// used above.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { admin, oneTimeToken } from "better-auth/plugins";
import { invite } from "better-invite";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

// Mirrors better-invite's own (unexported) INVITE_COOKIE_NAME constant
// (node_modules/better-invite/dist/constants.mjs). better-invite sets this
// signed cookie in its `/invite/activate` endpoint once a real, valid invite
// token has been presented, and reads it back in an `after` hook on
// `/sign-up/email` to upgrade the new user's role. It does NOT block signups
// that arrive without this cookie — that enforcement is on us, via the
// `requireInvite` plugin below. Being an HMAC-signed cookie
// (`ctx.setSignedCookie`/`ctx.getSignedCookie`, keyed off the Better Auth
// server secret), it can't be forged by a client that hasn't gone through a
// real `/invite/activate` call, so checking for its mere presence here is a
// sound gate — better-invite's own `after` hook still does the full
// expiry/max-uses validation once the account exists.
const INVITE_COOKIE_NAME = "invite_token";

// Closes the open-registration gap better-invite leaves: without this,
// `/sign-up/email` succeeds for anyone, invite or not, and better-invite only
// opportunistically upgrades the role if an invite cookie happens to be
// present. This plugin runs first and rejects the sign-up outright when
// there's no signed invite cookie at all.
const requireInvite = (): BetterAuthPlugin => ({
  hooks: {
    before: [
      {
        handler: createAuthMiddleware(async (ctx) => {
          const cookie = ctx.context.createAuthCookie(INVITE_COOKIE_NAME, {
            maxAge: 600,
          });
          const inviteToken = await ctx.getSignedCookie(
            cookie.name,
            ctx.context.secret
          );
          if (!inviteToken) {
            throw new APIError("FORBIDDEN", {
              code: "INVITE_REQUIRED",
              message:
                "Registration is invite-only. Ask an admin for an invite link.",
            });
          }
        }),
        matcher: (ctx) => ctx.path === "/sign-up/email",
      },
    ],
  },
  id: "require-invite",
});

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
  // on a missing SITE_URL the way a normal request-time check would. `env` is
  // just a typed view over `process.env` (see convex/convex.config.ts), so
  // this constraint applies identically to it.
  const siteUrl = env.SITE_URL;

  // Local dev (`npm run dev`, vite on localhost:5173) talks to this same
  // self-hosted deployment, so it needs to be trusted alongside the deployed
  // site — there's no separate dev deployment the way Convex Cloud provides.
  const trustedOrigins = [siteUrl, "http://localhost:5173"].filter(
    (origin): origin is string => Boolean(origin)
  );

  return {
    baseURL: env.CONVEX_SITE_URL,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      crossDomain({ siteUrl: siteUrl ?? "" }),
      convex({ authConfig }),
      admin(),
      // Powers the gateway hand-off to the operator's own session (see
      // workloads/actions.ts#getWorkloadAccessToken and
      // operators/http.ts's gateway/verify route). expiresIn matches the
      // old hand-rolled token's 60s TTL; disableSetSessionCookie is
      // irrelevant Set-Cookie noise since the caller is the Go operator,
      // not a browser.
      oneTimeToken({ disableSetSessionCookie: true, expiresIn: 1 }),
      // Must run before `invite()` below so its `before` hook on
      // `/sign-up/email` can reject the request before better-invite's own
      // `after` hook (or the sign-up handler) ever runs.
      requireInvite(),
      // Cast to the generic plugin shape: better-invite's precise return
      // type embeds its own InviteType/InviteTypeWithId types without
      // re-exporting them (its package "exports" map only exposes
      // dist/index.d.mts), which makes anything that inlines it — like this
      // options object's inferred type — unnameable in a declaration file
      // (TS2883). We don't need typed `auth.api.invite*` access from
      // server-side Convex code (invite management goes through
      // `authClient.invite.*` on the client instead), so erasing this one
      // plugin's literal type is a no-op for us.
      invite({
        canCreateInvite: ({ inviterUser }) => inviterUser.role === "admin",
        // Sends the invitee straight to our own activation screen instead of
        // better-invite's generic `/invite/:token` callback route. The
        // `{callbackURL}` placeholder must stay — better-invite substitutes
        // it with `/sign-up` or `/sign-in` (see defaultRedirectToSignUp/In
        // below) depending on whether this invite is for a brand-new
        // account or a role upgrade, and our activation page reads it back
        // out of the URL to know where to send the user next.
        defaultCustomInviteUrl: "/invite/{token}?callbackURL={callbackURL}",
        defaultRedirectAfterUpgrade: "/",
        // Real app routes, not better-invite's `/auth/sign-in`/`/auth/sign-up`
        // defaults.
        defaultRedirectToSignIn: "/sign-in",
        defaultRedirectToSignUp: "/sign-up",
        // No email provider is wired up yet (MVP): admins copy/share the
        // generated link manually from the Invites tab, so every invite
        // created from the admin UI is a "public" (no-email) invite and
        // `senderResponse: "url"` makes /invite/create hand that link back
        // directly in its response instead of only a bare token.
        defaultSenderResponse: "url",
        async sendUserInvitation() {
          // No-op: see defaultSenderResponse note above. This only needs to
          // exist (not throw) to satisfy better-invite's requirement that a
          // handler be configured whenever an invite targets a specific
          // email address.
        },
      }) as BetterAuthPlugin,
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

// Server-side gate for admin-only queries/mutations — role is only ever
// trustworthy read from the authenticated user's own component record, never
// from a client-supplied argument.
export const requireAdminUser = async (ctx: GenericCtx<DataModel>) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (user?.role !== "admin") {
    throw new Error("Admin access required");
  }
  return user;
};
