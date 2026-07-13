import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { generateToken, hashToken } from "./crypto";

const BEARER_PREFIX = "Bearer ";

// POST /operators/register — one-time enrollment. Validates the pre-shared
// enrollment secret, mints a fresh (heartbeatToken, deployToken) pair, and
// returns them once. Convex never persists the raw heartbeatToken (only its
// hash); deployToken is stored raw since Convex is the one who must present
// it later when calling the operator's own API. See convex/schema.ts for why
// two tokens exist instead of one.
export const register = httpAction(async (ctx, req) => {
  const body = await req.json();
  const { name, externalUrl, enrollmentSecret, metadata } = body ?? {};

  if (
    typeof name !== "string" ||
    typeof externalUrl !== "string" ||
    typeof enrollmentSecret !== "string"
  ) {
    return new Response(
      "name, externalUrl, and enrollmentSecret are required",
      {
        status: 400,
      }
    );
  }

  const expectedSecret = process.env.ENROLLMENT_SECRET;
  if (!expectedSecret || enrollmentSecret !== expectedSecret) {
    return new Response("invalid enrollment secret", { status: 401 });
  }

  const heartbeatToken = generateToken();
  const deployToken = generateToken();
  const heartbeatTokenHash = await hashToken(heartbeatToken);

  await ctx.runMutation(internal.operators.mutations.upsert, {
    deployToken,
    externalUrl,
    heartbeatTokenHash,
    metadata,
    name,
  });

  return new Response(JSON.stringify({ deployToken, heartbeatToken }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});

// POST /operators/heartbeat — presented with the operator's heartbeatToken.
// A 401 here is the operator's signal (see ai-cloud-operator's convexclient
// package) to discard its stored token and re-register from scratch.
export const heartbeat = httpAction(async (ctx, req) => {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith(BEARER_PREFIX)) {
    return new Response("missing bearer token", { status: 401 });
  }
  const heartbeatToken = auth.slice(BEARER_PREFIX.length);
  const heartbeatTokenHash = await hashToken(heartbeatToken);

  const operator = await ctx.runQuery(
    internal.operators.queries.getByHeartbeatTokenHash,
    { heartbeatTokenHash }
  );
  if (!operator) {
    return new Response("invalid token", { status: 401 });
  }

  await ctx.runMutation(internal.operators.mutations.markHeartbeat, {
    operatorId: operator._id,
  });

  return new Response(null, { status: 200 });
});
