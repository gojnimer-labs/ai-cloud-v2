/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CatalogTemplate } from "./operators/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  overrides: {
    catalog?: CatalogTemplate[];
    healthStatus?: "pending" | "healthy" | "offline" | "ready_to_destroy";
    tags?: string[];
  } = {}
): Promise<Id<"operators">> =>
  await t.run(async (ctx) => {
    const operatorId = await ctx.db.insert("operators", {
      catalog: overrides.catalog,
      deployToken: "deploy-token",
      externalUrl: "https://operator.example.com",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: overrides.tags,
    });
    await ctx.db.insert("operatorHeartbeats", {
      healthStatus: overrides.healthStatus ?? "healthy",
      operatorId,
    });
    return operatorId;
  });

const catalogTemplate = (
  overrides: Partial<CatalogTemplate> = {}
): CatalogTemplate => ({
  description: "Test template",
  entrypoints: [],
  icon: "🧪",
  id: "nginx",
  name: "Nginx",
  parameters: [],
  version: "v1",
  ...overrides,
});

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
    sourcePresetVersionId: Id<"presetVersions">;
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
    templateVersion: string;
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
      sourcePresetVersionId: overrides.sourcePresetVersionId,
      status: overrides.status ?? "requested",
      templateId: overrides.templateId ?? "nginx",
      templateVersion: overrides.templateVersion,
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

test("requestCreate: uses the templateId exactly when left blank with no clash", async () => {
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
  expect(row?.displayName).toBe("nginx");
});

test("requestCreate: uses displayNamePrefix exactly when left blank with no clash", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await t.mutation(
    internal.workloads.mutations.requestCreate,
    {
      config: {},
      desiredOperatorTags: [],
      displayNamePrefix: "Claude Web",
      templateId: "chrome",
      templateVersion: "1.0.0",
      userId: "user_123",
    }
  );
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.displayName).toBe("Claude Web");
});

test("requestCreate: falls back to a suffixed displayName once the exact prefix is taken", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.workloads.mutations.requestCreate, {
    config: {},
    desiredOperatorTags: [],
    displayNamePrefix: "Claude Web",
    templateId: "chrome",
    templateVersion: "1.0.0",
    userId: "user_123",
  });

  const workloadId = await t.mutation(
    internal.workloads.mutations.requestCreate,
    {
      config: {},
      desiredOperatorTags: [],
      displayNamePrefix: "Claude Web",
      templateId: "chrome",
      templateVersion: "1.0.0",
      userId: "user_123",
    }
  );
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.displayName).toMatch(/^Claude Web-/u);
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

test("claim: returns null when the operator's catalog doesn't have the requested templateVersion", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    catalog: [catalogTemplate({ version: "v1" })],
  });
  const workloadId = await seedWorkload(t, { templateVersion: "v2" });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(claimed).toBeNull();
});

test("claim: succeeds when the operator hasn't reported a catalog at all", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, { templateVersion: "v1" });

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId,
    workloadId,
  });
  expect(claimed).not.toBeNull();
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

const seedPresetVersion = async (
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{ templateVersion: string; version: number }> = {}
): Promise<Id<"presetVersions">> =>
  await t.run(async (ctx) => {
    const presetId = await ctx.db.insert("presets", {
      createdAt: Date.now(),
      createdBy: "admin_123",
      currentVersion: overrides.version ?? 1,
      desiredOperatorTags: [],
      displayName: "test-preset",
      templateId: "nginx",
      templateVersion: overrides.templateVersion ?? "1.0.0",
      updatedAt: Date.now(),
    });
    return await ctx.db.insert("presetVersions", {
      createdAt: Date.now(),
      createdBy: "admin_123",
      params: {},
      presetId,
      templateId: "nginx",
      templateVersion: overrides.templateVersion ?? "1.0.0",
      version: overrides.version ?? 1,
    });
  });

test("requestRedeploy: bumps sourcePresetVersionId when provided, clears a stale failureReason", async () => {
  const t = convexTest(schema, modules);
  const presetVersionId = await seedPresetVersion(t, {
    templateVersion: "2.0.0",
    version: 2,
  });
  const workloadId = await seedWorkload(t, {
    failureReason: "some earlier failure",
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.requestRedeploy, {
    config: {},
    sourcePresetVersionId: presetVersionId,
    templateVersion: "2.0.0",
    workloadId,
  });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.failureReason).toBeUndefined();
  expect(row?.sourcePresetVersionId).toBe(presetVersionId);
});

