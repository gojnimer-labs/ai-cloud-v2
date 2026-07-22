/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const baseUpdateArgs = {
  name: "renamed-cluster",
  retentionPolicy: "standard" as const,
};

test("createCluster rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.operators.mutations.createCluster, {
      name: "test-cluster",
      retentionPolicy: "standard",
    })
  ).rejects.toThrow("Admin access required");
});

test("createCluster: produces both an operators row and a matching pending operatorHeartbeats row", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard" }
  );

  const heartbeat = await t.run((ctx) =>
    ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique()
  );
  expect(heartbeat).toMatchObject({ healthStatus: "pending", operatorId });
});

test("promoteHealthStatuses: promotes a healthy operator's heartbeat row to offline once its last signal is stale", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard" }
  );
  const heartbeatId = await t.run(async (ctx) => {
    const heartbeat = await ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique();
    if (!heartbeat) {
      throw new Error("expected a heartbeat row");
    }
    await ctx.db.patch(heartbeat._id, {
      healthStatus: "healthy",
      lastHeartbeatAt: Date.now() - 2 * 60 * 60 * 1000,
    });
    return heartbeat._id;
  });

  await t.mutation(internal.operators.mutations.promoteHealthStatuses, {});

  const heartbeat = await t.run((ctx) => ctx.db.get(heartbeatId));
  expect(heartbeat?.healthStatus).toBe("offline");
});

test("promoteHealthStatuses: stays healthy well within the offline threshold", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard" }
  );
  const heartbeatId = await t.run(async (ctx) => {
    const heartbeat = await ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique();
    if (!heartbeat) {
      throw new Error("expected a heartbeat row");
    }
    // The operator's real heartbeat interval is 30s - one missed tick is
    // nowhere near the offline threshold.
    await ctx.db.patch(heartbeat._id, {
      healthStatus: "healthy",
      lastHeartbeatAt: Date.now() - 60 * 1000,
    });
    return heartbeat._id;
  });

  await t.mutation(internal.operators.mutations.promoteHealthStatuses, {});

  const heartbeat = await t.run((ctx) => ctx.db.get(heartbeatId));
  expect(heartbeat?.healthStatus).toBe("healthy");
});

test("promoteHealthStatuses: 5 minutes of silence is now offline (would have stayed healthy under the old 1-hour threshold)", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard" }
  );
  const heartbeatId = await t.run(async (ctx) => {
    const heartbeat = await ctx.db
      .query("operatorHeartbeats")
      .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
      .unique();
    if (!heartbeat) {
      throw new Error("expected a heartbeat row");
    }
    await ctx.db.patch(heartbeat._id, {
      healthStatus: "healthy",
      lastHeartbeatAt: Date.now() - 5 * 60 * 1000,
    });
    return heartbeat._id;
  });

  await t.mutation(internal.operators.mutations.promoteHealthStatuses, {});

  const heartbeat = await t.run((ctx) => ctx.db.get(heartbeatId));
  expect(heartbeat?.healthStatus).toBe("offline");
});

test("updateCluster: freely edits tags for an operator that has never self-reported them", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard", tags: ["old"] }
  );

  await t.mutation(internal.operators.mutations.updateClusterInternal, {
    ...baseUpdateArgs,
    operatorId,
    tags: ["new"],
  });

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.tags).toEqual(["new"]);
});

test("updateCluster: rejects a tags change once the operator has self-reported tags", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("operators", {
      name: "test-cluster",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: ["gpu"],
      tagsSetByOperator: true,
    });
    await ctx.db.insert("operatorHeartbeats", {
      healthStatus: "pending",
      operatorId: id,
    });
    return id;
  });

  await expect(
    t.mutation(internal.operators.mutations.updateClusterInternal, {
      ...baseUpdateArgs,
      operatorId,
      tags: ["something-else"],
    })
  ).rejects.toThrow(
    "This operator reports its own tags, so they can only be changed by re-registering it"
  );

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.tags).toEqual(["gpu"]);
});

test("updateCluster: resubmitting an operator's own tags unchanged (any order) is not a locked edit, and other fields still update", async () => {
  const t = convexTest(schema, modules);
  const operatorId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("operators", {
      name: "test-cluster",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: ["gpu", "on-prem"],
      tagsSetByOperator: true,
    });
    await ctx.db.insert("operatorHeartbeats", {
      healthStatus: "pending",
      operatorId: id,
    });
    return id;
  });

  await t.mutation(internal.operators.mutations.updateClusterInternal, {
    ...baseUpdateArgs,
    description: "updated description",
    operatorId,
    tags: ["on-prem", "gpu"],
  });

  const operator = await t.run((ctx) => ctx.db.get(operatorId));
  expect(operator?.tags).toEqual(["on-prem", "gpu"]);
  expect(operator?.description).toBe("updated description");
  expect(operator?.name).toBe("renamed-cluster");
});

test("updateCluster: throws operator.not_found for a missing operator", async () => {
  const t = convexTest(schema, modules);
  const { operatorId } = await t.mutation(
    internal.operators.mutations.createClusterInternal,
    { name: "test-cluster", retentionPolicy: "standard" }
  );
  await t.run((ctx) => ctx.db.delete(operatorId));

  await expect(
    t.mutation(internal.operators.mutations.updateClusterInternal, {
      ...baseUpdateArgs,
      operatorId,
      tags: [],
    })
  ).rejects.toThrow("Operator not found");
});
