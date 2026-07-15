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
  }: {
    enrollmentTokenHash?: string;
    heartbeatTokenHash?: string;
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
    { name: "my-workload", userId: "user_123" },
  ]);
});

test("workloads/remove: removes the workload on success", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    heartbeatTokenHash: await hashToken("hb-token"),
  });
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      name: "my-workload",
      namespace: "default",
      operatorId,
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
  expect(workloads).toHaveLength(0);
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
