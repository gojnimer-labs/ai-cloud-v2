import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { authComponent, createAuth } from "../auth";
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
  // The apps.aicloud.dev/workload-id label's value, read off the CR by the
  // reconciler — only present for CRs created via the claim flow. See
  // workloads/mutations.ts#record for what this unlocks (direct-by-_id
  // lookup instead of the legacy (operatorId, name) fallback).
  workloadId: z.string().optional(),
});

const removeWorkloadSchema = z.object({
  name: z.string(),
  namespace: z.string(),
});

const claimWorkloadSchema = z.object({ workloadId: z.string() });

const lifecycleSchema = z.object({
  name: z.string().optional(),
  phase: z.enum(["active", "failed", "stopped"]),
  reason: z.string().optional(),
  workloadId: z.string().optional(),
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
  // Piggybacks every lifecycle operation's claim-discovery on this one
  // periodic call: after recording the heartbeat (and getting the
  // operator's own tags back from it), returns both newly-claimable create
  // requests matching those tags and any pending destroy/redeploy/stop/
  // resume operations already assigned to this operator. Breaking
  // response-shape change from the previous empty 200 body — lands together
  // with the Go client (Part B).
  app.post("/operators/heartbeat", requireOperator, async (c) => {
    const operatorId = c.get("operatorId");
    const { tags } = await c.env.runMutation(
      internal.operators.mutations.markHeartbeat,
      { operatorId }
    );
    const claimable = await c.env.runQuery(
      internal.workloads.queries.listClaimable,
      { operatorTags: tags }
    );
    const pendingOperations = await c.env.runQuery(
      internal.workloads.queries.listPendingOperations,
      { operatorId }
    );
    return c.json({ claimable, pendingOperations });
  });

  // POST /operators/workloads/claim — create-only claim of a workload
  // listClaimable surfaced on this operator's last heartbeat. 409 (not 404)
  // on a lost race or a tag mismatch since the heartbeat snapshot — the
  // operator's client treats either the same way (skip, try again next
  // heartbeat).
  app.post(
    "/operators/workloads/claim",
    requireOperator,
    zValidator("json", claimWorkloadSchema),
    async (c) => {
      const { workloadId } = c.req.valid("json");
      const claimed = await c.env.runMutation(
        internal.workloads.mutations.claim,
        {
          operatorId: c.get("operatorId"),
          workloadId: workloadId as Id<"workloads">,
        }
      );
      if (!claimed) {
        return c.text("workload not claimable", 409);
      }
      return c.json(claimed);
    }
  );

  // POST /operators/workloads/claim-operation — claim of a pending
  // destroy/redeploy/stop/resume operation listPendingOperations surfaced
  // for this operator. Same 409-on-race semantics as claim above.
  app.post(
    "/operators/workloads/claim-operation",
    requireOperator,
    zValidator("json", claimWorkloadSchema),
    async (c) => {
      const { workloadId } = c.req.valid("json");
      const claimed = await c.env.runMutation(
        internal.workloads.mutations.claimOperation,
        {
          operatorId: c.get("operatorId"),
          workloadId: workloadId as Id<"workloads">,
        }
      );
      if (!claimed) {
        return c.text("operation not claimable", 409);
      }
      return c.json(claimed);
    }
  );

  // POST /operators/workloads/lifecycle — reports a create, redeploy, stop,
  // or resume attempt reaching an outcome (active/failed/stopped).
  //
  // Distinguishes the mutation's outcome instead of always returning 200 —
  // see reportLifecycle's own comment for why: "unmatched" (no Convex row
  // for this operator at all, e.g. a manual/legacy CR) is a legitimate,
  // permanent no-op and stays 200, since it'll recur on every reconcile of
  // that CR forever and must never look like something worth retrying.
  // "stale" (this operator DOES own a matching row, but it isn't in an
  // in-flight status right now) is the suspicious case and gets a 409 —
  // the Go client already retries on any non-200 (see
  // syncConvexLifecyclePhase's RequeueAfter-on-failure), this just makes
  // that existing retry path actually reachable instead of the call always
  // silently reporting success.
  app.post(
    "/operators/workloads/lifecycle",
    requireOperator,
    zValidator("json", lifecycleSchema),
    async (c) => {
      const { name, phase, reason, workloadId } = c.req.valid("json");
      const result = await c.env.runMutation(
        internal.workloads.mutations.reportLifecycle,
        {
          name,
          operatorId: c.get("operatorId"),
          phase,
          reason,
          workloadId: workloadId ? (workloadId as Id<"workloads">) : undefined,
        }
      );
      if (result === "stale") {
        return c.text("workload not in an in-flight status", 409);
      }
      return c.body(null, 200);
    }
  );

  // POST /operators/workloads/upsert — the reconciler calls this after every
  // spec-changing reconcile of a Workload CR, keeping Convex's ownership table
  // in sync with the cluster automatically (including workloads created
  // directly with kubectl, bypassing Convex's own request/claim flow
  // entirely). Now optionally carries `workloadId` (the label value) for the
  // direct-by-_id lookup path — see workloads/mutations.ts#record.
  app.post(
    "/operators/workloads/upsert",
    requireOperator,
    zValidator("json", upsertWorkloadSchema),
    async (c) => {
      const { name, namespace, subdomain, templateId, userId, workloadId } =
        c.req.valid("json");

      await c.env.runMutation(internal.workloads.mutations.record, {
        name,
        namespace,
        operatorId: c.get("operatorId"),
        subdomain,
        templateId,
        userId,
        workloadId: workloadId ? (workloadId as Id<"workloads">) : undefined,
      });

      return c.body(null, 200);
    }
  );

  // POST /operators/workloads/remove — the reconciler calls this when it
  // observes a Workload CR is gone (via a claimed destroy operation, or a
  // CR deleted directly with kubectl). Now a soft-delete (reportDestroyed
  // patches status: "destroyed" — the row survives for history/audit)
  // rather than removing the row outright.
  app.post(
    "/operators/workloads/remove",
    requireOperator,
    zValidator("json", removeWorkloadSchema),
    async (c) => {
      // namespace is required by the schema above (matching the wire
      // contract ai-cloud-operator already sends) but unused here —
      // reportDestroyed only needs name + operatorId.
      const { name } = c.req.valid("json");

      await c.env.runMutation(internal.workloads.mutations.reportDestroyed, {
        name,
        operatorId: c.get("operatorId"),
      });

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
  //
  // better-auth's one-time-token plugin (see convex/auth.ts) only proves
  // identity — it has no notion of "this workload" — so ownership/active
  // status is re-checked here at consume time, against the operator whose
  // own heartbeatToken (requireOperator, above) is presenting this call.
  //
  // Dispatches through auth.handler(request) — the same function
  // registerRoutes (convex/http.ts) uses to serve every /api/auth/* route —
  // rather than auth.api.verifyOneTimeToken(...): the crossDomain plugin
  // (also enabled, for normal user login) registers its own endpoint
  // literally named "verifyOneTimeToken" for an unrelated purpose
  // (continuing an OAuth/magic-link redirect across domains), which
  // collides with this plugin's same-named entry on the merged `auth.api`
  // object. The two endpoints live at different paths, so dispatching by
  // path (as a real HTTP request would) is unambiguous where the merged
  // `.api` accessor isn't.
  app.post(
    "/operators/gateway/verify",
    requireOperator,
    zValidator("json", verifyGatewayTokenSchema),
    async (c) => {
      const { name, namespace, token } = c.req.valid("json");

      const { auth } = await authComponent.getAuth(createAuth, c.env);
      // auth.handler dispatches purely by path, so the origin below is a
      // placeholder when CONVEX_SITE_URL isn't set (e.g. in tests) — no real
      // network call happens, this is the same in-process dispatch
      // registerRoutes (convex/http.ts) uses for every /api/auth/* request.
      const verifyResponse = await auth.handler(
        new Request(
          `${process.env.CONVEX_SITE_URL ?? "http://localhost"}/api/auth/one-time-token/verify`,
          {
            body: JSON.stringify({ token }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        )
      );
      if (!verifyResponse.ok) {
        return c.text("invalid or expired token", 401);
      }
      const result = (await verifyResponse.json()) as { user: { id: string } };

      const row = await c.env.runQuery(
        internal.workloads.queries.getActiveForOperator,
        {
          name,
          namespace,
          operatorId: c.get("operatorId"),
          userId: result.user.id,
        }
      );
      if (!row) {
        return c.text("invalid or expired token", 401);
      }

      return c.json({ userId: result.user.id });
    }
  );
};
