/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
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

const presetArgs = (
  overrides: Partial<{
    allowedEntrypoints: string[];
    allowedLifecycleActions: ("destroy" | "redeploy" | "resume" | "stop")[];
    allowedOperations: string[];
    desiredOperatorTags: string[];
    displayName: string;
    groupIds: Id<"groups">[];
    params: Record<string, unknown>;
    templateId: string;
    templateVersion: string;
    thumbnailFileId: Id<"files"> | undefined;
  }> = {}
) => ({
  allowedEntrypoints: overrides.allowedEntrypoints ?? [],
  allowedLifecycleActions: overrides.allowedLifecycleActions ?? [],
  allowedOperations: overrides.allowedOperations ?? [],
  desiredOperatorTags: overrides.desiredOperatorTags ?? [],
  displayName: overrides.displayName ?? "My Preset",
  groupIds: overrides.groupIds ?? [],
  params: overrides.params ?? { color: "blue" },
  templateId: overrides.templateId ?? "nginx",
  templateVersion: overrides.templateVersion ?? "v1",
  thumbnailFileId: overrides.thumbnailFileId,
});

const createPreset = async (
  t: ReturnType<typeof convexTest>,
  overrides: Parameters<typeof presetArgs>[0] = {}
): Promise<Id<"presets">> =>
  await t.mutation(internal.presets.mutations.createPresetInternal, {
    ...presetArgs(overrides),
    createdBy: "admin_a",
  });

test("createPreset rejects an unauthenticated/non-admin caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.presets.mutations.createPreset, presetArgs())
  ).rejects.toThrow("Admin access required");
});

// --- createPresetInternal ----------------------------------------------------

test("createPresetInternal starts at version 1 with exactly one snapshot", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t);

  const preset = await t.run((ctx) => ctx.db.get(presetId));
  expect(preset?.currentVersion).toBe(1);

  const versions = await t.run((ctx) =>
    ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(versions).toHaveLength(1);
  expect(versions[0].version).toBe(1);
  expect(preset?.latestVersionId).toBe(versions[0]._id);
});

test("createPresetInternal creates presetGroups rows for the given groupIds", async () => {
  const t = convexTest(schema, modules);
  const groupA = await seedGroup(t);
  const groupB = await seedGroup(t);
  const presetId = await createPreset(t, { groupIds: [groupA, groupB] });

  const groupRows = await t.run((ctx) =>
    ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(new Set(groupRows.map((row) => row.groupId))).toEqual(
    new Set([groupA, groupB])
  );
});

// --- updatePresetInternal — version-bump semantics ---------------------------

test("updatePresetInternal does NOT bump the version on a metadata-only change", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t, { displayName: "Original" });

  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    ...presetArgs({ displayName: "Renamed" }),
    createdBy: "admin_a",
    presetId,
  });

  const preset = await t.run((ctx) => ctx.db.get(presetId));
  expect(preset?.displayName).toBe("Renamed");
  expect(preset?.currentVersion).toBe(1);

  const versions = await t.run((ctx) =>
    ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(versions).toHaveLength(1);
});

test("updatePresetInternal DOES bump the version when params change", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t, { params: { color: "blue" } });

  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    ...presetArgs({ params: { color: "red" } }),
    createdBy: "admin_a",
    presetId,
  });

  const preset = await t.run((ctx) => ctx.db.get(presetId));
  expect(preset?.currentVersion).toBe(2);

  const versions = await t.run((ctx) =>
    ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(versions).toHaveLength(2);
  const v1 = versions.find((v) => v.version === 1);
  expect(v1?.params).toEqual({ color: "blue" });
  const v2 = versions.find((v) => v.version === 2);
  expect(v2?.params).toEqual({ color: "red" });
  expect(preset?.latestVersionId).toBe(v2?._id);
});

test("updatePresetInternal DOES bump the version when templateVersion changes", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t, { templateVersion: "v1" });

  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    ...presetArgs({ templateVersion: "v2" }),
    createdBy: "admin_a",
    presetId,
  });

  const preset = await t.run((ctx) => ctx.db.get(presetId));
  expect(preset?.currentVersion).toBe(2);
  expect(preset?.templateVersion).toBe("v2");
});

test("updatePresetInternal does NOT bump when params are equal but key-reordered", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t, { params: { a: 1, b: 2 } });

  // Deliberately reversed insertion order — the whole point of this test is
  // that isSnapshotEquivalent's stable-stringify ignores key order, so this
  // is not a style violation to auto-sort away.
  // oxlint-disable-next-line sort-keys
  const reordered = { b: 2, a: 1 };
  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    ...presetArgs({ params: reordered }),
    createdBy: "admin_a",
    presetId,
  });

  const preset = await t.run((ctx) => ctx.db.get(presetId));
  expect(preset?.currentVersion).toBe(1);
});

test("updatePresetInternal rejects an unknown presetId", async () => {
  const t = convexTest(schema, modules);
  const presetId = await createPreset(t);
  await t.run((ctx) => ctx.db.delete(presetId));

  await expect(
    t.mutation(internal.presets.mutations.updatePresetInternal, {
      ...presetArgs(),
      createdBy: "admin_a",
      presetId,
    })
  ).rejects.toThrow("Preset not found");
});

// --- setPresetGroupsInternal --------------------------------------------------

test("setPresetGroupsInternal replaces a preset's groups to match the desired set", async () => {
  const t = convexTest(schema, modules);
  const kept = await seedGroup(t);
  const removed = await seedGroup(t);
  const added = await seedGroup(t);
  const presetId = await createPreset(t, { groupIds: [kept, removed] });

  await t.mutation(internal.presets.mutations.setPresetGroupsInternal, {
    groupIds: [kept, added],
    presetId,
  });

  const groupRows = await t.run((ctx) =>
    ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(new Set(groupRows.map((row) => row.groupId))).toEqual(
    new Set([kept, added])
  );
});

// --- deletePresetInternal -----------------------------------------------------

test("deletePresetInternal cascades to presetVersions and presetGroups rows", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  const presetId = await createPreset(t, { groupIds: [groupId] });
  await t.mutation(internal.presets.mutations.updatePresetInternal, {
    ...presetArgs({ groupIds: [groupId], params: { color: "red" } }),
    createdBy: "admin_a",
    presetId,
  });

  await t.mutation(internal.presets.mutations.deletePresetInternal, {
    presetId,
  });

  expect(await t.run((ctx) => ctx.db.get(presetId))).toBeNull();
  const versions = await t.run((ctx) =>
    ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(versions).toHaveLength(0);
  const groupRows = await t.run((ctx) =>
    ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", presetId))
      .collect()
  );
  expect(groupRows).toHaveLength(0);
});
