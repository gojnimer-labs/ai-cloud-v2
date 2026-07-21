/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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
