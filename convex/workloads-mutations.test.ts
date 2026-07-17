/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
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
    desiredOperatorTags: string[];
    displayName: string;
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
      | "failed"
      | "destroyed";
    templateId: string;
    userId: string;
  }> = {}
): Promise<Id<"workloads">> =>
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: overrides.desiredOperatorTags ?? [],
      displayName: overrides.displayName ?? "my-workload",
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

// --- requestDestroy / requestRedeploy / claimOperation --------------------

test("requestDestroy then claimOperation: happy path destroy", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    name: "my-workload",
    namespace: "default",
    operatorId,
    status: "active",
  });

  await t.mutation(internal.workloads.mutations.requestDestroy, {
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

test("requestDestroy: rejects a non-active row", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "requested" });
  await expect(
    t.mutation(internal.workloads.mutations.requestDestroy, { workloadId })
  ).rejects.toThrow(/Cannot destroy/u);
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

test("reportLifecycle: no-op when the row isn't in-flight", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  await seedWorkload(t, {
    name: "my-workload",
    operatorId,
    status: "active",
  });

  // Safe to call unconditionally, including for a name with no matching row
  // at all (a legacy/manual CR) — neither should throw.
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      name: "my-workload",
      operatorId,
      phase: "failed",
      reason: "should be ignored",
    })
  ).resolves.toBeNull();
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      name: "no-such-cr",
      operatorId,
      phase: "active",
    })
  ).resolves.toBeNull();

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

test("reportLifecycle: workloadId lookup rejects a mismatched operatorId", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const otherOperatorId = await seedOperator(t);
  const workloadId = await seedWorkload(t, {
    operatorId,
    status: "provisioning",
  });

  // A different operator can't resolve/claim someone else's in-flight row
  // via workloadId, even if it guesses the id.
  await expect(
    t.mutation(internal.workloads.mutations.reportLifecycle, {
      operatorId: otherOperatorId,
      phase: "active",
      workloadId,
    })
  ).resolves.toBeNull();

  const row = await t.run((ctx) => ctx.db.get(workloadId));
  expect(row?.status).toBe("provisioning");
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
