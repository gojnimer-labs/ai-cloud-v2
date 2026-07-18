import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { authComponent, createAuthOptions } from "../auth";
import { adminMutation } from "../functions";
import { generateToken, hashToken } from "../operators/crypto";

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
// from the existing internal-only operators.mutations.remove.
export const deleteCluster = adminMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});

// Actual logic for stopAllWorkloadsForUser, split into its own internal
// mutation so it's directly testable (see admin-mutations.test.ts) without
// needing a full admin-authenticated identity in convex-test — the public
// wrapper below is the only thing gated by adminMutation (see
// convex/functions.ts). Scoped via
// `by_user` then filtered to `active` in memory (a bounded read, same
// `.take(100)` convention as workloads/queries.ts#listByUser) — only this
// user's active rows are ever touched, nothing else.
export const stopAllWorkloadsForUserInternal = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    const active = rows.filter((row) => row.status === "active");
    await Promise.all(
      active.map((row) => ctx.db.patch(row._id, { status: "requested_stop" }))
    );
    return null;
  },
  returns: v.null(),
});

// The actual ban-flow trigger: stops every currently-`active` workload
// belonging to the given user. Admin-gated, invoked directly (Convex
// dashboard or a small script) — no dedicated "Ban user" UI in this plan.
export const stopAllWorkloadsForUser = adminMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.admin.mutations.stopAllWorkloadsForUserInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

// The unban-flow mirror of stopAllWorkloadsForUserInternal above — same
// split for the same testability reason.
export const resumeAllWorkloadsForUserInternal = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    const stopped = rows.filter((row) => row.status === "stopped");
    await Promise.all(
      stopped.map((row) =>
        ctx.db.patch(row._id, { status: "requested_resume" })
      )
    );
    return null;
  },
  returns: v.null(),
});

// The unban-flow trigger: resumes every currently-`stopped` workload
// belonging to the given user. Same admin-gated, invoked-directly shape as
// stopAllWorkloadsForUser above.
export const resumeAllWorkloadsForUser = adminMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.admin.mutations.resumeAllWorkloadsForUserInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

const fileFieldsValidator = {
  group: v.string(),
  label: v.string(),
  r2Bucket: v.string(),
  r2Key: v.string(),
  type: v.string(),
  // authComponent user._id — the file's owner (see files/queries.ts).
  userId: v.string(),
};

// Admin-authored file row — bypasses the operator/R2 upload flow entirely,
// for manually registering or fixing a record. r2Bucket/r2Key must point
// at a real R2 object for the file to actually be downloadable; this
// mutation only manages the Convex-side record, same boundary
// files/mutations.ts#create (the operator-facing path) keeps.
export const createFile = adminMutation({
  args: fileFieldsValidator,
  handler: async (ctx, args) =>
    await ctx.db.insert("files", { ...args, createdAt: Date.now() }),
  returns: v.id("files"),
});

// Full-replace edit of every field except createdAt (the original record
// time, same reasoning as updateCluster never touching registeredAt).
export const updateFile = adminMutation({
  args: { fileId: v.id("files"), ...fileFieldsValidator },
  handler: async (ctx, args) => {
    const { fileId, ...fields } = args;
    await ctx.db.patch(fileId, fields);
    return null;
  },
  returns: v.null(),
});

// Browser-facing delete, confirmed client-side via AlertDialog — same
// pattern as deleteCluster above.
export const deleteFile = adminMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.fileId);
    return null;
  },
  returns: v.null(),
});

// Cancels any pending invite, regardless of who created it — see the doc
// comment on listInvites (queries.ts) for why this goes through the raw
// adapter instead of better-invite's own client-facing /invite/cancel
// (which only lets the original creator cancel).
export const cancelInvite = adminMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.update({
      model: "invite",
      update: { status: "canceled" },
      where: [{ field: "token", value: args.token }],
    });
    return null;
  },
  returns: v.null(),
});
