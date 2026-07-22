import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedWorkload = async (t: ReturnType<typeof convexTest>) =>
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: "my-app",
      name: "my-app-abc12",
      namespace: "ai-cloud-workloads",
      status: "active",
      templateId: "firefox",
      userId: "user_123",
    })
  );

test("pruneOldMetrics: deletes samples older than the retention window, leaves recent ones", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t);
  const now = Date.now();
  const oldId = await t.run((ctx) =>
    ctx.db.insert("workloadMetrics", {
      metric: "network.rxBytes",
      sampledAt: now - 31 * 24 * 60 * 60 * 1000,
      value: 1,
      workloadId,
    })
  );
  const recentId = await t.run((ctx) =>
    ctx.db.insert("workloadMetrics", {
      metric: "network.rxBytes",
      sampledAt: now - 60 * 1000,
      value: 2,
      workloadId,
    })
  );

  await t.mutation(internal.metrics.mutations.pruneOldMetrics, {});

  expect(await t.run((ctx) => ctx.db.get(oldId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(recentId))).not.toBeNull();
});

test("pruneOldMetrics: self-reschedules when a full page of stale rows is found", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t);
  const now = Date.now();
  // PRUNE_BATCH_SIZE is 200 — 201 stale rows means the first pass fills a
  // full page and must schedule a follow-up to clear the remainder.
  await t.run(async (ctx) => {
    await Promise.all(
      Array.from({ length: 201 }, (_, i) =>
        ctx.db.insert("workloadMetrics", {
          metric: "network.rxBytes",
          sampledAt: now - 31 * 24 * 60 * 60 * 1000 - i,
          value: i,
          workloadId,
        })
      )
    );
  });

  await t.mutation(internal.metrics.mutations.pruneOldMetrics, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const remaining = await t.run((ctx) =>
    ctx.db.query("workloadMetrics").collect()
  );
  expect(remaining).toHaveLength(0);
  vi.useRealTimers();
});
