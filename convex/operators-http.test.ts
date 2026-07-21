import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { authComponent, createAuthOptions } from "./auth";
import authSchema from "./betterAuth/schema";
import { hashToken } from "./operators/crypto";
import type { CatalogTemplate } from "./operators/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const authModules = import.meta.glob("./betterAuth/**/*.ts");

// Registration is invite-gated (see convex/auth.ts's requireInvite plugin),
// so signing up requires a valid signed invite cookie first. Mints a real
// invite directly through the same adapter Better Auth itself uses (bypassing
// only invite *creation*'s HTTP route, which needs its own admin-session
// setup unrelated to what this test is about) and activates it through the
// real `/invite/activate` route to get a genuinely signed cookie, so the
// sign-up call below goes through the actual gate rather than around it.
const mintInviteCookie = async (t: ReturnType<typeof convexTest>) => {
  const token = crypto.randomUUID();
  await t.run(async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.create({
      data: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        infinityMaxUses: false,
        maxUses: 1,
        role: "user",
        shareInviterName: true,
        status: "pending",
        token,
      },
      model: "invite",
    });
  });

  const activateRes = await t.fetch("/api/auth/invite/activate", {
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return activateRes.headers.get("set-cookie") ?? "";
};

// Signs up a real better-auth user (registering the local betterAuth
// component so its own tables exist in this test's mock backend) and mints a
// real one-time token for that user via the real plugin HTTP routes —
// see convex/auth.ts's oneTimeToken plugin and convex/http.ts's
// authComponent.registerRoutes, both mounted on the same router t.fetch
// exercises here. This exercises the actual generate/verify code, not a
// stand-in for it.
const signUpAndMintGatewayToken = async (t: ReturnType<typeof convexTest>) => {
  t.registerComponent("betterAuth", authSchema, authModules);

  const inviteCookie = await mintInviteCookie(t);

  const signUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Test User",
      password: "password1234",
    }),
    headers: { "Content-Type": "application/json", Cookie: inviteCookie },
    method: "POST",
  });
  // better-invite's own `after` hook on `/sign-up/email` consumes the
  // invite and replaces the normal `{user, ...}` JSON body with a real
  // HTTP redirect once a valid invite cookie is present (see
  // node_modules/better-invite/dist/hooks.mjs) — the session cookie is
  // still set on this same response beforehand, so fetch the session
  // separately instead of reading `user` out of the sign-up response body.
  const cookie = signUpRes.headers.get("set-cookie") ?? "";
  const sessionRes = await t.fetch("/api/auth/get-session", {
    headers: { Cookie: cookie },
    method: "GET",
  });
  const { user } = (await sessionRes.json()) as { user: { id: string } };

  const genRes = await t.fetch("/api/auth/one-time-token/generate", {
    headers: { Cookie: cookie },
    method: "GET",
  });
  const { token } = (await genRes.json()) as { token: string };

  return { token, userId: user.id };
};

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  {
    catalog,
    enrollmentTokenHash,
    heartbeatTokenHash,
    tags,
  }: {
    catalog?: CatalogTemplate[];
    enrollmentTokenHash?: string;
    heartbeatTokenHash?: string;
    tags?: string[];
  }
) =>
  await t.run(async (ctx) => {
    const operatorId = await ctx.db.insert("operators", {
      catalog,
      enrollmentTokenHash,
      heartbeatTokenHash,
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags,
    });
    await ctx.db.insert("operatorHeartbeats", {
      healthStatus: "pending",
      operatorId,
    });
    return operatorId;
  });

// Plain JSON object (not a Convex value) — this is what an operator's real
// /operators/register request body would contain, exercised through
// t.fetch's actual HTTP/zod boundary rather than inserted directly via
// ctx.db.insert.
const catalogTemplateJson = (overrides: Partial<CatalogTemplate> = {}) => ({
  description: "Test template",
  entrypoints: [],
  icon: "🧪",
  id: "nginx",
  name: "Nginx",
  parameters: [],
  version: "v1",
  ...overrides,
});

test("register: rejects an invalid body with 400", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({ enrollmentSecret: "secret" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(400);
});

test("register: rejects an unknown enrollment secret with 401", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({
      enrollmentSecret: "wrong-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(401);
});

test("register: claims the operator and returns fresh tokens on success", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    enrollmentTokenHash: await hashToken("correct-secret"),
  });

  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({
      enrollmentSecret: "correct-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.deployToken).toBe("string");
  expect(typeof body.heartbeatToken).toBe("string");
});

test("register: persists a reported catalog with a fresh catalogReportedAt", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    enrollmentTokenHash: await hashToken("correct-secret"),
  });

  const before = Date.now();
  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({
      catalog: [catalogTemplateJson({ version: "v1" })],
      enrollmentSecret: "correct-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.catalog).toMatchObject([{ id: "nginx", version: "v1" }]);
  expect(operator?.catalogReportedAt).toBeGreaterThanOrEqual(before);
});

