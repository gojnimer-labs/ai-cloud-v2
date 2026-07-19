/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CatalogTemplate } from "./operators/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedOperator = async (
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    catalog: CatalogTemplate[];
    deployToken: string;
    externalUrl: string;
    healthStatus: "pending" | "healthy" | "offline" | "ready_to_destroy";
    tags: string[];
  }> = {}
): Promise<Id<"operators">> =>
  await t.run((ctx) =>
    ctx.db.insert("operators", {
      catalog: overrides.catalog,
      deployToken: overrides.deployToken,
      externalUrl: overrides.externalUrl,
      healthStatus: overrides.healthStatus ?? "healthy",
      name: "test-operator",
      registeredAt: Date.now(),
      retentionPolicy: "standard",
      tags: overrides.tags,
    })
  );

const catalogTemplate = (
  overrides: Partial<CatalogTemplate> = {}
): CatalogTemplate => ({
  description: "Test template",
  entrypoints: [],
  icon: "🧪",
  id: "nginx",
  name: "Nginx",
  parameters: [],
  version: "v1",
  ...overrides,
});

// --- listMergedCatalog ---------------------------------------------------
// Directly exercises the core requirement: identical id+version reported by
// multiple operators collapses to one entry, while distinct versions of the
// same id stay separate.

test("listMergedCatalog: dedupes the same id+version reported by two operators into one entry", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
    tags: ["us"],
  });
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
    tags: ["eu"],
  });

  const results = await t.query(api.operators.queries.listMergedCatalog, {});
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    id: "nginx",
    operatorCount: 2,
    version: "v1",
  });
  expect(results[0].availableTags.toSorted()).toEqual(["eu", "us"]);
});

test("listMergedCatalog: keeps two different versions of the same template id as separate entries", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
  });
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v2" })],
  });

  const results = await t.query(api.operators.queries.listMergedCatalog, {});
  expect(results).toHaveLength(2);
  expect(results.map((r) => r.version).toSorted()).toEqual(["v1", "v2"]);
});

test("listMergedCatalog: an operator with no reported catalog contributes nothing", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t);

  const results = await t.query(api.operators.queries.listMergedCatalog, {});
  expect(results).toHaveLength(0);
});

// --- getRepresentativeForTags --------------------------------------------
// This internal query now gates on templateId+templateVersion in addition
// to tags, so a specific version picked in step 1 of the New Workload
// dialog only resolves to an operator that actually self-reports it.

test("getRepresentativeForTags: matches an operator whose catalog reports the exact id+version", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
    deployToken: "token",
    externalUrl: "https://operator.example.com",
    tags: ["gpu"],
  });

  const result = await t.query(
    internal.operators.queries.getRepresentativeForTags,
    { desiredOperatorTags: ["gpu"], templateId: "nginx", templateVersion: "v1" }
  );
  expect(result).toMatchObject({ externalUrl: "https://operator.example.com" });
});

test("getRepresentativeForTags: rejects an operator whose tags match but catalog version doesn't", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
    deployToken: "token",
    externalUrl: "https://operator.example.com",
    tags: ["gpu"],
  });

  const result = await t.query(
    internal.operators.queries.getRepresentativeForTags,
    { desiredOperatorTags: ["gpu"], templateId: "nginx", templateVersion: "v2" }
  );
  expect(result).toBeNull();
});

test("getRepresentativeForTags: rejects an operator whose catalog version matches but tags don't", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
    deployToken: "token",
    externalUrl: "https://operator.example.com",
    tags: ["gpu"],
  });

  const result = await t.query(
    internal.operators.queries.getRepresentativeForTags,
    {
      desiredOperatorTags: ["missing-tag"],
      templateId: "nginx",
      templateVersion: "v1",
    }
  );
  expect(result).toBeNull();
});

// --- getTemplateByIdAndVersion --------------------------------------------

test("getTemplateByIdAndVersion: returns the matching template from any reporting operator", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [
      catalogTemplate({ description: "v1 build", id: "nginx", version: "v1" }),
    ],
  });

  const result = await t.query(
    internal.operators.queries.getTemplateByIdAndVersion,
    { templateId: "nginx", templateVersion: "v1" }
  );
  expect(result).toMatchObject({ description: "v1 build", version: "v1" });
});

test("getTemplateByIdAndVersion: returns null when no operator reports that id+version", async () => {
  const t = convexTest(schema, modules);
  await seedOperator(t, {
    catalog: [catalogTemplate({ id: "nginx", version: "v1" })],
  });

  const result = await t.query(
    internal.operators.queries.getTemplateByIdAndVersion,
    { templateId: "nginx", templateVersion: "v2" }
  );
  expect(result).toBeNull();
});
