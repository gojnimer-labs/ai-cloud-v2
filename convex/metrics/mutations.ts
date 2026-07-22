import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

// Retention window for raw workloadMetrics rows — see pruneOldMetrics below.
// A dashboard chart only needs recent history; nothing today reads a sample
// older than this.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Bounds one sweep's work — matches the bounded-batch-delete pattern
// Convex's own guidelines require for unbounded deletes (no native
// `.delete()` on a query): read a bounded page, delete it, and only
// reschedule another pass if that page was full.
const PRUNE_BATCH_SIZE = 200;

// Bounds one report call — generous for a single operator's fleet of
// workloads reporting a handful of metrics each per interval, while still
// rejecting an obviously-malformed/runaway payload before it ever reaches
// the handler.
const MAX_SAMPLES_PER_BATCH = 2000;

// Records a batch of usage samples reported by operatorId (the caller,
// already authenticated by operators/http.ts#requireOperator — never
// trusted from the request body). Each sample is resolved to its workload
// via (operatorId, name), the same index reportDestroyed already uses —
// samples for a name this operator doesn't currently own (already
// destroyed, renamed, or a stale/racing report) are silently dropped rather
// than failing the whole batch: this is best-effort telemetry, not a
// correctness-critical write, and the next report interval self-corrects.
export const recordBatch = internalMutation({
  args: {
    operatorId: v.id("operators"),
    samples: v.array(
      v.object({
        metric: v.string(),
        name: v.string(),
        sampledAt: v.number(),
        value: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.samples.length > MAX_SAMPLES_PER_BATCH) {
      throw new Error(`at most ${MAX_SAMPLES_PER_BATCH} samples per batch`);
    }

    const distinctNames = [...new Set(args.samples.map((s) => s.name))];
    const resolved = await Promise.all(
      distinctNames.map(async (name) => {
        const row = await ctx.db
          .query("workloads")
          .withIndex("by_operator_and_name", (q) =>
            q.eq("operatorId", args.operatorId).eq("name", name)
          )
          .unique();
        return [name, row?._id ?? null] as const;
      })
    );
    const workloadIdByName = new Map<string, Id<"workloads"> | null>(resolved);

    const matched = args.samples
      .map((sample) => ({
        sample,
        workloadId: workloadIdByName.get(sample.name),
      }))
      .filter(
        (
          entry
        ): entry is {
          sample: (typeof args.samples)[number];
          workloadId: Id<"workloads">;
        } => Boolean(entry.workloadId)
      );

    await Promise.all(
      matched.map(({ sample, workloadId }) =>
        ctx.db.insert("workloadMetrics", {
          metric: sample.metric,
          sampledAt: sample.sampledAt,
          value: sample.value,
          workloadId,
        })
      )
    );
    return null;
  },
  returns: v.null(),
});

// Cron target (see crons.ts). Deletes workloadMetrics rows older than
// RETENTION_MS, oldest-first via by_sampledAt, in bounded pages —
// self-reschedules while a page comes back full, same idiom as any other
// unbounded-delete sweep in this codebase.
export const pruneOldMetrics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const stale = await ctx.db
      .query("workloadMetrics")
      .withIndex("by_sampledAt", (q) => q.lt("sampledAt", cutoff))
      .take(PRUNE_BATCH_SIZE);

    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));

    if (stale.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.metrics.mutations.pruneOldMetrics,
        {}
      );
    }
    return null;
  },
  returns: v.null(),
});
