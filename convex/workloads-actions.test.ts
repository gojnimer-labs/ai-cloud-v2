/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import type { CatalogTemplate } from "./operators/validators";
import schema from "./schema";
import { createWorkloadFromSpec } from "./workloads/actions";

const modules = import.meta.glob("./**/*.ts");

// Only the rejection branch below is covered: any "file found" branch in
// resolveFileParams (which is what the sourcePresetId-set/preset-backed case
// exercises, and which is unchanged by this fix) calls resolveFileUrl, which
// mints a real presigned URL via the R2 component — untestable here since no
// test in this repo registers/mocks the r2 component yet.

// Same shape as workloads-mutations.test.ts's own seedOperator — kept as a
// local copy rather than shared, matching this repo's existing convention of
// small per-test-file fixture helpers over a shared test-utils module.
const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  overrides: { catalog?: CatalogTemplate[] } = {}
): Promise<Id<"operators">> =>
  await t.run(async (ctx) => {
    const operatorId = await ctx.db.insert("operators", {
      catalog: overrides.catalog,
      deployToken: "deploy-token",
      externalUrl: "https://operator.example.com",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
    });
    await ctx.db.insert("operatorHeartbeats", {
      healthStatus: "healthy",
      operatorId,
    });
    return operatorId;
  });

// One template with a single required file-download parameter, sourced from
// a "profileSource" raw param — matches ai-cloud-operator's
// profiles_firefox/profiles_chrome pattern (see operators/fileParams.ts).
const catalogTemplateWithFileParam = (): CatalogTemplate => ({
  description: "Test template",
  entrypoints: [],
  icon: "🧪",
  id: "nginx",
  name: "Nginx",
  parameters: [
    {
      dataSource: {
        direction: "download",
        kind: "file",
        sourceParam: "profileSource",
      },
      key: "profileUrl",
      label: "Profile",
      type: "string",
      validation: { required: true },
    },
  ],
  version: "v1",
});

const seedFile = async (
  t: ReturnType<typeof convexTest>,
  userId: string
): Promise<Id<"files">> =>
  await t.run((ctx) =>
    ctx.db.insert("files", {
      createdAt: Date.now(),
      group: "profiles_firefox",
      label: "profile.tar",
      r2Bucket: "test-bucket",
      r2Key: `files/${userId}/profile.tar`,
      type: "application/x-tar",
      userId,
    })
  );

// This is the IDOR createWorkloadFromSpec's enforceOwnership fix closes:
// requestWorkload never sets sourcePresetId, so (unlike deployPreset) it has
// no preset-level gate on which files it can reach — before the fix, a
// tampered params object could reference any user's file id and still
// resolve it. Asserting on the required-param rejection (rather than the
// resolved URL) keeps this test independent of resolveFileUrl/R2, which has
// no mock/registration anywhere in this test suite yet.
test("createWorkloadFromSpec: without a sourcePresetId, rejects a file param owned by a different user", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, { catalog: [catalogTemplateWithFileParam()] });
  const foreignFileId = await seedFile(t, "user_b");

  await expect(
    t.action((ctx) =>
      createWorkloadFromSpec(ctx, {
        desiredOperatorTags: [],
        params: { profileSource: foreignFileId },
        templateId: "nginx",
        templateVersion: "v1",
        userId: "user_a",
      })
    )
  ).rejects.toThrow(/Profile is required/u);
});
