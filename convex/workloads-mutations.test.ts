/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  overrides: {
    healthStatus?: "pending" | "healthy" | "offline" | "ready_to_destroy";
    tags?: string[];
  } = {}
): Promise<Id<"operators">> =>
  await t.run((ctx) =>
    ctx.db.insert("operators", {
      deployToken: "deploy-token",
      externalUrl: "https://operator.example.com",
      healthStatus: overrides.healthStatus ?? "healthy",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: overrides.tags,
    })
  );

const seedWorkload = async (
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    claimAttempts: {
      claimedAt: number;
      operatorId: Id<"operators">;
      times: number;
    }[];
    desiredOperatorTags: string[];
    displayName: string;
    failureReason: string;
    leaseExpiresAt: number;
    name: string;
    namespace: string;
    operatorId: Id<"operators">;
    status:
      | "requested"
      | "provisioning"
      | "active"
      | "requested_destroy"
      | "destroying"
      | "requested_redeploy"
      | "redeploying"
      | "requested_stop"
      | "stopping"
      | "stopped"
      | "requested_resume"
      | "resuming"
      | "failed"
      | "destroyed";
    templateId: string;
    userId: string;
  }> = {}
): Promise<Id<"workloads">> =>
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      claimAttempts: overrides.claimAttempts,
      createdAt: Date.now(),
      desiredOperatorTags: overrides.desiredOperatorTags ?? [],
      displayName: overrides.displayName ?? "my-workload",
      failureReason: overrides.failureReason,
      leaseExpiresAt: overrides.leaseExpiresAt,
      name: overrides.name,
      namespace: overrides.namespace,
      operatorId: overrides.operatorId,
      status: overrides.status ?? "requested",
      templateId: overrides.templateId ?? "nginx",
      userId: overrides.userId ?? "user_123",
    })
  );

// --- requestCreate ---------------------------------------------------

test("requestCreate: inserts a requested row with no operator yet", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await t.mutation(
    internal.workloads.mutations.requestCreate,
    {
      config: { foo: "bar" },
      desiredOperatorTags: ["gpu"],
      displayName: "my-app",
      templateId: "nginx",
      templateVersion: "1.0.0",
      userId: "user_123",
    }
  );
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ displayName: "my-app", status: "requested" });
  expect(row).not.toHaveProperty("operatorId");
});

test("requestCreate: rejects a duplicate displayName for the same user", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.workloads.mutations.requestCreate, {
    config: {},
    desiredOperatorTags: [],
    displayName: "dup-name",
    templateId: "nginx",
    templateVersion: "1.0.0",
    userId: "user_123",
  });
  await expect(
    t.mutation(internal.workloads.mutations.requestCreate, {
      config: {},
      desiredOperatorTags: [],
      displayName: "dup-name",
      templateId: "nginx",
      templateVersion: "1.0.0",
      userId: "user_123",
    })
  ).rejects.toThrow(/already have a workload named/u);
});

test("requestCreate: generates a displayName when left blank", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await t.mutation(
    internal.workloads.mutations.requestCreate,
    {
      config: {},
      desiredOperatorTags: [],
      templateId: "nginx",
      templateVersion: "1.0.0",
      userId: "user_123",
    }
  );
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.displayName).toMatch(/^nginx-/u);
});

// --- claim -------------------------------------------------------------

test("claim: happy path assigns operatorId, provisions, but sets no name", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["gpu", "east"] });
  const workloadId = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(claimed).toMatchObject({ workloadId });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ operatorId, status: "provisioning" });
  expect(row).not.toHaveProperty("name");
});

test("claim: returns null on a double-claim race", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["gpu"] });
  const workloadId = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });

  const first = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(first).not.toBeNull();

  const second = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(second).toBeNull();
});

test("claim: returns null when the operator's tags no longer match", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["east"] });
  const workloadId = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(claimed).toBeNull();
});

test("claim: sets a leaseExpiresAt in the future on success", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["gpu"] });
  const workloadId = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });

  const before = Date.now();
  await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.leaseExpiresAt).toBeGreaterThan(before);
  // claimAttempts is untouched by a successful claim — only releaseClaim
  // ever writes to it.
  expect(row?.claimAttempts).toBeUndefined();
});

test("claim: refuses and finalizes to failed once claimAttempts is already exhausted", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["gpu"] });
  const workloadId = await seedWorkload(t, {
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 5 }],
    desiredOperatorTags: ["gpu"],
  });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(claimed).toBeNull();

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "exceeded 5 claim attempts (create)",
    status: "failed",
  });
});

