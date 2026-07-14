import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAdminUser } from "../auth";
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
export const createCluster = mutation({
  args: {
    description: v.optional(v.string()),
    name: v.string(),
    region: v.optional(v.string()),
    retentionPolicy: retentionPolicyValidator,
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
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
export const updateCluster = mutation({
  args: {
    description: v.optional(v.string()),
    name: v.string(),
    operatorId: v.id("operators"),
    region: v.optional(v.string()),
    retentionPolicy: retentionPolicyValidator,
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
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
export const rerollEnrollmentToken = mutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const enrollmentToken = generateToken();
    const enrollmentTokenHash = await hashToken(enrollmentToken);
    await ctx.db.patch(args.operatorId, { enrollmentTokenHash });
    return { enrollmentToken };
  },
  returns: v.object({ enrollmentToken: v.string() }),
});

// Browser-facing delete, confirmed client-side via AlertDialog. Distinct
// from the existing internal-only operators.mutations.remove.
export const deleteCluster = mutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});
