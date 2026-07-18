import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
// Type-only: erased at compile time, so importing from the full "better-auth"
// entry point here doesn't pull its runtime in alongside the "minimal" one
// used above.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { parseCookies } from "better-auth/cookies";
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
// `requireInvite` plugin below.
const INVITE_COOKIE_NAME = "invite_token";

// Extracts the raw invite token from a signed cookie value ("token.signature",
// same split `getSignedCookie` does internally — see
// node_modules/better-call/dist/context.mjs), without verifying the
// signature. That's intentional, not a shortcut: signature verification is
// how getSignedCookie behaves, but see the big comment below on why we
// can't use it here. Forging a cookie without knowing the server secret
// still requires guessing a real, existing `crypto.randomUUID()` invite
// token, so the DB lookup that follows (must exist, be pending, unexpired)
// is already the real check — the signature was only ever a cheap
// pre-filter, not the safety boundary.
const extractInviteToken = (rawCookieValue: string | undefined) => {
  if (!rawCookieValue) {
    return null;
  }
  const signatureStartPos = rawCookieValue.lastIndexOf(".");
  return signatureStartPos > 0
    ? rawCookieValue.slice(0, signatureStartPos)
    : null;
};

// Closes the open-registration gap better-invite leaves: without this,
// `/sign-up/email` succeeds for anyone, invite or not, and better-invite only
// opportunistically upgrades the role if an invite cookie happens to be
// present. This plugin runs first and rejects the sign-up outright when
// there's no valid, pending invite — and, for an email-targeted invite,
// when the address being signed up doesn't match it.
//
// That second check matters even though better-invite's own `after` hook
// (see hooks.mjs) already refuses to upgrade the role for a mismatched
// email: it only does that *after* the account has already been created,
// leaving a real, permanent, un-upgraded account behind for whoever used
// the leaked/forwarded link. Checking here instead rejects the sign-up
// before any account exists, so a targeted invite is an actual admission
// boundary, not just a role-assignment hint.
//
// Doesn't use ctx.getSignedCookie/ctx.getCookie: this app's frontend and
// auth backend are on different origins (see the `crossDomain` plugin
// above), and a cross-domain client never sets or reads real browser
// cookies for its auth state at all — it bridges everything through a
// custom `Better-Auth-Cookie` request header + localStorage instead (see
// node_modules/@convex-dev/better-auth/dist/plugins/cross-domain/client.js).
// The server-side half of that bridge (this same plugin's own `before`
// hook) rewrites an incoming `better-auth-cookie` header into a synthetic
// `Cookie` header — but ctx.getSignedCookie/getCookie can't see it even
// so: better-call parses cookies from the request into a closure ONCE,
// before any hook runs (node_modules/better-call/dist/context.mjs), so a
// *later* hook rewriting headers never reaches those closures. Reading and
// parsing both possible header sources ourselves, here, is what actually
// works regardless of which transport the client used.
const requireInvite = (): BetterAuthPlugin => ({
  hooks: {
    before: [
      {
        handler: createAuthMiddleware(async (ctx) => {
          const cookie = ctx.context.createAuthCookie(INVITE_COOKIE_NAME, {
            maxAge: 600,
          });
          const headers = ctx.headers ?? ctx.request?.headers;
          const cookieHeader = headers?.get("cookie");
          const bridgeHeader = headers?.get("better-auth-cookie");
          const rawCookieValue =
            (cookieHeader && parseCookies(cookieHeader).get(cookie.name)) ||
            (bridgeHeader && parseCookies(bridgeHeader).get(cookie.name)) ||
            undefined;
          const inviteToken = extractInviteToken(rawCookieValue);
          const invitation = inviteToken
            ? await ctx.context.adapter.findOne<{
                email: string | null;
                expiresAt: number;
                status: string;
              }>({
                model: "invite",
                where: [{ field: "token", value: inviteToken }],
              })
            : null;
          const isValid =
            invitation?.status === "pending" &&
            invitation.expiresAt > Date.now();
          if (!isValid) {
            throw new APIError("FORBIDDEN", {
              code: "INVITE_REQUIRED",
              message:
                "Registration is invite-only. Ask an admin for an invite link.",
            });
          }
          if (invitation.email && invitation.email !== ctx.body?.email) {
            throw new APIError("FORBIDDEN", {
              code: "INVITE_EMAIL_MISMATCH",
              message: "This invite is for a different email address.",
            });
          }
        }),
        matcher: (ctx) => ctx.path === "/sign-up/email",
      },
    ],
  },
  id: "require-invite",
});

