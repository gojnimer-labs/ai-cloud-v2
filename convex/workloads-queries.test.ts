/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>
): Promise<Id<"operators">> =>
  await t.run((ctx) =>
    ctx.db.insert("operators", {
      healthStatus: "healthy",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
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

// --- listClaimable -----------------------------------------------------

test("listClaimable: only returns rows whose desiredOperatorTags are a subset", async () => {
  const t = convexTest(schema, modules);
  const matching = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });
  await seedWorkload(t, { desiredOperatorTags: ["gpu", "east-only"] });
  const noTags = await seedWorkload(t, { desiredOperatorTags: [] });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorTags: ["gpu", "west"],
  });
  const ids = results.map((result) => result.workloadId);
  expect(ids).toContain(matching);
  // Empty desiredTags matches any operator.
  expect(ids).toContain(noTags);
  expect(ids).toHaveLength(2);
});

test("listClaimable: excludes rows not in status requested", async () => {
  const t = convexTest(schema, modules);
  await seedWorkload(t, { desiredOperatorTags: [], status: "active" });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorTags: [],
  });
  expect(results).toHaveLength(0);
});

// --- listPendingOperations -----------------------------------------------

test("listPendingOperations: scoped to the given operator only", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const otherOperatorId = await seedOperator(t);

  const destroyId = await seedWorkload(t, {
    name: "a",
    operatorId,
    status: "requested_destroy",
  });
  const redeployId = await seedWorkload(t, {
    name: "b",
    operatorId,
    status: "requested_redeploy",
  });
  await seedWorkload(t, {
    name: "c",
    operatorId: otherOperatorId,
    status: "requested_destroy",
  });

  const results = await t.query(
    internal.workloads.queries.listPendingOperations,
    { operatorId }
  );
  expect(results).toHaveLength(2);
  expect(results).toEqual(
    expect.arrayContaining([
      { operation: "destroy", workloadId: destroyId },
      { operation: "redeploy", workloadId: redeployId },
    ])
  );
});

test("listPendingOperations: excludes active/requested rows", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  await seedWorkload(t, { name: "a", operatorId, status: "active" });
  await seedWorkload(t, { operatorId, status: "requested" });

  const results = await t.query(
    internal.workloads.queries.listPendingOperations,
    { operatorId }
  );
  expect(results).toHaveLength(0);
});
