/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CatalogTemplate } from "./operators/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    catalog: CatalogTemplate[];
    tags: string[];
  }> = {}
): Promise<Id<"operators">> =>
  await t.run((ctx) =>
    ctx.db.insert("operators", {
      catalog: overrides.catalog,
      healthStatus: "healthy",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: overrides.tags,
    })
  );

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
      createdAt: Date.now(),
      desiredOperatorTags: overrides.desiredOperatorTags ?? [],
      displayName: overrides.displayName ?? "my-workload",
      name: overrides.name,
      namespace: overrides.namespace,
      operatorId: overrides.operatorId,
      status: overrides.status ?? "requested",
      templateId: overrides.templateId ?? "nginx",
      templateVersion: overrides.templateVersion,
      userId: overrides.userId ?? "user_123",
    })
  );

// --- listClaimable -----------------------------------------------------

test("listClaimable: only returns rows whose desiredOperatorTags are a subset", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, { tags: ["gpu", "west"] });
  const matching = await seedWorkload(t, { desiredOperatorTags: ["gpu"] });
  await seedWorkload(t, { desiredOperatorTags: ["gpu", "east-only"] });
  const noTags = await seedWorkload(t, { desiredOperatorTags: [] });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorId,
  });
  const ids = results.map((result) => result.workloadId);
  expect(ids).toContain(matching);
  // Empty desiredTags matches any operator.
  expect(ids).toContain(noTags);
  expect(ids).toHaveLength(2);
});

test("listClaimable: excludes rows not in status requested", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  await seedWorkload(t, { desiredOperatorTags: [], status: "active" });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorId,
  });
  expect(results).toHaveLength(0);
});

test("listClaimable: excludes a row whose templateVersion isn't in the operator's catalog", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t, {
    catalog: [catalogTemplate({ version: "v2" })],
  });
  await seedWorkload(t, { templateId: "nginx", templateVersion: "v1" });
  const matching = await seedWorkload(t, {
    templateId: "nginx",
    templateVersion: "v2",
  });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorId,
  });
  const ids = results.map((result) => result.workloadId);
  expect(ids).toEqual([matching]);
});

test("listClaimable: doesn't gate on version when the operator has no reported catalog", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const matching = await seedWorkload(t, {
    templateId: "nginx",
    templateVersion: "v1",
  });

  const results = await t.query(internal.workloads.queries.listClaimable, {
    operatorId,
  });
  const ids = results.map((result) => result.workloadId);
  expect(ids).toEqual([matching]);
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

test("listPendingOperations: also surfaces requested_stop/requested_resume, scoped to the given operator", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await seedOperator(t);
  const otherOperatorId = await seedOperator(t);

  const stopId = await seedWorkload(t, {
    name: "a",
    operatorId,
    status: "requested_stop",
  });
  const resumeId = await seedWorkload(t, {
    name: "b",
    operatorId,
    status: "requested_resume",
  });
  await seedWorkload(t, {
    name: "c",
    operatorId: otherOperatorId,
    status: "requested_stop",
  });

  const results = await t.query(
    internal.workloads.queries.listPendingOperations,
    { operatorId }
  );
  expect(results).toHaveLength(2);
  expect(results).toEqual(
    expect.arrayContaining([
      { operation: "stop", workloadId: stopId },
      { operation: "resume", workloadId: resumeId },
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
