import { v } from "convex/values";

import { query } from "./_generated/server";
import { authComponent, createAuthOptions } from "./auth";

// Public (pre-auth) lookup for the invite activation page: the token
// already determines the invite's email/role server-side (see
// convex/admin/mutations.ts#createInvite), so the shared invite link only
// ever needs to carry the token — this is how the activation page gets the
// email to display and to prefill the sign-up form with, instead of also
// stuffing it into the link's query string (redundant, and leaks the
// address into anything that logs/caches the URL).
export const getInviteInfo = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const invite = await adapter.findOne<{
      email: string | null;
      role: string;
    }>({
      model: "invite",
      where: [{ field: "token", value: args.token }],
    });
    if (!invite) {
      return null;
    }
    return { email: invite.email, role: invite.role };
  },
  returns: v.union(
    v.null(),
    v.object({ email: v.union(v.null(), v.string()), role: v.string() })
  ),
});