test("register: a second register call with a new catalog overwrites the stored one", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    enrollmentTokenHash: await hashToken("correct-secret"),
  });

  await t.fetch("/operators/register", {
    body: JSON.stringify({
      catalog: [catalogTemplateJson({ version: "v1" })],
      enrollmentSecret: "correct-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({
      catalog: [catalogTemplateJson({ version: "v2" })],
      enrollmentSecret: "correct-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.catalog).toMatchObject([{ id: "nginx", version: "v2" }]);
});

test("register: omitting catalog leaves a previously-reported one untouched", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    catalog: [catalogTemplateJson({ version: "v1" }) as CatalogTemplate],
    enrollmentTokenHash: await hashToken("correct-secret"),
  });

  const res = await t.fetch("/operators/register", {
    body: JSON.stringify({
      enrollmentSecret: "correct-secret",
      externalUrl: "https://operator.example.com",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.catalog).toMatchObject([{ id: "nginx", version: "v1" }]);
});

test("heartbeat: rejects a missing token with 401", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/operators/heartbeat", { method: "POST" });
  expect(res.status).toBe(401);
});

test("heartbeat: succeeds for a valid token", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });

  const res = await t.fetch("/operators/heartbeat", {
    headers: { Authorization: "Bearer hb-token" },
    method: "POST",
  });
  expect(res.status).toBe(200);
});

test("heartbeat: persists resourceCapacity with a fresh reportedAt", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });

  const before = Date.now();
  const res = await t.fetch("/operators/heartbeat", {
    body: JSON.stringify({
      resourceCapacity: {
        allocatableMemoryBytes: 8 * 1024 * 1024 * 1024,
        allocatableMilliCpu: 4000,
        usedMemoryBytes: 1024 * 1024 * 1024,
        usedMilliCpu: 1000,
      },
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const heartbeat = await t.run((ctx) =>
    ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique()
  );
  expect(heartbeat?.resourceCapacity).toMatchObject({
    allocatableMilliCpu: 4000,
    usedMilliCpu: 1000,
  });
  expect(heartbeat?.resourceCapacity?.reportedAt).toBeGreaterThanOrEqual(
    before
  );
});

test("heartbeat: omitted resourceCapacity leaves the previous value untouched", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  await t.run(async (ctx) => {
    const heartbeat = await ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique();
    if (heartbeat) {
      await ctx.db.patch(heartbeat._id, {
        resourceCapacity: {
          allocatableMemoryBytes: 1,
          allocatableMilliCpu: 1,
          reportedAt: 1,
          usedMemoryBytes: 1,
          usedMilliCpu: 1,
        },
      });
    }
  });

  const res = await t.fetch("/operators/heartbeat", {
    headers: { Authorization: "Bearer hb-token" },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const heartbeat = await t.run((ctx) =>
    ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique()
  );
  expect(heartbeat?.resourceCapacity).toMatchObject({
    allocatableMilliCpu: 1,
    reportedAt: 1,
  });
});

test("heartbeat: returns claimable requests and pending operations matching the operator's tags", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
    tags: ["gpu"],
  });
  const claimableId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: ["gpu"],
      displayName: "my-app",
      status: "requested",
      templateId: "nginx",
      userId: "user_123",
    })
  );
  const pendingId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "existing-app",
      name: "existing-cr",
      namespace: "default",
      operatorId,
      status: "requested_destroy",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/heartbeat", {
    headers: { Authorization: "Bearer hb-token" },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.claimable).toMatchObject([
    { templateId: "nginx", workloadId: claimableId },
  ]);
  expect(body.pendingOperations).toMatchObject([
    { operation: "destroy", workloadId: pendingId },
  ]);
});

test("heartbeat: claimable excludes a tag-matching request whose templateVersion isn't in this operator's catalog", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplateJson({ id: "nginx", version: "v2" })],
    heartbeatTokenHash: await hashToken("hb-token"),
    tags: ["gpu"],
  });
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: ["gpu"],
      displayName: "wrong-version",
      status: "requested",
      templateId: "nginx",
      templateVersion: "v1",
      userId: "user_123",
    })
  );
  const matchingId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: ["gpu"],
      displayName: "right-version",
      status: "requested",
      templateId: "nginx",
      templateVersion: "v2",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/heartbeat", {
    headers: { Authorization: "Bearer hb-token" },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.claimable).toMatchObject([
    { templateId: "nginx", workloadId: matchingId },
  ]);
});

test("workloads/claim: claims a requested workload", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
    tags: ["gpu"],
  });
  const workloadId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      config: { foo: "bar" },
      createdAt: Date.now(),
      desiredOperatorTags: ["gpu"],
      displayName: "my-app",
      status: "requested",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/claim", {
    body: JSON.stringify({ workloadId }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ templateId: "nginx", userId: "user_123" });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ operatorId, status: "provisioning" });
});

test("workloads/claim: 409s on a lost race", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });
  // status "active": already claimed/provisioned by someone else.
  const workloadId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      status: "active",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/claim", {
    body: JSON.stringify({ workloadId }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(409);
});

test("workloads/claim-operation: claims a pending destroy", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const workloadId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-app-xyz",
      namespace: "default",
      operatorId,
      status: "requested_destroy",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/claim-operation", {
    body: JSON.stringify({ workloadId }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ name: "my-app-xyz", operation: "destroy" });
});

