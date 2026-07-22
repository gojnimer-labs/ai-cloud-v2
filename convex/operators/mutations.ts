import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";
import { appError } from "../lib/errors";
import { generateToken, hashToken } from "./crypto";
import type { CatalogTemplate } from "./validators";
import { templateValidator } from "./validators";

// Order-insensitive: tags are conceptually a set, and updateCluster below
// must treat a no-op edit (the admin's form round-tripping the same tags
// back, possibly reordered) as "unchanged" rather than an attempted change.
const tagsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = a.toSorted();
  const sortedB = b.toSorted();
  return sortedA.every((tag, i) => tag === sortedB[i]);
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * ONE_HOUR_MS;

// healthy -> offline cutoff. The operator heartbeats every 30s
// (HEARTBEAT_INTERVAL in ai-cloud-operator, see cmd/main.go) and restarts
// fast (no slow image pulls/init steps holding up a fresh pod's first
// heartbeat), so 6 missed heartbeats in a row is already a strong,
// low-false-positive signal something's actually wrong - not a coarse
// placeholder from before the operator's heartbeat loop was this reliable.
// Matters beyond just the fleet-health display: sweepStaleClaims'
// confirmed-offline fast path (see workloads/mutations.ts#releaseClaim) is
// the ONLY thing that unsticks a redeploying/stopping/resuming claim held
// by a genuinely-dead operator - those states have no equivalent to
// provisioning's own silent-lease-timeout self-resolution - so how long
// this takes to flip directly bounds how long such a workload stays frozen
// after its owning operator crashes.
const OFFLINE_THRESHOLD_MS = 3 * 60 * 1000;

const retentionPolicyValidator = v.union(
  v.literal("standard"),
  v.literal("retain")
);

const createClusterArgs = {
  description: v.optional(v.string()),
  name: v.string(),
  region: v.optional(v.string()),
  retentionPolicy: retentionPolicyValidator,
  tags: v.optional(v.array(v.string())),
};

const createClusterReturns = v.object({
  enrollmentToken: v.string(),
  operatorId: v.id("operators"),
});

// Shared by createCluster and its internalMutation twin below (used only by
// tests, so the adminMutation wrapper's success path stays exercisable
// without seeding a real Better Auth admin session — see
// operators-mutations.test.ts). Inserts both the operators row and its
// companion operatorHeartbeats row so every operator has exactly one from
// the moment it's created (see schema.ts's operatorHeartbeats doc comment).
const insertCluster = async (
  ctx: MutationCtx,
  args: {
    description?: string;
    name: string;
    region?: string;
    retentionPolicy: "standard" | "retain";
    tags?: string[];
  }
) => {
  const enrollmentToken = generateToken();
  const enrollmentTokenHash = await hashToken(enrollmentToken);
  const operatorId = await ctx.db.insert("operators", {
    description: args.description,
    enrollmentTokenHash,
    name: args.name,
    region: args.region,
    registeredAt: Date.now(),
    retentionPolicy: args.retentionPolicy,
    tags: args.tags,
  });
  await ctx.db.insert("operatorHeartbeats", {
    healthStatus: "pending",
    operatorId,
  });
  return { enrollmentToken, operatorId };
};

// Pre-registers a cluster before any real operator instance exists. Mints a
// fresh enrollment token, stores only its hash, and returns the raw value
// ONCE — the admin copies it into that cluster's own ai-cloud-operator-env
// k8s Secret. Convex never persists the raw value (same pattern as
// deployToken/heartbeatToken in operators/http.ts#register).
export const createCluster = adminMutation({
  args: createClusterArgs,
  handler: async (ctx, args) => await insertCluster(ctx, args),
  returns: createClusterReturns,
});

// Test-only twin of createCluster's logic — lets
// operators-mutations.test.ts exercise the dual-insert invariant directly
// without seeding a real Better Auth admin session (no precedent for that
// anywhere in this repo).
export const createClusterInternal = internalMutation({
  args: createClusterArgs,
  handler: async (ctx, args) => await insertCluster(ctx, args),
  returns: createClusterReturns,
});

const updateClusterArgs = {
  description: v.optional(v.string()),
  name: v.string(),
  operatorId: v.id("operators"),
  region: v.optional(v.string()),
  retentionPolicy: retentionPolicyValidator,
  tags: v.array(v.string()),
};

// Shared by updateCluster and its internalMutation twin below (same
// test-seeding rationale as insertCluster above). Full-replace edit of
// admin-owned metadata only — never touches externalUrl/deployToken/
// heartbeatTokenHash/healthStatus/claimedAt. Rejects an attempted tags
// change once the operator has self-reported its own (see
// operators/http.ts#register / claim's tagsSetByOperator) — every other
// field still updates normally in that case.
const updateClusterHandler = async (
  ctx: MutationCtx,
  args: {
    description?: string;
    name: string;
    operatorId: Id<"operators">;
    region?: string;
    retentionPolicy: "standard" | "retain";
    tags: string[];
  }
) => {
  const operator = await ctx.db.get(args.operatorId);
  if (!operator) {
    throw appError("operator.not_found");
  }
  if (
    operator.tagsSetByOperator &&
    !tagsEqual(operator.tags ?? [], args.tags)
  ) {
    throw appError("operator.tags_locked");
  }
  await ctx.db.patch(args.operatorId, {
    description: args.description,
    name: args.name,
    region: args.region,
    retentionPolicy: args.retentionPolicy,
    tags: args.tags,
  });
  return null;
};

export const updateCluster = adminMutation({
  args: updateClusterArgs,
  handler: async (ctx, args) => await updateClusterHandler(ctx, args),
  returns: v.null(),
});

