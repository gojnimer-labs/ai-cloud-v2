import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { adminQuery } from "../functions";
import { workloadStatusValidator } from "../schema";
import type { MetricSample } from "./rate";
import { bucketIncreases, sumIncrease } from "./rate";

// How far back listMetricNames looks for distinct metric keys. Metric names
// are a small, stable set (see the free-form `metric` field's doc comment in
// convex/schema.ts) reported on every interval, so a short recent window is
// enough to discover all of them without scanning the full 30-day retention.
const METRIC_DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Every distinct `metric` key reported in the last 7 days — the option list
// for the dashboard's metric picker. Deliberately not hardcoded to any
// specific metric name (see convex/schema.ts's "deliberately metric-agnostic"
// comment on workloadMetrics): a new metric an operator starts reporting
// shows up here with no code change.
export const listMetricNames = adminQuery({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("workloadMetrics")
      .withIndex("by_sampledAt", (q) =>
        q.gte("sampledAt", Date.now() - METRIC_DISCOVERY_WINDOW_MS)
      )
      .collect();
    return [...new Set(recent.map((row) => row.metric))].toSorted();
  },
  returns: v.array(v.string()),
});

const workloadMetricsSummaryRowValidator = v.object({
  displayName: v.string(),
  increase: v.number(),
  latestSampledAt: v.number(),
  latestValue: v.number(),
  sampleCount: v.number(),
  status: workloadStatusValidator,
  templateId: v.string(),
  userEmail: v.string(),
  userId: v.string(),
  workloadId: v.id("workloads"),
});

// One row per workload that reported `metric` at least once in
// [startTime, endTime], with its total increase over the window (see
// convex/metrics/rate.ts) plus its owner's email and its most recent raw
// value. This is the shared building block for the "overview", "by user",
// and "by workload" dashboard views — those group/sum these rows client-side
// rather than each running their own aggregation query.
//
// Reads the window via `by_sampledAt` and filters `metric` in memory rather
// than the (workloadId, metric, sampledAt) index, since which workloads
// reported this metric isn't known up front. Uses `.collect()`, not a capped
// `.take()`: a silent partial read here would quietly understate every KPI
// and bar total, which is worse than the query throwing on an
// unreasonably-wide window (the 30-day retention is the natural ceiling).
export const getWorkloadMetricsSummary = adminQuery({
  args: {
    endTime: v.number(),
    metric: v.string(),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    const samples = await ctx.db
      .query("workloadMetrics")
      .withIndex("by_sampledAt", (q) =>
        q.gte("sampledAt", args.startTime).lte("sampledAt", args.endTime)
      )
      .filter((q) => q.eq(q.field("metric"), args.metric))
      .collect();

    const samplesByWorkload = new Map<Id<"workloads">, MetricSample[]>();
    for (const sample of samples) {
      const existing = samplesByWorkload.get(sample.workloadId);
      if (existing) {
        existing.push(sample);
      } else {
        samplesByWorkload.set(sample.workloadId, [sample]);
      }
    }

    const workloadIds = [...samplesByWorkload.keys()];
    const workloads = await Promise.all(
      workloadIds.map((workloadId) => ctx.db.get(workloadId))
    );

    const userIds = [
      ...new Set(
        workloads
          .flatMap((workload) => (workload ? [workload.userId] : []))
          .filter(Boolean)
      ),
    ];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    return workloadIds.flatMap((workloadId, index) => {
      const workload = workloads[index];
      // Workload was deleted since it last reported — drop its now-orphaned
      // metrics from the view rather than showing a row with no identity.
      if (!workload) {
        return [];
      }
      const workloadSamples = (
        samplesByWorkload.get(workloadId) ?? []
      ).toSorted((a, b) => a.sampledAt - b.sampledAt);
      const latest = workloadSamples.at(-1);
      return [
        {
          displayName: workload.displayName,
          increase: sumIncrease(workloadSamples),
          latestSampledAt: latest?.sampledAt ?? 0,
          latestValue: latest?.value ?? 0,
          sampleCount: workloadSamples.length,
          status: workload.status,
          templateId: workload.templateId,
          userEmail: emailByUserId.get(workload.userId) ?? workload.userId,
          userId: workload.userId,
          workloadId,
        },
      ];
    });
  },
  returns: v.array(workloadMetricsSummaryRowValidator),
});

const filterSamplesByUser = async (
  ctx: QueryCtx,
  samples: Doc<"workloadMetrics">[],
  userId: string
) => {
  const workloadIds = [...new Set(samples.map((sample) => sample.workloadId))];
  const workloads = await Promise.all(workloadIds.map((id) => ctx.db.get(id)));
  const allowedWorkloadIds = new Set(
    workloadIds.filter((_, index) => workloads[index]?.userId === userId)
  );
  return samples.filter((sample) => allowedWorkloadIds.has(sample.workloadId));
};

const timelinePointValidator = v.object({
  bucketStart: v.number(),
  value: v.number(),
});

// Total increase of `metric` per fixed-width time bucket across
// [startTime, endTime] — powers the dashboard's timeline chart. Optionally
// scoped to one workload (uses the compound index directly) or one user
// (reads the window, then keeps only that user's workloads) for drill-down.
export const getWorkloadMetricsTimeline = adminQuery({
  args: {
    bucketMs: v.number(),
    endTime: v.number(),
    metric: v.string(),
    startTime: v.number(),
    userId: v.optional(v.string()),
    workloadId: v.optional(v.id("workloads")),
  },
  handler: async (ctx, args) => {
    const { workloadId } = args;
    const samples = workloadId
      ? await ctx.db
          .query("workloadMetrics")
          .withIndex("by_workload_and_metric_and_sampledAt", (q) =>
            q
              .eq("workloadId", workloadId)
              .eq("metric", args.metric)
              .gte("sampledAt", args.startTime)
              .lte("sampledAt", args.endTime)
          )
          .collect()
      : await ctx.db
          .query("workloadMetrics")
          .withIndex("by_sampledAt", (q) =>
            q.gte("sampledAt", args.startTime).lte("sampledAt", args.endTime)
          )
          .filter((q) => q.eq(q.field("metric"), args.metric))
          .collect();

    const { userId } = args;
    const scopedSamples = userId
      ? await filterSamplesByUser(ctx, samples, userId)
      : samples;

    const samplesByWorkload = new Map<Id<"workloads">, MetricSample[]>();
    for (const sample of scopedSamples) {
      const existing = samplesByWorkload.get(sample.workloadId);
      if (existing) {
        existing.push(sample);
      } else {
        samplesByWorkload.set(sample.workloadId, [sample]);
      }
    }

    const merged = new Map<number, number>();
    for (const workloadSamples of samplesByWorkload.values()) {
      for (const [bucketStart, value] of bucketIncreases(
        workloadSamples,
        args.bucketMs
      )) {
        merged.set(bucketStart, (merged.get(bucketStart) ?? 0) + value);
      }
    }

    return [...merged.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([bucketStart, value]) => ({ bucketStart, value }));
  },
  returns: v.array(timelinePointValidator),
});
