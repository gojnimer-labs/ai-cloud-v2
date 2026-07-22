/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { bucketIncreases, computeIncreases, sumIncrease } from "./metrics/rate";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// --- computeIncreases / sumIncrease ---------------------------------------
// This is the fiddly part of the feature: workloadMetrics stores a raw
// cumulative counter (see convex/schema.ts), never a delta, so every chart
// depends on this reset-aware diffing being right.

test("computeIncreases: diffs consecutive samples regardless of input order", () => {
  const increases = computeIncreases([
    { sampledAt: 300, value: 30 },
    { sampledAt: 100, value: 10 },
    { sampledAt: 200, value: 20 },
  ]);
  expect(increases).toEqual([
    { delta: 10, sampledAt: 200 },
    { delta: 10, sampledAt: 300 },
  ]);
});

test("computeIncreases: a counter reset (value drops) counts the new value itself, not a negative delta", () => {
  // Simulates a workload restart: the counter resets to a small value
  // instead of continuing to climb from 100.
  const increases = computeIncreases([
    { sampledAt: 100, value: 100 },
    { sampledAt: 200, value: 5 },
  ]);
  expect(increases).toEqual([{ delta: 5, sampledAt: 200 }]);
});

test("computeIncreases: a lone sample contributes no delta", () => {
  expect(computeIncreases([{ sampledAt: 100, value: 42 }])).toEqual([]);
});

test("sumIncrease: totals every delta across resets and plain growth", () => {
  // 100 (baseline) -> 150 (+50) -> 20 (reset, +20) -> 35 (+15)
  const total = sumIncrease([
    { sampledAt: 100, value: 100 },
    { sampledAt: 200, value: 150 },
    { sampledAt: 300, value: 20 },
    { sampledAt: 400, value: 35 },
  ]);
  expect(total).toBe(85);
});

// --- bucketIncreases -------------------------------------------------------

test("bucketIncreases: assigns each delta to the bucket of its LATER sample", () => {
  // delta 15 (bucket 0->100 straddle) then delta 15 (fully within bucket 100)
  const buckets = bucketIncreases(
    [
      { sampledAt: 0, value: 10 },
      { sampledAt: 90, value: 25 },
      { sampledAt: 150, value: 40 },
    ],
    100
  );
  expect(Object.fromEntries(buckets)).toEqual({ 0: 15, 100: 15 });
});

test("bucketIncreases: sums multiple deltas landing in the same bucket", () => {
  const buckets = bucketIncreases(
    [
      { sampledAt: 10, value: 0 },
      { sampledAt: 20, value: 5 },
      { sampledAt: 30, value: 12 },
    ],
    100
  );
  expect(Object.fromEntries(buckets)).toEqual({ 0: 12 });
});

// --- admin-only access ------------------------------------------------------
// Mirrors convex/groups-mutations.test.ts's convention for asserting the
// requireAdminUser gate on adminQuery/adminMutation-wrapped functions.

test("listMetricNames rejects a non-admin caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.metrics.queries.listMetricNames, {})
  ).rejects.toThrow("Admin access required");
});

test("getWorkloadMetricsSummary rejects a non-admin caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.metrics.queries.getWorkloadMetricsSummary, {
      endTime: Date.now(),
      metric: "network.rxBytes",
      startTime: 0,
    })
  ).rejects.toThrow("Admin access required");
});

test("getWorkloadMetricsTimeline rejects a non-admin caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.metrics.queries.getWorkloadMetricsTimeline, {
      bucketMs: 3_600_000,
      endTime: Date.now(),
      metric: "network.rxBytes",
      startTime: 0,
    })
  ).rejects.toThrow("Admin access required");
});
