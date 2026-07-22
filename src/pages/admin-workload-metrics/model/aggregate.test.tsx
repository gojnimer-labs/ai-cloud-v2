import { describe, expect, test } from "vitest";

import { groupByUser, topByIncrease } from "./aggregate";
import type { WorkloadMetricRow } from "./types";

const row = (overrides: Partial<WorkloadMetricRow>): WorkloadMetricRow => ({
  displayName: "app",
  increase: 0,
  latestSampledAt: 0,
  latestValue: 0,
  sampleCount: 1,
  status: "active",
  templateId: "nginx",
  userEmail: "user@example.com",
  userId: "user_1",
  workloadId: "workload_1" as WorkloadMetricRow["workloadId"],
  ...overrides,
});

describe("groupByUser", () => {
  test("sums increase and counts workloads across a user's multiple rows", () => {
    const rows = [
      row({ increase: 10, latestSampledAt: 100, userId: "user_1" }),
      row({
        increase: 25,
        latestSampledAt: 200,
        userId: "user_1",
        workloadId: "workload_2" as WorkloadMetricRow["workloadId"],
      }),
    ];

    const [aggregate] = groupByUser(rows);
    expect(aggregate).toMatchObject({
      increase: 35,
      latestSampledAt: 200,
      userId: "user_1",
      workloadCount: 2,
    });
  });

  test("keeps the latest activity even when it isn't the row with the highest increase", () => {
    const rows = [
      row({ increase: 100, latestSampledAt: 50, userId: "user_1" }),
      row({
        increase: 1,
        latestSampledAt: 999,
        userId: "user_1",
        workloadId: "workload_2" as WorkloadMetricRow["workloadId"],
      }),
    ];

    expect(groupByUser(rows)[0].latestSampledAt).toBe(999);
  });

  test("keeps distinct users as separate rows", () => {
    const rows = [
      row({ increase: 10, userEmail: "a@example.com", userId: "user_a" }),
      row({ increase: 20, userEmail: "b@example.com", userId: "user_b" }),
    ];

    expect(groupByUser(rows)).toHaveLength(2);
  });
});

describe("topByIncrease", () => {
  test("returns the top N rows sorted descending by increase", () => {
    const rows = [
      row({ displayName: "low", increase: 1 }),
      row({ displayName: "high", increase: 100 }),
      row({ displayName: "mid", increase: 50 }),
    ];

    expect(topByIncrease(rows, 2).map((r) => r.displayName)).toEqual([
      "high",
      "mid",
    ]);
  });

  test("returns every row when there are fewer than the limit", () => {
    const rows = [row({ increase: 1 })];
    expect(topByIncrease(rows, 8)).toHaveLength(1);
  });
});