test("claim: exhaustion is checked against the TOTAL across operators, not a per-operator count", async () => {
  const t = convexTest(schema, modules);
  const operatorA = await seedOperator(t, { tags: ["gpu"] });
  const operatorB = await seedOperator(t, { tags: ["gpu"] });
  // Neither operator individually has 5 attempts, but the fleet-wide total
  // does — a fresh operator inheriting an already-exhausted ledger should
  // still be refused, not get its own private budget.
  const workloadId = await seedWorkload(t, {
    claimAttempts: [
      { claimedAt: Date.now(), operatorId: operatorA, times: 3 },
      { claimedAt: Date.now(), operatorId: operatorB, times: 2 },
    ],
    desiredOperatorTags: ["gpu"],
  });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId: operatorB,
    workloadId,
  });
  expect(claimed).toBeNull();
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("failed");
});

// --- record --------------------------------------------------------------

test("record: direct-by-workloadId lookup patches name/namespace", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    operatorId,
    status: "provisioning",
  });

  const returnedId = await t.mutation(internal.workloads.mutations.record, {
    name: "generated-name-abc123",
    namespace: "default",
    operatorId,
    subdomain: "my-app",
    templateId: "nginx",
    userId: "user_123",
    workloadId,
  });
  expect(returnedId).toBe(workloadId);

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    name: "generated-name-abc123",
    namespace: "default",
    subdomain: "my-app",
  });
});

test("record: falls back to (operatorId, name) for a legacy CR with no label", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);

  // No prior row at all — a manual kubectl-created CR.
  const insertedId = await t.mutation(internal.workloads.mutations.record, {
    name: "manual-cr",
    namespace: "default",
    operatorId,
    templateId: "nginx",
    userId: "user_123",
  });
  const inserted = await t.run((ctx) => ctx.db.get(insertedId));
  expect(inserted).toMatchObject({
    displayName: "manual-cr",
    name: "manual-cr",
    status: "active",
  });

  // A second upsert for the same (operatorId, name) updates in place rather
  // than inserting again.
  const updatedId = await t.mutation(internal.workloads.mutations.record, {
    name: "manual-cr",
    namespace: "default",
    operatorId,
    subdomain: "sub",
    templateId: "nginx",
    userId: "user_123",
  });
  expect(updatedId).toBe(insertedId);
  const all = await t.run((ctx) => ctx.db.query("workloads").collect());
  expect(all).toHaveLength(1);
});

// --- applyDestroy / requestRedeploy / claimOperation --------------------

test("applyDestroy then claimOperation: happy path destroy", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.applyDestroy, {
    workloadId,
  });
  const requested = await t.run((ctx) => ctx.db.get(workloadId));
  expect(requested?.status).toBe("requested_destroy");

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    {
      operatorId,
      workloadId,
    }
  );
  expect(claimed).toMatchObject({
    name: "my-workload",
    namespace: "default",
    operation: "destroy",
  });

  const destroying = await t.run((ctx) => ctx.db.get(workloadId));
  expect(destroying?.status).toBe("destroying");
});

test("requestRedeploy then claimOperation: happy path redeploy", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.requestRedeploy, {
    config: { replicas: 2 },
    templateVersion: "2.0.0",
    workloadId,
  });
  const requested = await t.run((ctx) => ctx.db.get(workloadId));
  expect(requested?.status).toBe("requested_redeploy");

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    {
      operatorId,
      workloadId,
    }
  );
  expect(claimed).toMatchObject({
    config: { replicas: 2 },
    name: "my-workload",
    namespace: "default",
    operation: "redeploy",
    templateVersion: "2.0.0",
  });

  const redeploying = await t.run((ctx) => ctx.db.get(workloadId));
  expect(redeploying?.status).toBe("redeploying");
});

test("claimOperation: returns null on a double-claim race", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_destroy",
  });

  const first = await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  expect(first).not.toBeNull();

  const second = await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  expect(second).toBeNull();
});

test("claimOperation: returns null when operatorId doesn't match", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const otherOperatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_destroy",
  });

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    {
      operatorId: otherOperatorId,
      workloadId,
    }
  );
  expect(claimed).toBeNull();
});

test("applyDestroy: rejects a non-active row", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "requested" });
  await expect(
    t.mutation(internal.workloads.mutations.applyDestroy, { workloadId })
  ).rejects.toThrow(/Cannot destroy/u);
});

test("applyDestroy: re-requestable from a failed row that still has a name (abandoned destroy)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 5 }],
    failureReason:
      "destroy did not complete after 5 attempts; manual cleanup required",
    name: "my-workload",
    namespace: "default",
    status: "failed",
  });
  await t.mutation(internal.workloads.mutations.applyDestroy, {
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested_destroy");
  // Fresh operation instance — the old ledger shouldn't carry over and
  // silently start the new destroy attempt already "exhausted".
  expect(row?.claimAttempts).toBeUndefined();
});