test("workloads/lifecycle: transitions provisioning to active", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const workloadId = await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-app-xyz",
      operatorId,
      status: "provisioning",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/lifecycle", {
    body: JSON.stringify({ name: "my-app-xyz", phase: "active" }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

// Regression test: a workload genuinely observed stuck on "resuming"
// forever in production, because this route used to always return 200 even
// when reportLifecycle silently no-op'd — the operator's retry-on-failure
// path (see workload_controller.go's syncConvexLifecyclePhase) never had a
// reason to fire. This asserts the fix: a "stale" report (this operator's
// row exists but isn't in-flight right now) is now a retriable 409, not a
// silent 200.
test("workloads/lifecycle: 409s (not 200) when the row isn't in-flight for this operator", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-app-xyz",
      operatorId,
      status: "active",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/lifecycle", {
    body: JSON.stringify({ name: "my-app-xyz", phase: "active" }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(409);
});

// A manual/legacy CR with no Convex row at all must stay a plain 200 —
// this recurs on every reconcile of that CR forever, so it must never look
// like something worth retrying (unlike the "stale" case above, which only
// happens for a row this operator genuinely owns).
test("workloads/lifecycle: still 200s when there's no matching row at all", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });

  const res = await t.fetch("/operators/workloads/lifecycle", {
    body: JSON.stringify({ name: "no-such-cr", phase: "active" }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
});

test("workloads/upsert: rejects an invalid body with 400", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });

  const res = await t.fetch("/operators/workloads/upsert", {
    body: JSON.stringify({ name: "my-workload" }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(400);
});

test("workloads/upsert: rejects an invalid token with 401", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/operators/workloads/upsert", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      templateId: "nginx",
      userId: "user_123",
    }),
    headers: {
      Authorization: "Bearer invalid",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(401);
});

test("workloads/upsert: records the workload on success", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });

  const res = await t.fetch("/operators/workloads/upsert", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      templateId: "nginx",
      userId: "user_123",
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const workloads = await t.run((ctx) => ctx.db.query("workloads").collect());
  expect(workloads).toMatchObject([
    { name: "my-workload", status: "active", userId: "user_123" },
  ]);
});

// Was "removes the workload on success" — reportDestroyed is now a
// soft-delete (see workloads/mutations.ts), so this asserts the row
// survives with status: "destroyed" rather than disappearing.
test("workloads/remove: soft-deletes the workload on success", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-workload",
      name: "my-workload",
      namespace: "default",
      operatorId,
      status: "active",
      templateId: "nginx",
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/workloads/remove", {
    body: JSON.stringify({ name: "my-workload", namespace: "default" }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);

  const workloads = await t.run((ctx) => ctx.db.query("workloads").collect());
  expect(workloads).toMatchObject([
    { name: "my-workload", status: "destroyed" },
  ]);
});

test("gateway/verify: rejects an unknown token with 401", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });

  const res = await t.fetch("/operators/gateway/verify", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      token: "unknown-token",
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(401);
});

test("gateway/verify: exchanges a valid one-time token for a userId", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const { token, userId } = await signUpAndMintGatewayToken(t);
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-workload",
      namespace: "default",
      operatorId,
      status: "active",
      templateId: "nginx",
      userId,
    })
  );

  const res = await t.fetch("/operators/gateway/verify", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      token,
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ userId });
});

// Proves single-use is still enforced after createAuth(ctx) replaced
// authComponent.getAuth(createAuth, ctx) for this route (see the ctx.auth
// comment above) — that change only affected how the auth instance is
// constructed, not what auth.handler() does with the request. Consumption
// happens inside better-auth's own verifyOneTimeToken endpoint
// (internalAdapter.consumeVerificationValue, which deletes the row in a
// transaction), independent of that.
test("gateway/verify: rejects a replayed token on the second use", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const { token, userId } = await signUpAndMintGatewayToken(t);
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-workload",
      namespace: "default",
      operatorId,
      status: "active",
      templateId: "nginx",
      userId,
    })
  );

  const verify = () =>
    t.fetch("/operators/gateway/verify", {
      body: JSON.stringify({
        name: "my-workload",
        namespace: "default",
        token,
      }),
      headers: {
        Authorization: "Bearer hb-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

  const first = await verify();
  expect(first.status).toBe(200);

  const second = await verify();
  expect(second.status).toBe(401);
});

test("gateway/verify: rejects a valid token when the workload isn't owned by that user", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const { token } = await signUpAndMintGatewayToken(t);
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-workload",
      namespace: "default",
      operatorId,
      status: "active",
      templateId: "nginx",
      userId: "someone-else",
    })
  );

  const res = await t.fetch("/operators/gateway/verify", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      token,
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(401);
});

test("gateway/verify: rejects a valid token when the workload isn't active", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  const { token, userId } = await signUpAndMintGatewayToken(t);
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-workload",
      namespace: "default",
      operatorId,
      status: "stopped",
      templateId: "nginx",
      userId,
    })
  );

  const res = await t.fetch("/operators/gateway/verify", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      token,
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(401);
});
