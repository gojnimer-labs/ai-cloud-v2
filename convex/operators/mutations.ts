import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";
import { generateToken, hashToken } from "./crypto";
import type { CatalogTemplate } from "./validators";
import { templateValidator } from "./validators";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * ONE_HOUR_MS;

const retentionPolicyValidator = v.union(
  v.literal("standard"),
  v.literal("retain")
);

// Pre-registers a cluster before any real operator instance exists. Mints a
// fresh enrollment token, stores only its hash, and returns the raw value
// ONCE — the admin copies it into that cluster's own ai-cloud-operator-env
// k8s Secret. Convex never persists the raw value (same pattern as
// deployToken/heartbeatToken in operators/http.ts#register).
export const createCluster = adminMutation({
  args: {
    description: v.optional(v.string()),
    name: v.string(),
    region: v.optional(v.string()),
    retentionPolicy: retentionPolicyValidator,
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const enrollmentToken = generateToken();
    const enrollmentTokenHash = await hashToken(enrollmentToken);
    const operatorId = await ctx.db.insert("operators", {
      description: args.description,
      enrollmentTokenHash,
      healthStatus: "pending",
      name: args.name,
      region: args.region,
      registeredAt: Date.now(),
      retentionPolicy: args.retentionPolicy,
      tags: args.tags,
    });
    return { enrollmentToken, operatorId };
  },
  returns: v.object({
    enrollmentToken: v.string(),
    operatorId: v.id("operators"),
  }),
});

// Full-replace edit of admin-owned metadata only — never touches
// externalUrl/deployToken/heartbeatTokenHash/healthStatus/claimedAt.
export const updateCluster = adminMutation({
  args: {
    description: v.optional(v.string()),
    name: v.string(),
    operatorId: v.id("operators"),
    region: v.optional(v.string()),
    retentionPolicy: retentionPolicyValidator,
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.operatorId, {
      description: args.description,
      name: args.name,
      region: args.region,
      retentionPolicy: args.retentionPolicy,
      tags: args.tags,
    });
    return null;
  },
  returns: v.null(),
});

// Invalidates the previous enrollment token immediately (overwrites the
// hash) and returns a new raw value once. Doesn't touch claim state or any
// existing deployToken/heartbeatToken — only changes what secret is needed
// for a FUTURE (re-)registration.
export const rerollEnrollmentToken = adminMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const enrollmentToken = generateToken();
    const enrollmentTokenHash = await hashToken(enrollmentToken);
    await ctx.db.patch(args.operatorId, { enrollmentTokenHash });
    return { enrollmentToken };
  },
  returns: v.object({ enrollmentToken: v.string() }),
});

// Browser-facing delete, confirmed client-side via AlertDialog. Distinct
// from the internal-only `remove` below.
export const deleteCluster = adminMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});

// Called on every POST /operators/register — both the initial claim and any
// later re-registration (the operator falls back to this whenever its
// persisted heartbeat token gets rejected, AND whenever it wants to publish
// an updated catalog — see convex/schema.ts's operators.catalog doc
// comment). Looks up by the pre-created row's enrollmentTokenHash, never by
// name, so the operator's self-reported identity can never claim or rename
// a cluster it wasn't issued a token for.
export const claim = internalMutation({
  args: {
    catalog: v.optional(v.array(templateValidator)),
    deployToken: v.string(),
    enrollmentTokenHash: v.string(),
    externalUrl: v.string(),
    heartbeatTokenHash: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_enrollmentTokenHash", (q) =>
        q.eq("enrollmentTokenHash", args.enrollmentTokenHash)
      )
      .unique();
    if (!operator) {
      return null;
    }
    const patch: {
      catalog?: CatalogTemplate[];
      catalogReportedAt?: number;
      claimedAt: number;
      deployToken: string;
      externalUrl: string;
      healthStatus: "healthy";
      heartbeatTokenHash: string;
      lastHeartbeatAt: number;
      metadata: unknown;
    } = {
      claimedAt: operator.claimedAt ?? Date.now(),
      deployToken: args.deployToken,
      externalUrl: args.externalUrl,
      healthStatus: "healthy",
      heartbeatTokenHash: args.heartbeatTokenHash,
      lastHeartbeatAt: Date.now(),
      metadata: args.metadata,
    };
    // Omitted (operator binary hasn't upgraded to this contract yet) leaves
    // the previously-reported catalog/timestamp untouched, same "don't
    // clobber with nothing" reasoning markHeartbeat already uses for
    // resourceCapacity below.
    if (args.catalog) {
      patch.catalog = args.catalog;
      patch.catalogReportedAt = Date.now();
    }
    await ctx.db.patch(operator._id, patch);
    return { operatorId: operator._id };
  },
  returns: v.union(v.object({ operatorId: v.id("operators") }), v.null()),
});

// Admin cleanup — e.g. removing a stale/test registration row. Internal
// only: never exposed to the browser (see deleteCluster above for the
// browser-facing equivalent).
export const remove = internalMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});

// resourceCapacity is report-only, for the admin fleet-visibility view (see
// operators/queries.ts#listClusters) — never read by claim/listClaimable; the
// fit decision lives entirely on the operator side (see
// ai-cloud-operator's internal/capacity package). Omitted (old operator
// binary, or this tick's local Snapshot errored) leaves the previous value
// untouched rather than overwriting it with zeros.
export const markHeartbeat = internalMutation({
  args: {
    operatorId: v.id("operators"),
    resourceCapacity: v.optional(
      v.object({
        allocatableMemoryBytes: v.number(),
        allocatableMilliCpu: v.number(),
        usedMemoryBytes: v.number(),
        usedMilliCpu: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const patch: {
      healthStatus: "healthy";
      lastHeartbeatAt: number;
      resourceCapacity?: {
        allocatableMemoryBytes: number;
        allocatableMilliCpu: number;
        reportedAt: number;
        usedMemoryBytes: number;
        usedMilliCpu: number;
      };
    } = {
      healthStatus: "healthy",
      lastHeartbeatAt: Date.now(),
    };
    if (args.resourceCapacity) {
      patch.resourceCapacity = {
        ...args.resourceCapacity,
        reportedAt: Date.now(),
      };
    }
    await ctx.db.patch(args.operatorId, patch);
    return null;
  },
  returns: v.null(),
});

const computeHealthStatus = (
  referenceAt: number,
  retentionPolicy: "standard" | "retain"
): "healthy" | "offline" | "ready_to_destroy" => {
  const age = Date.now() - referenceAt;
  if (age <= ONE_HOUR_MS) {
    return "healthy";
  }
  if (age <= ONE_WEEK_MS || retentionPolicy === "retain") {
    return "offline";
  }
  return "ready_to_destroy";
};

// Cron target (see convex/crons.ts). Sweeps every claimed operator and
// recomputes healthStatus from time since last signal. Idempotent — only
// patches rows whose computed status actually differs — and skips "pending"
// rows entirely; those stay pending until claim() fires.
export const promoteHealthStatuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(500);
    const patches = operators.flatMap((operator) => {
      if (operator.healthStatus === "pending") {
        return [];
      }
      const referenceAt = operator.lastHeartbeatAt ?? operator.claimedAt;
      if (referenceAt === undefined) {
        return [];
      }
      const target = computeHealthStatus(referenceAt, operator.retentionPolicy);
      if (target === operator.healthStatus) {
        return [];
      }
      return [ctx.db.patch(operator._id, { healthStatus: target })];
    });
    await Promise.all(patches);
    return null;
  },
  returns: v.null(),
});