test("applyDestroy: still direct-soft-deletes a failed row with no name (create never produced a CR)", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "failed" });
  await t.mutation(internal.workloads.mutations.applyDestroy, {
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("destroyed");
});

test("applyDestroy: also accepts a stopped row (destroy without resuming first)", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    status: "stopped",
  });
  await t.mutation(internal.workloads.mutations.applyDestroy, {
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested_destroy");
});

// --- applyStop / applyResume ------------------------------------------

test("applyStop: active -> requested_stop", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "active" });
  await t.mutation(internal.workloads.mutations.applyStop, { workloadId });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested_stop");
});

test("applyStop: rejects a non-active row", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "stopped" });
  await expect(
    t.mutation(internal.workloads.mutations.applyStop, { workloadId })
  ).rejects.toThrow(/Cannot stop/u);
});

test("applyResume: stopped -> requested_resume", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "stopped" });
  await t.mutation(internal.workloads.mutations.applyResume, {
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested_resume");
});

test("applyResume: rejects a non-stopped row", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "active" });
  await expect(
    t.mutation(internal.workloads.mutations.applyResume, { workloadId })
  ).rejects.toThrow(/Cannot resume/u);
});

// --- claimOperation: stop / resume ----------------------------------------

test("applyStop then claimOperation: happy path stop", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.applyStop, { workloadId });
  const requested = await t.run((ctx) => ctx.db.get(workloadId));
  expect(requested?.status).toBe("requested_stop");

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    { operatorId, workloadId }
  );
  expect(claimed).toMatchObject({
    name: "my-workload",
    namespace: "default",
    operation: "stop",
  });

  const stopping = await t.run((ctx) => ctx.db.get(workloadId));
  expect(stopping?.status).toBe("stopping");
});

test("applyResume then claimOperation: happy path resume", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "stopped",
  });

  await t.mutation(internal.workloads.mutations.applyResume, {
    workloadId,
  });
  const requested = await t.run((ctx) => ctx.db.get(workloadId));
  expect(requested?.status).toBe("requested_resume");

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    { operatorId, workloadId }
  );
  expect(claimed).toMatchObject({
    name: "my-workload",
    namespace: "default",
    operation: "resume",
  });

  const resuming = await t.run((ctx) => ctx.db.get(workloadId));
  expect(resuming?.status).toBe("resuming");
});

test("claimOperation: returns null on a stop/resume double-claim race", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_stop",
  });

  const first = await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  expect(first).not.toBeNull();

  const second = await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  expect(second).toBeNull();
});

// --- claimOperation: exhausted claimAttempts terminal fallback ------------

test("claimOperation: destroy falls to failed once exhausted (no safe resting state)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 5 }],
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_destroy",
  });

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    { operatorId, workloadId }
  );
  expect(claimed).toBeNull();
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "failed" });
  expect(row?.failureReason).toMatch(/manual cleanup required/u);
});

test("claimOperation: redeploy/stop fall back to active once exhausted (CR still alive)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 5 }],
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_redeploy",
  });

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    { operatorId, workloadId }
  );
  expect(claimed).toBeNull();
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

test("claimOperation: resume falls back to stopped once exhausted (still parked)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 5 }],
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_resume",
  });

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    { operatorId, workloadId }
  );
  expect(claimed).toBeNull();
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("stopped");
});

test("claimOperation: sets leaseExpiresAt on a normal (non-exhausted) claim", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "requested_stop",
  });

  const before = Date.now();
  await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.leaseExpiresAt).toBeGreaterThan(before);
});

// --- reportLifecycle -------------------------------------------------------

test("reportLifecycle: provisioning -> active", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "active",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

test("reportLifecycle: provisioning -> failed stays terminal when no CR exists yet", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  // No `name` — mirrors a Create() failure before any CR (and thus any k8s
  // name) exists, so the caller can only correlate via workloadId.
  const workloadId = await seedWorkload(t, {
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    operatorId,
    phase: "failed",
    reason: "image pull error",
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "image pull error",
    status: "failed",
  });
});

test("reportLifecycle: provisioning -> failed reverts to active when a CR already exists", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  // Has a `name` — the CR already exists (e.g. reconcile failed after the
  // create-time upsert already landed) — a live CR is the real source of
  // truth for health, so this shouldn't get hidden as terminal "failed".
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "image pull error",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "image pull error",
    status: "active",
  });
});

