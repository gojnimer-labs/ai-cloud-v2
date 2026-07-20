import { v } from "convex/values";

import { internal } from "../_generated/api";
import { authComponent, createAuth } from "../auth";
import { adminAction } from "../functions";
import { notificationVariantValidator } from "../schema";

const LIST_USERS_PAGE_SIZE = 200;

// Broadcasts to every currently-registered user — a snapshot fan-out, not a
// standing alert (see convex/systemAlerts/ for the "must also reach future
// signups" case). Needs an action (not a mutation) because there's no
// app-owned users table to query via ctx.db — user identity lives entirely
// in the betterAuth component (see convex/auth.ts's doc comment), so
// enumerating everyone goes through the admin plugin's own listUsers
// endpoint, the same access pattern already used by auth.ts#getLatestJwks.
export const broadcastToEveryone = adminAction({
  args: {
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    title: v.string(),
    variant: notificationVariantValidator,
  },
  handler: async (ctx, args) => {
    // Convex actions have no HTTP request/cookies, so a Better Auth admin-
    // plugin endpoint (which resolves the caller's session from headers) has
    // nothing to check unless we hand it the current session's own headers
    // — authComponent.getAuth is the package's documented seam for exactly
    // this (see @convex-dev/better-auth's create-client.ts#getHeaders).
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    // First page tells us `total`, so every remaining page's offset is
    // already known — fetch those concurrently instead of awaiting each
    // page sequentially.
    const firstPage = await auth.api.listUsers({
      headers,
      query: { limit: LIST_USERS_PAGE_SIZE, offset: 0 },
    });
    const remainingOffsets: number[] = [];
    for (
      let offset = LIST_USERS_PAGE_SIZE;
      offset < firstPage.total;
      offset += LIST_USERS_PAGE_SIZE
    ) {
      remainingOffsets.push(offset);
    }
    const remainingPages = await Promise.all(
      remainingOffsets.map((offset) =>
        auth.api.listUsers({
          headers,
          query: { limit: LIST_USERS_PAGE_SIZE, offset },
        })
      )
    );
    const targetIds = [firstPage, ...remainingPages].flatMap((page) =>
      page.users.map((user) => user.id)
    );

    await ctx.runMutation(
      internal.notifications.mutations.enqueueEveryoneBroadcastInternal,
      {
        adminUserId: ctx.user._id,
        body: args.body,
        href: args.href,
        idempotencyKey: args.idempotencyKey,
        targetIds,
        title: args.title,
        variant: args.variant,
      }
    );
    return null;
  },
  returns: v.null(),
});
