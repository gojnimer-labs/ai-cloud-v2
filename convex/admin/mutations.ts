import { v } from "convex/values";

import { internal } from "../_generated/api";
import { env, internalMutation } from "../_generated/server";
import { authComponent, createAuthOptions } from "../auth";
import { adminMutation } from "../functions";
import { generateToken, hashToken } from "../operators/crypto";
import { r2 } from "../storage/r2";

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

// Single-workload lifecycle actions for the admin Fleet view — unlike
// stopAllWorkloadsForUser/resumeAllWorkloadsForUser above (which bypass the
// per-row status guard for a bulk ban/unban flow), these go through the
// exact same internal mutations workloads/actions.ts's owner-facing actions
// use, so an admin gets the identical status-transition guards a user does —
// just without the ownership check, since admin intentionally acts across
// every user's workloads. Each internal mutation throws its own "not found"/
// "cannot X a workload with status Y" error, so there's nothing to re-check
// here.
export const adminRequestStop = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.requestStop, args);
    return null;
  },
  returns: v.null(),
});

export const adminRequestResume = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.requestResume, args);
    return null;
  },
  returns: v.null(),
});

export const adminRequestDestroy = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.requestDestroy, args);
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
// pattern as deleteCluster above. Deletes the R2 object first so a failure
// there (e.g. already-gone object) leaves the Convex row in place rather
// than orphaning R2 storage the row was the only pointer to.
export const deleteFile = adminMutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return null;
    }
    await r2.deleteObject(ctx, file.r2Key);
    await ctx.db.delete(args.fileId);
    return null;
  },
  returns: v.null(),
});

const INVITE_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

// Creates an invite directly through the same adapter Better Auth itself
// uses, instead of going through better-invite's own /invite/create.
//
// better-invite's create-invite route always builds the shareable link by
// resolving it against `ctx.context.baseURL` (this app's Convex *site* URL,
// e.g. https://site-xxx.gojlevicius.com) — see
// node_modules/better-invite/dist/utils.mjs#createRedirectURL — even when a
// custom invite URL template is configured, because it string-concatenates
// the template onto that origin rather than treating it as its own base.
// There's no way to point the generated link at this app's actual frontend
// origin (a different domain from the Convex site, per the crossDomain
// plugin already in use), so every link it built pointed at the backend,
// which has no page there → the browser landed on nothing useful, then
// fell through to /sign-in. Writing the invite row ourselves and building
// the link client-side (`${origin}/invite/${token}`, see InviteFormDialog)
// sidesteps that entirely.
export const createInvite = adminMutation({
  args: {
    email: v.optional(v.string()),
    // Default group(s) to assign to the invited user at signup — see
    // convex/auth.ts's applyInviteGroups hook.
    groupIds: v.optional(v.array(v.id("groups"))),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const token = crypto.randomUUID();
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.create({
      data: {
        createdAt: Date.now(),
        createdByUserId: ctx.user._id,
        email: args.email,
        expiresAt: Date.now() + INVITE_EXPIRES_MS,
        groupIds: args.groupIds,
        infinityMaxUses: false,
        maxUses: 1,
        // Only meaningful for the *already-signed-in* upgrade path (see
        // hooks.mjs's `after` hook and activate-invite.mjs's authenticated
        // branch) — the brand-new-account signup path resolves this same
        // field the exact same way, as a real HTTP redirect the browser
        // follows before our own client code ever runs, so it has to be a
        // real, working, ABSOLUTE url. A relative one (e.g. "/") would hit
        // the same cross-origin bug documented above: better-invite
        // resolves it against the Convex *site* URL, not this app's
        // frontend origin, and `new URL(absolute, base)` is the only way to
        // make it ignore that base and land on the frontend instead. Left
        // unset (redirecting to a broken /error url on the Convex site)
        // when SITE_URL isn't configured — signup still succeeds either
        // way, this only affects where the browser ends up afterward.
        redirectToAfterUpgrade: env.SITE_URL
          ? new URL("/", env.SITE_URL).toString()
          : undefined,
        role: args.role,
        shareInviterName: true,
        status: "pending",
        token,
      },
      model: "invite",
    });
    return { token };
  },
  returns: v.object({ token: v.string() }),
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
