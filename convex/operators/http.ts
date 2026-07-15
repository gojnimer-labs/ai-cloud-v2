import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { generateToken, hashToken } from "./crypto";

const BEARER_PREFIX = "Bearer ";

// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay a type alias: HonoWithConvex's Variables generic requires T extends Record<string, unknown>, which an interface doesn't structurally satisfy.
export type OperatorVariables = {
  operatorId: Id<"operators">;
};

export interface OperatorEnv {
  Bindings: { [K in keyof ActionCtx]: ActionCtx[K] };
  Variables: OperatorVariables;
}

type OperatorApp = Hono<OperatorEnv>;

const registerSchema = z.object({
  enrollmentSecret: z.string(),
  externalUrl: z.string(),
  metadata: z.unknown().optional(),
});

const upsertWorkloadSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  subdomain: z.string().optional(),
  templateId: z.string(),
  userId: z.string(),
});

const removeWorkloadSchema = z.object({
  name: z.string(),
  namespace: z.string(),
});

const verifyGatewayTokenSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  token: z.string(),
});

// Shared by every operator-authenticated route (heartbeat, workload
// lifecycle callbacks, gateway verify): verifies the presented
// heartbeatToken and sets the calling operator's _id on the Hono context, or
// short-circuits with 401 if missing/invalid. A 401 here is the operator's
// signal (see ai-cloud-operator's convexclient package) to discard its
// stored token and re-register from scratch.
const requireOperator = createMiddleware<OperatorEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith(BEARER_PREFIX)) {
    return c.text("invalid token", 401);
  }
  const heartbeatTokenHash = await hashToken(auth.slice(BEARER_PREFIX.length));

  const operator = await c.env.runQuery(
    internal.operators.queries.getByHeartbeatTokenHash,
    { heartbeatTokenHash }
  );
  if (!operator) {
    return c.text("invalid token", 401);
  }
  c.set("operatorId", operator._id);
  return next();
});

// Registers all 5 ai-cloud-operator HTTP endpoints on `app`. Called once
// from convex/http.ts.
export const registerOperatorRoutes = (app: OperatorApp): void => {
  // POST /operators/register — claims a cluster row an admin pre-created,
  // mints a fresh (heartbeatToken, deployToken) pair, and returns them once.
  // `name` is intentionally never read from the body: the cluster's identity
  // is fixed at admin-creation time, and trusting a caller-supplied name here
  // was the actual gap in the old single-shared-secret design (anyone holding
  // the secret could claim or rename any cluster). Convex never persists the
  // raw heartbeatToken (only its hash); deployToken is stored raw since Convex
  // is the one who must present it later when calling the operator's own API.
  // See convex/schema.ts for why two tokens exist instead of one.
  app.post(
    "/operators/register",
    zValidator("json", registerSchema),
    async (c) => {
      const { enrollmentSecret, externalUrl, metadata } = c.req.valid("json");

      const heartbeatToken = generateToken();
      const deployToken = generateToken();
      const heartbeatTokenHash = await hashToken(heartbeatToken);
      const enrollmentTokenHash = await hashToken(enrollmentSecret);

      const claimed = await c.env.runMutation(
        internal.operators.mutations.claim,
        {
          deployToken,
          enrollmentTokenHash,
          externalUrl,
          heartbeatTokenHash,
          metadata,
        }
      );
      if (!claimed) {
        return c.text("invalid enrollment secret", 401);
      }

      return c.json({ deployToken, heartbeatToken });
    }
  );

  // POST /operators/heartbeat — presented with the operator's heartbeatToken.
  app.post("/operators/heartbeat", requireOperator, async (c) => {
    await c.env.runMutation(internal.operators.mutations.markHeartbeat, {
      operatorId: c.get("operatorId"),
    });
    return c.body(null, 200);
  });

  // POST /operators/workloads/upsert — the reconciler calls this after every
  // spec-changing reconcile of a Workload CR, keeping Convex's ownership table
  // in sync with the cluster automatically (including workloads created
  // directly with kubectl, bypassing Convex's own deploy action entirely).
  app.post(
    "/operators/workloads/upsert",
    requireOperator,
    zValidator("json", upsertWorkloadSchema),
    async (c) => {
      const { name, namespace, subdomain, templateId, userId } =
        c.req.valid("json");

      await c.env.runMutation(internal.workloads.mutations.record, {
        name,
        namespace,
        operatorId: c.get("operatorId"),
        subdomain,
        templateId,
        userId,
      });

      return c.body(null, 200);
    }
  );

  // POST /operators/workloads/remove — the reconciler calls this when it
  // observes a Workload CR is gone (deleted via Convex's delete flow, or
  // directly with kubectl).
  app.post(
    "/operators/workloads/remove",
    requireOperator,
    zValidator("json", removeWorkloadSchema),
    async (c) => {
      // namespace is required by the schema above (matching the wire
      // contract ai-cloud-operator already sends) but unused here —
      // removeByOperatorAndName only needs name + operatorId.
      const { name } = c.req.valid("json");

      await c.env.runMutation(
        internal.workloads.mutations.removeByOperatorAndName,
        { name, operatorId: c.get("operatorId") }
      );

      return c.body(null, 200);
    }
  );

  // POST /operators/gateway/verify — the operator calls this after receiving a
  // one-time token on its /gw/* route, exchanging it for the userId it was
  // minted for. Convex is the only party that can enforce true single-use (it
  // holds the state), so the operator always defers here instead of verifying
  // anything about the token itself locally — see
  // ai-cloud-operator's requireGatewayToken for what it does with the result
  // (mints its own session cookie, entirely local from then on).
  app.post(
    "/operators/gateway/verify",
    requireOperator,
    zValidator("json", verifyGatewayTokenSchema),
    async (c) => {
      const { name, namespace, token } = c.req.valid("json");

      const result = await c.env.runMutation(
        internal.gateway.mutations.consume,
        { name, namespace, tokenHash: await hashToken(token) }
      );
      if (!result) {
        return c.text("invalid or expired token", 401);
      }

      return c.json({ userId: result.userId });
    }
  );
};