// better-invite's own `after` hook (node_modules/better-invite/dist/hooks.mjs)
// matches far more than `/sign-up/email` — also `/sign-in/email`,
// `/sign-in/email-otp`, `/callback/:id`, `/verify-email`, and the
// two-factor verify routes — and, whenever it can read an invite_token
// cookie at all, unconditionally re-validates it: if the invite has
// already been consumed (the normal case for a just-registered user's very
// next sign-in), it rejects the request instead of silently ignoring a
// token that's none of that route's business. Confirmed live against the
// deployed backend: consuming the invite during `/sign-up/email` itself
// works fine (that hook's `ctx.getSignedCookie` isn't blind the way
// `requireInvite`'s was — see the doc comment above it — because it runs
// post-handler, after the cross-domain header rewrite has already taken
// effect). The actual bug is that the invite_token cookie is never cleared
// client-side afterward: `hooks.mjs`'s `expireCookie`/`setSessionCookie`
// calls are themselves Set-Cookie response headers set from *this same*
// `after` hook, which runs *after* `crossDomain`'s own Set-Cookie ->
// Set-Better-Auth-Cookie rewrite (an earlier-registered plugin's `after`
// hook) has already fired for this response — so they never reach the
// client's localStorage bridge. The stale, still-unexpired invite_token
// then rides along on the user's very next request, and if that's a login,
// better-invite's hook rejects it outright with an invite-related error.
//
// Fixed the same way `requireInvite` works around the adjacent
// cookie-visibility issue: a `before` hook, registered (like
// `requireInvite`) ahead of `invite({})` below, so its header rewrite is
// already in place by the time better-invite's `after` hook reads
// `ctx.getSignedCookie`. Strips the invite_token entry out of both
// possible header sources for every route better-invite's hook matches
// *except* `/sign-up/email` (where reading it is exactly the point) — so
// on every other route, that hook simply finds nothing and no-ops,
// regardless of what state the invite is actually in.
const INVITE_COOKIE_IRRELEVANT_PATHS = new Set([
  "/sign-in/email",
  "/sign-in/email-otp",
  "/callback/:id",
  "/verify-email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
]);

const stripCookieEntry = (rawHeader: string | null, cookieName: string) =>
  rawHeader
    ?.split(";")
    .map((entry) => entry.trim())
    .filter((entry) => !entry.startsWith(`${cookieName}=`))
    .join("; ");

const stripInviteCookieOutsideSignUp = (): BetterAuthPlugin => ({
  hooks: {
    before: [
      {
        // No await needed: this only ever reads/rewrites headers
        // synchronously, but createAuthMiddleware's handler type requires
        // an async function.
        // oxlint-disable-next-line require-await
        handler: createAuthMiddleware(async (ctx) => {
          // better-auth's before-hook runner (dispatch.mjs#runBeforeHooks)
          // calls every hook with the SAME original, unmodified headers —
          // hook return values only get merged into the request *after*
          // every before hook has run, they aren't visible to each other
          // mid-loop. So this can't see the "cookie" header `crossDomain`'s
          // own before hook synthesizes (it appends the raw
          // `better-auth-cookie` value onto "cookie") — it has to
          // synthesize that exact same "cookie" contribution itself,
          // stripped, so ITS return value (registered later, so it wins
          // the key-by-key merge) fully replaces crossDomain's unstripped
          // one instead of leaving it in place alongside a stripped
          // "better-auth-cookie".
          const existingHeaders = ctx.headers ?? ctx.request?.headers;
          if (!existingHeaders) {
            return;
          }
          const cookie = ctx.context.createAuthCookie(INVITE_COOKIE_NAME, {
            maxAge: 600,
          });
          const strippedBridge = stripCookieEntry(
            existingHeaders.get("better-auth-cookie"),
            cookie.name
          );
          if (strippedBridge === undefined) {
            return;
          }
          const headers = new Headers(
            Object.fromEntries(existingHeaders.entries())
          );
          headers.set("better-auth-cookie", strippedBridge);
          // Always set "cookie" (even to an empty/unchanged value) so this
          // return value's contribution wins the key-by-key merge in
          // runBeforeHooks — otherwise, if `crossDomain`'s own before hook
          // ran first and populated a "cookie" header with the *unstripped*
          // bridge value, and this stripped down to nothing worth adding,
          // that unstripped "cookie" entry would survive untouched (this
          // hook never mentioning the key at all means the merge never
          // reaches it).
          headers.set(
            "cookie",
            [existingHeaders.get("cookie"), strippedBridge]
              .filter(Boolean)
              .join("; ")
          );
          return { context: { headers } };
        }),
        matcher: (ctx) => INVITE_COOKIE_IRRELEVANT_PATHS.has(ctx.path ?? ""),
      },
    ],
  },
  id: "strip-invite-cookie-outside-sign-up",
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
      // Same ordering requirement as `requireInvite` above, and for the
      // same reason: its header rewrite needs to be in place before
      // better-invite's own `after` hook (registered by `invite()` below)
      // reads `ctx.getSignedCookie`.
      stripInviteCookieOutsideSignUp(),
      // Cast to the generic plugin shape: better-invite's precise return
      // type embeds its own InviteType/InviteTypeWithId types without
      // re-exporting them (its package "exports" map only exposes
      // dist/index.d.mts), which makes anything that inlines it — like this
      // options object's inferred type — unnameable in a declaration file
      // (TS2883). We don't need typed `auth.api.invite*` access from
      // server-side Convex code (invite management goes through
      // `authClient.invite.*` on the client instead), so erasing this one
      // plugin's literal type is a no-op for us.
      //
      // No options: invites are created directly through the adapter (see
      // convex/admin/mutations.ts#createInvite), not through this plugin's
      // own /invite/create — its link-building always resolves against this
      // app's Convex *site* URL rather than the actual frontend origin (a
      // different domain, per the crossDomain plugin above), which isn't
      // fixable through any of its options (see the doc comment on
      // createInvite for the full explanation). This plugin is kept only
      // for the `/invite/activate` endpoint our activation page calls
      // (and, for an already-signed-in user redeeming a role-upgrade
      // invite, its own consumption logic — that path reads the token from
      // the request body, not a cookie, so it isn't affected by the
      // cross-domain issue below). Its own `after` hook correctly consumes
      // the invite and upgrades the role on `/sign-up/email` — see
      // `stripInviteCookieOutsideSignUp` above for the actual bug in this
      // area (a stale invite_token cookie interfering with *other* routes,
      // not this one).
      invite({}) as BetterAuthPlugin,
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
