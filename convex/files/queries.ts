import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { authComponent } from "../auth";
import { adminQuery } from "../functions";
import { resolveFileUrl } from "../storage/r2";

const fileDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("files"),
  createdAt: v.number(),
  group: v.string(),
  label: v.string(),
  r2Bucket: v.string(),
  r2Key: v.string(),
  type: v.string(),
  userId: v.string(),
});

// Lists every file in one group that belongs to the requesting user — the
// options a dataSource.kind:"fileOptions" catalog parameter offers. Scoped
// by userId so one user's files never appear in another user's dropdown
// (see convex/schema.ts).
export const listByGroup = internalQuery({
  args: { group: v.string(), userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("files")
      .withIndex("by_user_and_group", (q) =>
        q.eq("userId", args.userId).eq("group", args.group)
      )
      .collect(),
  returns: v.array(fileDoc),
});

// Lookup by row id, scoped to the requesting user — a foreign or
// nonexistent id both resolve to null identically, so a lookup never
// reveals whether an id merely doesn't exist vs. belongs to someone else.
export const get = internalQuery({
  args: { id: v.id("files"), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row && row.userId === args.userId ? row : null;
  },
  returns: v.union(fileDoc, v.null()),
});

// Lookup by row id, unscoped — used only by resolveFileParams's
// create-workload path (requestWorkload/deployPreset), where the catalog's
// preset gates which files a user can reach rather than row ownership.
// Every other file-param resolution (redeploy, run-operation, admin ops)
// still goes through `get` above.
export const getUnscoped = internalQuery({
  args: { id: v.id("files") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
  returns: v.union(fileDoc, v.null()),
});

const adminFileValidator = v.object({
  _id: v.id("files"),
  createdAt: v.number(),
  group: v.string(),
  label: v.string(),
  r2Bucket: v.string(),
  r2Key: v.string(),
  type: v.string(),
  userEmail: v.string(),
  userId: v.string(),
});

// Admin-only view across every user's files — unlike listByGroup/get above
// (both scoped to the requesting user), this reads unscoped since an admin
// needs to see and fix any user's rows, not just their own. Bounded rather
// than paginated — this is an admin overview, not something meant to scroll
// through thousands of rows.
export const listFiles = adminQuery({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db.query("files").order("desc").take(500);

    const userIds = [...new Set(files.map((file) => file.userId))];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    return files.map((file) => ({
      _id: file._id,
      createdAt: file.createdAt,
      group: file.group,
      label: file.label,
      r2Bucket: file.r2Bucket,
      r2Key: file.r2Key,
      type: file.type,
      userEmail: emailByUserId.get(file.userId) ?? file.userId,
      userId: file.userId,
    }));
  },
  returns: v.array(adminFileValidator),
});

// Every file in one group, across ALL admins — unlike listByGroup above
// (scoped to one user), this is the shared cross-admin thumbnail library
// the preset thumbnail picker's "select existing" tab browses (see
// presets/mutations.ts and files/mutations.ts#recordUploadedThumbnail's
// PRESET_THUMBNAILS_GROUP), using the files.by_group index rather than
// listFiles' bounded, unfiltered 500-row scan.
export const listFilesByGroup = adminQuery({
  args: { group: v.string() },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_group", (q) => q.eq("group", args.group))
      .order("desc")
      .take(200);
    return await Promise.all(
      files.map(async (file) => ({
        _id: file._id,
        label: file.label,
        thumbnailUrl: await resolveFileUrl(file),
      }))
    );
  },
  returns: v.array(
    v.object({
      _id: v.id("files"),
      label: v.string(),
      thumbnailUrl: v.string(),
    })
  ),
});
