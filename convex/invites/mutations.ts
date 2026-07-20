import { v } from "convex/values";

import { env } from "../_generated/server";
import { authComponent, createAuthOptions } from "../auth";
import {
  buildInviteEmailHtml,
  INVITE_EMAIL_SUBJECT,
  INVITE_FROM_ADDRESS,
  resend,
} from "../email";
import { adminMutation } from "../functions";

const INVITE_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

// Creates an invite directly through the same adapter Better Auth itself
// uses, instead of going through better-invite's own /invite/create.
//
// better-invite's create-invite route always builds the shareable link by
// resolving it against `ctx.context.baseURL` (this app's Convex *site* URL,
// e.g. https://site-xxx.gojlevicius.com) — see
// node_modules/better-invite/dist/utils.mjs#createRedirectURL — even when a
// custom invite URL template is configured, because it string-concatenates
// the template onto that origin rather than treating it as its own base.
// There's no way to point the generated link at this app's actual frontend
// origin (a different domain from the Convex site, per the crossDomain
// plugin already in use), so every link it built pointed at the backend,
// which has no page there → the browser landed on nothing useful, then
// fell through to /sign-in. Writing the invite row ourselves and building
// the link client-side (`${origin}/invite/${token}`, see InviteFormDialog)
// sidesteps that entirely.
export const createInvite = adminMutation({
  args: {
    email: v.optional(v.string()),
    // Default group(s) to assign to the invited user at signup — see
    // convex/auth.ts's applyInviteGroups hook.
    groupIds: v.optional(v.array(v.id("groups"))),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const token = crypto.randomUUID();
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.create({
      data: {
        createdAt: Date.now(),
        createdByUserId: ctx.user._id,
        email: args.email,
        expiresAt: Date.now() + INVITE_EXPIRES_MS,
        groupIds: args.groupIds,
        infinityMaxUses: false,
        maxUses: 1,
        // Only meaningful for the *already-signed-in* upgrade path (see
        // hooks.mjs's `after` hook and activate-invite.mjs's authenticated
        // branch) — the brand-new-account signup path resolves this same
        // field the exact same way, as a real HTTP redirect the browser
        // follows before our own client code ever runs, so it has to be a
        // real, working, ABSOLUTE url. A relative one (e.g. "/") would hit
        // the same cross-origin bug documented above: better-invite
        // resolves it against the Convex *site* URL, not this app's
        // frontend origin, and `new URL(absolute, base)` is the only way to
        // make it ignore that base and land on the frontend instead. Left
        // unset (redirecting to a broken /error url on the Convex site)
        // when SITE_URL isn't configured — signup still succeeds either
        // way, this only affects where the browser ends up afterward.
        redirectToAfterUpgrade: env.SITE_URL
          ? new URL("/", env.SITE_URL).toString()
          : undefined,
        role: args.role,
        shareInviterName: true,
        status: "pending",
        token,
      },
      model: "invite",
    });

    // SITE_URL is confirmed always set on this deployment (see the
    // defineApp({ env }) comment in convex/convex.config.ts) — unlike
    // redirectToAfterUpgrade above, an invite email with no working link is
    // worse than not sending one, so this doesn't need the same
    // unset-tolerant fallback.
    const emailSent = Boolean(args.email);
    if (args.email) {
      const link = new URL(`/invite/${token}`, env.SITE_URL).toString();
      await resend.sendEmail(ctx, {
        from: INVITE_FROM_ADDRESS,
        html: buildInviteEmailHtml({
          inviterName: ctx.user.name,
          link,
          role: args.role,
        }),
        subject: INVITE_EMAIL_SUBJECT,
        to: args.email,
      });
    }

    return { emailSent, token };
  },
  returns: v.object({ emailSent: v.boolean(), token: v.string() }),
});

// Cancels any pending invite, regardless of who created it — see the doc
// comment on listInvites (queries.ts) for why this goes through the raw
// adapter instead of better-invite's own client-facing /invite/cancel
// (which only lets the original creator cancel).
export const cancelInvite = adminMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.update({
      model: "invite",
      update: { status: "canceled" },
      where: [{ field: "token", value: args.token }],
    });
    return null;
  },
  returns: v.null(),
});
