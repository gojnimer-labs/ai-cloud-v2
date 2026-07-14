import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, httpAction } from "../_generated/server";
import { generateToken, hashToken } from "./crypto";

const BEARER_PREFIX = "Bearer ";

// Shared by every operator-authenticated route (heartbeat, workload
// lifecycle callbacks): verifies the presented heartbeatToken and returns
// the calling operator's _id, or null if missing/invalid. A 401 here is the
// operator's signal (see ai-cloud-operator's convexclient package) to
// discard its stored token and re-register from scratch.
async function authenticateOperator(
  ctx: ActionCtx,
  req: Request
): Promise<Id<"operators"> | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const heartbeatToken = auth.slice(BEARER_PREFIX.length);
  const heartbeatTokenHash = await hashToken(heartbeatToken);

  const operator = await ctx.runQuery(
    internal.operators.queries.getByHeartbeatTokenHash,
    { heartbeatTokenHash }
  );
  return operator?._id ?? null;
}

// POST /operators/register — claims a cluster row an admin pre-created,
// mints a fresh (heartbeatToken, deployToken) pair, and returns them once.
// `name` is intentionally never read from the body: the cluster's identity
// is fixed at admin-creation time, and trusting a caller-supplied name here
// was the actual gap in the old single-shared-secret design (anyone holding
// the secret could claim or rename any cluster). Convex never persists the
// raw heartbeatToken (only its hash); deployToken is stored raw since Convex
// is the one who must present it later when calling the operator's own API.
// See convex/schema.ts for why two tokens exist instead of one.
export const register = httpAction(async (ctx, req) => {
  const body = await req.json();
  const { externalUrl, enrollmentSecret, metadata } = body ?? {};

  if (typeof externalUrl !== "string" || typeof enrollmentSecret !== "string") {
    return new Response("externalUrl and enrollmentSecret are required", {
      status: 400,
    });
  }

  const heartbeatToken = generateToken();
  const deployToken = generateToken();
  const heartbeatTokenHash = await hashToken(heartbeatToken);
  const enrollmentTokenHash = await hashToken(enrollmentSecret);

  const claimed = await ctx.runMutation(internal.operators.mutations.claim, {
    deployToken,
    enrollmentTokenHash,
    externalUrl,
    heartbeatTokenHash,
    metadata,
  });
  if (!claimed) {
    return new Response("invalid enrollment secret", { status: 401 });
  }

  return new Response(JSON.stringify({ deployToken, heartbeatToken }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});

// POST /operators/heartbeat — presented with the operator's heartbeatToken.
export const heartbeat = httpAction(async (ctx, req) => {
  const operatorId = await authenticateOperator(ctx, req);
  if (!operatorId) {
    return new Response("invalid token", { status: 401 });
  }

  await ctx.runMutation(internal.operators.mutations.markHeartbeat, {
    operatorId,
  });

  return new Response(null, { status: 200 });
});

// POST /operators/workloads/upsert — the reconciler calls this after every
// spec-changing reconcile of a Workload CR, keeping Convex's ownership table
// in sync with the cluster automatically (including workloads created
// directly with kubectl, bypassing Convex's own deploy action entirely).
export const upsertWorkload = httpAction(async (ctx, req) => {
  const operatorId = await authenticateOperator(ctx, req);
  if (!operatorId) {
    return new Response("invalid token", { status: 401 });
  }

  const body = await req.json();
  const { name, namespace, templateId, userId, subdomain } = body ?? {};
  if (
    typeof name !== "string" ||
    typeof namespace !== "string" ||
    typeof templateId !== "string" ||
    typeof userId !== "string"
  ) {
    return new Response(
      "name, namespace, templateId, and userId are required",
      { status: 400 }
    );
  }

  await ctx.runMutation(internal.workloads.mutations.record, {
    name,
    namespace,
    operatorId,
    subdomain: typeof subdomain === "string" ? subdomain : undefined,
    templateId,
    userId,
  });

  return new Response(null, { status: 200 });
});

// POST /operators/workloads/remove — the reconciler calls this when it
// observes a Workload CR is gone (deleted via Convex's delete flow, or
// directly with kubectl).
export const removeWorkload = httpAction(async (ctx, req) => {
  const operatorId = await authenticateOperator(ctx, req);
  if (!operatorId) {
    return new Response("invalid token", { status: 401 });
  }

  const body = await req.json();
  const { name, namespace } = body ?? {};
  if (typeof name !== "string" || typeof namespace !== "string") {
    return new Response("name and namespace are required", { status: 400 });
  }

  await ctx.runMutation(internal.workloads.mutations.removeByOperatorAndName, {
    name,
    operatorId,
  });

  return new Response(null, { status: 200 });
});

// POST /operators/gateway/verify — the operator calls this after receiving a
// one-time token on its /gw/* route, exchanging it for the userId it was
// minted for. Convex is the only party that can enforce true single-use (it
// holds the state), so the operator always defers here instead of verifying
// anything about the token itself locally — see
// ai-cloud-operator's requireGatewayToken for what it does with the result
// (mints its own session cookie, entirely local from then on).
export const verifyGatewayToken = httpAction(async (ctx, req) => {
  const operatorId = await authenticateOperator(ctx, req);
  if (!operatorId) {
    return new Response("invalid token", { status: 401 });
  }

  const body = await req.json();
  const { token, namespace, name } = body ?? {};
  if (
    typeof token !== "string" ||
    typeof namespace !== "string" ||
    typeof name !== "string"
  ) {
    return new Response("token, namespace, and name are required", {
      status: 400,
    });
  }

  const result = await ctx.runMutation(internal.gateway.mutations.consume, {
    name,
    namespace,
    tokenHash: await hashToken(token),
  });
  if (!result) {
    return new Response("invalid or expired token", { status: 401 });
  }

  return new Response(JSON.stringify({ userId: result.userId }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