test("reportLifecycle: redeploying -> active", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "redeploying",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "active",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

test("reportLifecycle: redeploying -> failed reverts to active (CR still alive)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "redeploying",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "redeploy failed",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "redeploy failed",
    status: "active",
  });
});

// --- reportLifecycle: stopping / resuming (the new phase-resolution matrix) --

test("reportLifecycle: stopping -> active (phase active)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "stopping",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "active",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

test("reportLifecycle: stopping -> stopped (stop succeeded)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "stopping",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "stopped",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("stopped");
});

test("reportLifecycle: stopping -> failed reverts to active (stop attempt didn't take, still running)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "stopping",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "scale-down failed",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "scale-down failed",
    status: "active",
  });
});

test("reportLifecycle: resuming -> active (resume succeeded)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "resuming",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "active",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("active");
});

test("reportLifecycle: resuming -> failed reverts to stopped (resume attempt didn't take, still parked)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "resuming",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "scale-up failed",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "scale-up failed",
    status: "stopped",
  });
});

test("reportLifecycle: never updates the row when it isn't in-flight, but distinguishes why", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "active",
  });

  // "stale": this operator's row exists but isn't in-flight — retriable on
  // the HTTP layer (see operators/http.ts), never throws here regardless.
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      name: "my-workload",
      operatorId,
      phase: "failed",
      reason: "should be ignored",
    })
  ).resolves.toBe("stale");
  // "unmatched": no row at all for this name (a legacy/manual CR) — a
  // permanent, non-retriable no-op.
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      name: "no-such-cr",
      operatorId,
      phase: "active",
    })
  ).resolves.toBe("unmatched");

  const row = await t.run((ctx) =>
    ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", operatorId).eq("name", "my-workload")
      )
      .unique()
  );
  expect(row?.status).toBe("active");
});

test("reportLifecycle: workloadId lookup rejects a mismatched operatorId as unmatched", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const otherOperatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    operatorId,
    status: "provisioning",
  });

  // A different operator can't resolve/claim someone else's in-flight row
  // via workloadId, even if it guesses the id — treated the same as "no
  // row at all" (permanent, non-retriable), not "stale" (which would imply
  // this operator legitimately owns it).
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      operatorId: otherOperatorId,
      phase: "active",
      workloadId,
    })
  ).resolves.toBe("unmatched");

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("provisioning");
});

// --- reportLifecycle: retryable release (releaseClaim) --------------------

test("reportLifecycle: retryable failure on a fresh-create (no name) requeues to requested for any operator", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    desiredOperatorTags: [],
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    operatorId,
    phase: "failed",
    reason: "image pull error",
    retryable: true,
    workloadId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "requested" });
  expect(row).not.toHaveProperty("operatorId");
  expect(row?.leaseExpiresAt).toBeUndefined();
  expect(row?.claimAttempts).toMatchObject([{ operatorId, times: 1 }]);
});

test("reportLifecycle: retryable failure on redeploying requeues to requested_redeploy (same operator)", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "redeploying",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "patch failed",
    retryable: true,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ operatorId, status: "requested_redeploy" });
  expect(row?.claimAttempts?.[0]).toMatchObject({ operatorId, times: 1 });
});

test("reportLifecycle: retryable failure on destroying requeues to requested_destroy, never stale", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "destroying",
  });

  const result = await t.mutation(
    internal.workloads.mutations.reportLifecycle,
    {
      name: "my-workload",
      operatorId,
      phase: "failed",
      reason: "delete failed",
      retryable: true,
    }
  );
  expect(result).toBe("updated");
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested_destroy");
});

test("reportLifecycle: a non-retryable report against a destroying row is stale, not silently accepted", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "destroying",
  });

  const result = await t.mutation(
    internal.workloads.mutations.reportLifecycle,
    {
      name: "my-workload",
      operatorId,
      phase: "failed",
      reason: "should not apply",
    }
  );
  expect(result).toBe("stale");
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("destroying");
});

test("reportLifecycle: repeat retryable failures by the same operator accumulate on one ledger entry", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "redeploying",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    retryable: true,
  });
  // Same operator re-claims (claimOperation) and fails again.
  await t.mutation(internal.workloads.mutations.claimOperation, {
    operatorId,
    workloadId,
  });
  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    retryable: true,
  });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.claimAttempts).toHaveLength(1);
  expect(row?.claimAttempts?.[0]).toMatchObject({ operatorId, times: 2 });
});

