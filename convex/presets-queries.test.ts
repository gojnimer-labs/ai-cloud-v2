/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedGroup = async (
  t: ReturnType<typeof convexTest>,
  name = `group-${Math.random().toString(36).slice(2, 8)}`
): Promise<Id<"groups">> =>
  await t.run((ctx) =>
    ctx.db.insert("groups", { badgeColor: "blue", createdAt: Date.now(), name })
  );

const createPreset = async (
  t: ReturnType<typeof convexTest>,
  groupIds: Id<"groups">[] = []
): Promise<Id<"presets">> =>
  await t.mutation(internal.presets.mutations.createPresetInternal, {
    allowedEntrypoints: [],
    allowedLifecycleActions: [],
    allowedOperations: [],
    createdBy: "admin_a",
    desiredOperatorTags: [],
    displayName: "My Preset",
    groupIds,
    params: { color: "blue" },
    templateId: "nginx",
    templateVersion: "v1",
    thumbnailFileId: undefined,
  });

// --- getDeployableSnapshotInternal — the actual deploy authorization check --

test("getDeployableSnapshotInternal returns null for a preset with zero groups, even for a would-be member", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t, []);

  const result = await t.query(
    internal.presets.queries.getDeployableSnapshotInternal,
    { presetId, userId: "user_a" }
  );
  expect(result).toBeNull();
});

test("getDeployableSnapshotInternal returns null for an authenticated non-member", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  const presetId = await createPreset(t, [groupId]);
  await t.run((ctx) =>
    ctx.db.insert("groupMembers", { groupId, userId: "user_member" })
  );

  const result = await t.query(
    internal.presets.queries.getDeployableSnapshotInternal,
    { presetId, userId: "user_outsider" }
  );
  expect(result).toBeNull();
});

test("getDeployableSnapshotInternal returns the latest snapshot for a group member", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  const presetId = await createPreset(t, [groupId]);
  await t.run((ctx) =>
    ctx.db.insert("groupMembers", { groupId, userId: "user_member" })
  );

  const result = await t.query(
    internal.presets.queries.getDeployableSnapshotInternal,
    { presetId, userId: "user_member" }
  );
  expect(result).not.toBeNull();
  expect(result?.templateId).toBe("nginx");
  expect(result?.templateVersion).toBe("v1");
  expect(result?.params).toEqual({ color: "blue" });
});

test("getDeployableSnapshotInternal returns the CURRENT snapshot after a version bump, not the original one", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  const presetId = await createPreset(t, [groupId]);
  await t.run((ctx) =>
    ctx.db.insert("groupMembers", { groupId, userId: "user_member" })
  );

  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    allowedEntrypoints: [],
    allowedLifecycleActions: [],
    allowedOperations: [],
    createdBy: "admin_a",
    desiredOperatorTags: [],
    displayName: "My Preset",
    groupIds: [groupId],
    params: { color: "red" },
    presetId,
    templateId: "nginx",
    templateVersion: "v1",
    thumbnailFileId: undefined,
  });

  const result = await t.query(
    internal.presets.queries.getDeployableSnapshotInternal,
    { presetId, userId: "user_member" }
  );
  expect(result?.params).toEqual({ color: "red" });
});

test("getDeployableSnapshotInternal returns null for a nonexistent preset", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  const presetId = await createPreset(t, [groupId]);
  await t.run((ctx) => ctx.db.delete(presetId));

  const result = await t.query(
    internal.presets.queries.getDeployableSnapshotInternal,
    { presetId, userId: "user_a" }
  );
  expect(result).toBeNull();
});