// Test-only twin of updateCluster's logic — lets
// operators-mutations.test.ts exercise the tag-lock guard directly without
// seeding a real Better Auth admin session.
export const updateClusterInternal = internalMutation({
  args: updateClusterArgs,
  handler: async (ctx, args) => await updateClusterHandler(ctx, args),
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

// Deletes an operator's companion operatorHeartbeats row, if it has one —
// shared by deleteCluster/remove below so deleting an operator never leaves
// an orphaned heartbeat row behind.
const deleteHeartbeat = async (
  ctx: MutationCtx,
  operatorId: Id<"operators">
) => {
  const heartbeat = await ctx.db
    .query("operatorHeartbeats")
    .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
    .unique();
  if (heartbeat) {
    await ctx.db.delete(heartbeat._id);
  }
};

// Browser-facing delete, confirmed client-side via AlertDialog. Distinct
// from the internal-only `remove` below.
export const deleteCluster = adminMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await deleteHeartbeat(ctx, args.operatorId);
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
// Looks up an operator's operatorHeartbeats row, if any — shared by
// claim/markHeartbeat below, both of which upsert (patch if found, insert if
// not) rather than assuming createCluster's insert already guarantees one:
// this repo has no production data yet, so rows created before this table
// existed are handled by lazily creating their heartbeat row here instead of
// running a one-time backfill migration.
const getHeartbeat = async (ctx: MutationCtx, operatorId: Id<"operators">) =>
  await ctx.db
    .query("operatorHeartbeats")
    .withIndex("by_operatorId", (q) => q.eq("operatorId", operatorId))
    .unique();

export const claim = internalMutation({
  args: {
    catalog: v.optional(v.array(templateValidator)),
    deployToken: v.string(),
    enrollmentTokenHash: v.string(),
    externalUrl: v.string(),
    heartbeatTokenHash: v.string(),
    metadata: v.optional(v.any()),
    operatorVersion: v.optional(v.string()),
    // Explicit presence matters, not truthiness — an empty array is a
    // deliberate "I have no tags" report, still locking tagsSetByOperator
    // the same as a non-empty one (see convex/schema.ts's doc comment).
    tags: v.optional(v.array(v.string())),
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
      deployToken: string;
      externalUrl: string;
      heartbeatTokenHash: string;
      metadata: unknown;
      operatorVersion?: string;
      tags?: string[];
      tagsSetByOperator?: boolean;
    } = {
      deployToken: args.deployToken,
      externalUrl: args.externalUrl,
      heartbeatTokenHash: args.heartbeatTokenHash,
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
    if (args.operatorVersion) {
      patch.operatorVersion = args.operatorVersion;
    }
    if (args.tags) {
      patch.tags = args.tags;
      patch.tagsSetByOperator = true;
    }
    await ctx.db.patch(operator._id, patch);

    const heartbeat = await getHeartbeat(ctx, operator._id);
    const heartbeatPatch = {
      claimedAt: heartbeat?.claimedAt ?? Date.now(),
      healthStatus: "healthy" as const,
      lastHeartbeatAt: Date.now(),
    };
    await (heartbeat
      ? ctx.db.patch(heartbeat._id, heartbeatPatch)
      : ctx.db.insert("operatorHeartbeats", {
          operatorId: operator._id,
          ...heartbeatPatch,
        }));
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
    await deleteHeartbeat(ctx, args.operatorId);
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
// untouched rather than overwriting it with zeros. The hot path motivating
// the operators/operatorHeartbeats split: fired every heartbeat cycle, and
// now only ever touches this small row, never the operator's catalog
// array/tokens/metadata.
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
    const heartbeat = await getHeartbeat(ctx, args.operatorId);
    const resourceCapacity = args.resourceCapacity
      ? { ...args.resourceCapacity, reportedAt: Date.now() }
      : (heartbeat?.resourceCapacity ?? undefined);
    const patch = {
      healthStatus: "healthy" as const,
      lastHeartbeatAt: Date.now(),
      resourceCapacity,
    };
    await (heartbeat
      ? ctx.db.patch(heartbeat._id, patch)
      : ctx.db.insert("operatorHeartbeats", {
          operatorId: args.operatorId,
          ...patch,
        }));
    return null;
  },
  returns: v.null(),
});

const computeHealthStatus = (
  referenceAt: number,
  retentionPolicy: "standard" | "retain"
): "healthy" | "offline" | "ready_to_destroy" => {
  const age = Date.now() - referenceAt;
  if (age <= OFFLINE_THRESHOLD_MS) {
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
// rows (including operators with no heartbeat row at all yet) entirely;
// those stay pending until claim() fires.
export const promoteHealthStatuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(500);
    const retentionPolicyByOperatorId = new Map(
      operators.map((operator) => [operator._id, operator.retentionPolicy])
    );
    const heartbeats = await ctx.db.query("operatorHeartbeats").take(500);
    const patches = heartbeats.flatMap((heartbeat) => {
      if (heartbeat.healthStatus === "pending") {
        return [];
      }
      const retentionPolicy = retentionPolicyByOperatorId.get(
        heartbeat.operatorId
      );
      if (retentionPolicy === undefined) {
        return [];
      }
      const referenceAt = heartbeat.lastHeartbeatAt ?? heartbeat.claimedAt;
      if (referenceAt === undefined) {
        return [];
      }
      const target = computeHealthStatus(referenceAt, retentionPolicy);
      if (target === heartbeat.healthStatus) {
        return [];
      }
      return [ctx.db.patch(heartbeat._id, { healthStatus: target })];
    });
    await Promise.all(patches);
    return null;
  },
  returns: v.null(),
});