test("requestRedeploy: leaves sourcePresetVersionId untouched when omitted", async () => {
  const t = convexTest(schema, modules);
  const presetVersionId = await seedPresetVersion(t);
  const workloadId = await seedWorkload(t, {
    sourcePresetVersionId: presetVersionId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.requestRedeploy, {
    config: {},
    templateVersion: "2.0.0",
    workloadId,
  });

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.sourcePresetVersionId).toBe(presetVersionId);
});

test("requestRedeploy then claimOperation: terminally cancels when the operator's catalog doesn't have the requested templateVersion", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    catalog: [catalogTemplate({ version: "1.0.0" })],
  });
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

  const claimed = await t.mutation(
    internal.workloads.mutations.claimOperation,
    {
      operatorId,
      workloadId,
    }
  );
  expect(claimed).toBeNull();
  // Cancelled back to active with a clear reason — not left stuck in
  // requested_redeploy forever with no visibility (this never sets a lease
  // or increments claimAttempts, so it's a direct patch, not a release).
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({
    failureReason:
      "assigned operator no longer serves this template version; redeploy cancelled, workload left running",
    status: "active",
  });
  expect(row?.claimAttempts).toBeUndefined();
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

test("reportLifecycle: provisioning -> failed stays terminal even when a CR already exists", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  // Has a `name` — the CR already exists (e.g. reconcile failed after the
  // create-time upsert already landed) — but this row has never reached
  // `active` before, so there's no prior known-good state to fall back to.
  // Unlike redeploying/stopping (which target an already-active row),
  // reporting `active` here would be a fabrication, not an optimistic
  // inference — must resolve to `failed`.
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
    status: "failed",
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

test("reportLifecycle: retryable failure on provisioning WITH a name (e.g. cluster capacity will never fit it) requeues to requested for any operator immediately, no lease wait", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    // A live CR already exists (Create() succeeded), but the operator is
    // explicitly telling us this attempt can't work here — unlike a silent
    // lease timeout, this must NOT wait out CLAIM_TIMEOUT_MS or extend the
    // lease; it should reopen to any operator right away.
    leaseExpiresAt: Date.now() + 60_000,
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId,
    phase: "failed",
    reason: "insufficient cluster capacity",
    retryable: true,
  });
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "requested" });
  expect(row).not.toHaveProperty("operatorId");
  expect(row).not.toHaveProperty("name");
  expect(row).not.toHaveProperty("namespace");
  expect(row?.leaseExpiresAt).toBeUndefined();
  expect(row?.claimAttempts).toMatchObject([{ operatorId, times: 1 }]);
});