test("reportLifecycle: a different operator claiming after a requeue gets its own separate ledger entry", async () => {
  const t = convexTest(schema, modules);
  const operatorA = await seedOperator(t, { tags: [] });
  const operatorB = await seedOperator(t, { tags: [] });
  const workloadId = await seedWorkload(t, {
    desiredOperatorTags: [],
    operatorId: operatorA,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    operatorId: operatorA,
    phase: "failed",
    retryable: true,
    workloadId,
  });
  await t.mutation(internal.workloads.mutations.claim, {
    operatorId: operatorB,
    workloadId,
  });
  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    operatorId: operatorB,
    phase: "failed",
    retryable: true,
    workloadId,
  });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.claimAttempts).toHaveLength(2);
  expect(row?.claimAttempts).toMatchObject([
    { operatorId: operatorA, times: 1 },
    { operatorId: operatorB, times: 1 },
  ]);
});

test("reportLifecycle: non-retryable (default) is byte-for-byte today's behavior — regression pin", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "redeploying",
  });

  // No `retryable` field at all — exactly what an un-upgraded operator
  // binary sends today.
  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "redeploy failed",
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason: "redeploy failed",
    status: "active",
  });
  expect(row?.claimAttempts).toBeUndefined();
});

// --- sweepStaleClaims -------------------------------------------------------

test("sweepStaleClaims: requeues a provisioning row whose lease has expired", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "healthy" });
  const workloadId = await seedWorkload(t, {
    desiredOperatorTags: [],
    leaseExpiresAt: Date.now() - 1000,
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "requested" });
  expect(row).not.toHaveProperty("operatorId");
  expect(row?.claimAttempts?.[0]).toMatchObject({ operatorId, times: 1 });
});

test("sweepStaleClaims: does not touch a healthy, unexpired in-flight row", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "healthy" });
  const workloadId = await seedWorkload(t, {
    leaseExpiresAt: Date.now() + 60_000,
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("provisioning");
  expect(row?.claimAttempts).toBeUndefined();
});

test("sweepStaleClaims: reacts immediately to an offline operator's redeploying row, without waiting for lease expiry", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "offline" });
  const workloadId = await seedWorkload(t, {
    // Lease not expired yet — the offline-operator fast path must fire
    // regardless.
    leaseExpiresAt: Date.now() + 60_000,
    name: "my-workload",
    operatorId,
    status: "redeploying",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  // A dead operator will never reclaim requested_redeploy, so this resolves
  // immediately rather than requeuing to a same-operator-only state.
  expect(row?.status).toBe("active");
  expect(row?.failureReason).toMatch(/owning operator went offline/u);
});

test("sweepStaleClaims: destroying has no offline fast-path — always requeues to the same operator", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "offline" });
  const workloadId = await seedWorkload(t, {
    leaseExpiresAt: Date.now() + 60_000,
    name: "my-workload",
    operatorId,
    status: "destroying",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ operatorId, status: "requested_destroy" });
});

// --- reportDestroyed ---------------------------------------------------

test("reportDestroyed: soft-deletes from any prior status", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "destroying",
  });

  await t.mutation(internal.workloads.mutations.reportDestroyed, {
    name: "my-workload",
    operatorId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "destroyed" });
});

test("reportDestroyed: no-op if already destroyed", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "destroyed",
  });

  await expect(
    t.mutation(internal.workloads.mutations.reportDestroyed, {
      name: "my-workload",
      operatorId,
    })
  ).resolves.toBeNull();
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("destroyed");
});

test("reportDestroyed: also covers an out-of-band delete on an active row", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.reportDestroyed, {
    name: "my-workload",
    operatorId,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("destroyed");
});

// --- public authedMutation entry points: "must be logged in" -------------
//
// These four moved here from workloads/actions.ts (were authedActions) with
// zero prior test coverage — mirrors workloads-actions.test.ts's
// "rejects an unauthenticated caller" pattern for the customFunctions
// authedMutation wrapper (see convex/functions.ts) instead of authedAction.

test("requestRemoval rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t);
  await expect(
    t.mutation(api.workloads.mutations.requestRemoval, { workloadId })
  ).rejects.toThrow("Not authenticated");
});

test("requestStop rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "active" });
  await expect(
    t.mutation(api.workloads.mutations.requestStop, { workloadId })
  ).rejects.toThrow("Not authenticated");
});

test("requestResume rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "stopped" });
  await expect(
    t.mutation(api.workloads.mutations.requestResume, { workloadId })
  ).rejects.toThrow("Not authenticated");
});

test("getWorkloadAccessToken rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    status: "active",
  });
  await expect(
    t.mutation(api.workloads.mutations.getWorkloadAccessToken, { workloadId })
  ).rejects.toThrow("Not authenticated");
});
