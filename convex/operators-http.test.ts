import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { hashToken } from "./operators/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  {
    enrollmentTokenHash,
    heartbeatTokenHash,
    tags,
  }: {
    enrollmentTokenHash?: string;
    heartbeatTokenHash?: string;
    tags?: string[];
  }
) =>
  await t.run((ctx) =>
    ctx.db.insert("operators", {
      enrollmentTokenHash,
      healthStatus: "pending",
      heartbeatTokenHash,
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags,
    })
  );

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
  await seedOperator(t, { heartbeatTokenHash: await hashToken("hb-token") });
  await t.run(async (ctx) =>
    ctx.db.insert("gatewayTokens", {
      expiresAt: Date.now() + 60_000,
      name: "my-workload",
      namespace: "default",
      tokenHash: await hashToken("gw-token"),
      userId: "user_123",
    })
  );

  const res = await t.fetch("/operators/gateway/verify", {
    body: JSON.stringify({
      name: "my-workload",
      namespace: "default",
      token: "gw-token",
    }),
    headers: {
      Authorization: "Bearer hb-token",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ userId: "user_123" });
});
