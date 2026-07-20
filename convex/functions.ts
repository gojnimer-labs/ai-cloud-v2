import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

import { action, mutation, query } from "./_generated/server";
import { authComponent, requireAdminUser } from "./auth";
import { appError } from "./lib/errors";

// "Must be logged in" — used by every workload/operator handler that acts on
// behalf of the calling user and needs to call out to an operator (fetch
// isn't legal inside a mutation, so anything hitting an operator's HTTP API
// belongs here). For a handler that only reads/writes Convex's own tables
// (plus an in-transaction auth-token mint), prefer authedMutation below —
// it's atomic with any nested runQuery/runMutation calls and gets Convex's
// automatic retry-on-network-failure, neither of which an action gets.
export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw appError("auth.not_authenticated");
    }
    return { user };
  })
);

// Mutation counterpart to authedAction above — same "must be logged in"
// contract, for handlers with no outbound fetch (pure DB reads/writes, or an
// in-transaction auth-token mint via authComponent.getAuth). Nested
// ctx.runQuery/ctx.runMutation calls made from a mutation share its
// transaction, unlike the same calls from an action.
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw appError("auth.not_authenticated");
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