test("reportLifecycle: retryable failure on provisioning WITH a name eventually terminates via claim()'s own exhaustion check, not a duplicate one in releaseClaim", async () => {
  const t = convexTest(schema, modules);
  const operatorA = await seedOperator(t, { tags: [] });
  const workloadId = await seedWorkload(t, {
    // One below MAX_CLAIM_ATTEMPTS (5) — this report's own recordClaimAttempt
    // call pushes the total to exactly 5.
    claimAttempts: [{ claimedAt: Date.now(), operatorId: operatorA, times: 4 }],
    desiredOperatorTags: [],
    name: "my-workload",
    namespace: "default",
    operatorId: operatorA,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.reportLifecycle, {
    name: "my-workload",
    operatorId: operatorA,
    phase: "failed",
    reason: "insufficient cluster capacity",
    retryable: true,
  });
  // releaseClaim itself always reopens to "requested" on an explicit report
  // — it never resolves to "failed" directly. claim()'s pre-existing
  // exhaustion check is what turns the row terminal on the next attempt.
  let row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("requested");

  const claimed = await t.mutation(internal.workloads.mutations.claim, {
    operatorId: operatorA,
    workloadId,
  });
  expect(claimed).toBeNull();
  row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("failed");
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

test("sweepStaleClaims: provisioning WITH a name resolves to failed once claimAttempts is exhausted", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "healthy" });
  const workloadId = await seedWorkload(t, {
    // One below MAX_CLAIM_ATTEMPTS (5) — this sweep's own recordClaimAttempt
    // call pushes the total to exactly 5, crossing the threshold.
    claimAttempts: [{ claimedAt: Date.now(), operatorId, times: 4 }],
    leaseExpiresAt: Date.now() - 1000,
    name: "my-workload",
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  // A CR/Deployment existing (name is set) doesn't mean it ever became
  // ready — unlike redeploying/stopping, provisioning has no prior `active`
  // state to fall back to, so this must resolve to `failed`, not `active`.
  expect(row).toMatchObject({ status: "failed" });
  expect(row?.failureReason).toMatch(
    /did not complete after 5 lease timeouts/u
  );
});

test("sweepStaleClaims: provisioning WITH a name resolves to failed immediately when the operator is offline", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { healthStatus: "offline" });
  const workloadId = await seedWorkload(t, {
    // Lease not expired yet — the offline-operator fast path must fire
    // regardless, same as the redeploying case.
    leaseExpiresAt: Date.now() + 60_000,
    name: "my-workload",
    operatorId,
    status: "provisioning",
  });

  await t.mutation(internal.workloads.mutations.sweepStaleClaims, {});
  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row).toMatchObject({ status: "failed" });
  expect(row?.failureReason).toMatch(/owning operator went offline/u);
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

// --- stopAllWorkloadsForUser / resumeAllWorkloadsForUser -------------------
//
// The public mutations are admin-gated via requireAdminUser, which reads
// role off the Better Auth component — standing up a full admin-authenticated
// identity in convex-test is its own rabbit hole unrelated to this feature,
// so (mirroring adminGetWorkloadAccessToken's rejection-only coverage below)
// the bulk filtering logic itself is tested directly against the internal
// mutations the public wrappers delegate to.

test("stopAllWorkloadsForUser rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.workloads.mutations.stopAllWorkloadsForUser, {
      userId: "user_a",
    })
  ).rejects.toThrow("Admin access required");
});

test("resumeAllWorkloadsForUser rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.workloads.mutations.resumeAllWorkloadsForUser, {
      userId: "user_a",
    })
  ).rejects.toThrow("Admin access required");
});

test("adminGetWorkloadAccessToken rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "active" });
  await expect(
    t.mutation(api.workloads.mutations.adminGetWorkloadAccessToken, {
      workloadId,
    })
  ).rejects.toThrow("Admin access required");
});

test("stopAllWorkloadsForUserInternal: stops only the target user's active rows", async () => {
  const t = convexTest(schema, modules);
  const targetActive1 = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const targetActive2 = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const targetStopped = await seedWorkload(t, {
    status: "stopped",
    userId: "user_a",
  });
  const otherActive = await seedWorkload(t, {
    status: "active",
    userId: "user_b",
  });

  await t.mutation(
    internal.workloads.mutations.stopAllWorkloadsForUserInternal,
    { userId: "user_a" }
  );

  const rows = await t.run((ctx) => ctx.db.query("workloads").collect());
  const byId = new Map(rows.map((row) => [row._id, row]));
  expect(byId.get(targetActive1)?.status).toBe("requested_stop");
  expect(byId.get(targetActive2)?.status).toBe("requested_stop");
  // A user's own already-stopped row is untouched — only active rows flip.
  expect(byId.get(targetStopped)?.status).toBe("stopped");
  // A different user's active row is never touched.
  expect(byId.get(otherActive)?.status).toBe("active");
});

test("resumeAllWorkloadsForUserInternal: resumes only the target user's stopped rows", async () => {
  const t = convexTest(schema, modules);
  const targetStopped1 = await seedWorkload(t, {
    status: "stopped",
    userId: "user_a",
  });
  const targetActive = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const otherStopped = await seedWorkload(t, {
    status: "stopped",
    userId: "user_b",
  });

  await t.mutation(
    internal.workloads.mutations.resumeAllWorkloadsForUserInternal,
    { userId: "user_a" }
  );

  const rows = await t.run((ctx) => ctx.db.query("workloads").collect());
  const byId = new Map(rows.map((row) => [row._id, row]));
  expect(byId.get(targetStopped1)?.status).toBe("requested_resume");
  // A user's own active row is untouched — only stopped rows flip.
  expect(byId.get(targetActive)?.status).toBe("active");
  // A different user's stopped row is never touched.
  expect(byId.get(otherStopped)?.status).toBe("stopped");
});
