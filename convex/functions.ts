import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

import { action, mutation, query } from "./_generated/server";
import { authComponent, requireAdminUser } from "./auth";

// "Must be logged in" — used by every workload/operator action that acts on
// behalf of the calling user. Throws before the handler ever runs if there's
// no authenticated session, so handlers can trust ctx.user unconditionally
// instead of every one of them repeating the same check. Not offered as a
// query/mutation variant: today's one "logged in" query
// (workloads/queries.ts#listOwned) needs to return [] rather than throw on
// no-user, which doesn't fit this throw-based contract.
export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    return { user };
  })
);

// "Must be an admin" — reuses the existing requireAdminUser check (see
// convex/auth.ts) instead of duplicating role logic here; this only
// centralizes the call-site boilerplate.
export const adminQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireAdminUser(ctx) }))
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireAdminUser(ctx) }))
);

export const adminAction = customAction(
  action,
  customCtx(async (ctx) => ({ user: await requireAdminUser(ctx) }))
);
