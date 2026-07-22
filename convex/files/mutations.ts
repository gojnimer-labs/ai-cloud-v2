import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";
import { r2 } from "../storage/r2";

// The R2 group a preset thumbnail upload lands in (see presets table's
// thumbnailFileId and files/queries.ts#listFilesByGroup) — shared across
// every admin, unlike every other `files` group, which is scoped per-user.
export const PRESET_THUMBNAILS_GROUP = "preset_thumbnails";

// Records one file (see convex/schema.ts). Generic on purpose: any future
// group/type reuses this same mutation.
export const create = internalMutation({
  args: {
    createdAt: v.number(),
    group: v.string(),
    label: v.string(),
    r2Bucket: v.string(),
    r2Key: v.string(),
    type: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => await ctx.db.insert("files", args),
  returns: v.id("files"),
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
// mutation only manages the Convex-side record, same boundary the `create`
// mutation above (the operator-facing path) keeps.
export const createFile = adminMutation({
  args: fileFieldsValidator,
  handler: async (ctx, args) =>
    await ctx.db.insert("files", { ...args, createdAt: Date.now() }),
  returns: v.id("files"),
});

// Full-replace edit of every field except createdAt (the original record
// time).
export const updateFile = adminMutation({
  args: { fileId: v.id("files"), ...fileFieldsValidator },
  handler: async (ctx, args) => {
    const { fileId, ...fields } = args;
    await ctx.db.patch(fileId, fields);
    return null;
  },
  returns: v.null(),
});

// Records a files row for a thumbnail an admin just uploaded via
// useUploadFile(api.storage.r2Client) — distinct from createFile above
// (manual r2Bucket/r2Key/userId entry, used by the admin Files page)
// because here r2Bucket is resolved server-side (r2.config.bucket, never
// exposed to the client) and userId is always the calling admin, not an
// arbitrary owner picker. group is always PRESET_THUMBNAILS_GROUP — this
// mutation exists specifically for that one upload flow, not as a generic
// "record any upload" entry point.
export const recordUploadedThumbnail = adminMutation({
  args: { key: v.string(), label: v.string() },
  handler: async (ctx, args) =>
    await ctx.db.insert("files", {
      createdAt: Date.now(),
      group: PRESET_THUMBNAILS_GROUP,
      label: args.label,
      r2Bucket: r2.config.bucket,
      r2Key: args.key,
      type: "image",
      userId: ctx.user._id,
    }),
  returns: v.id("files"),
});

// Browser-facing delete, confirmed client-side via AlertDialog. Deletes the
// R2 object first so a failure there (e.g. already-gone object) leaves the
// Convex row in place rather than orphaning R2 storage the row was the only
// pointer to.
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
