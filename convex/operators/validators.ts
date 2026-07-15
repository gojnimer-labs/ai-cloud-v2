import { v } from "convex/values";

// Shared catalog-shape validators — used by operators/actions.ts (catalog
// fetch/resolve) and workloads/actions.ts (operation-invoke response), so
// they live in their own module rather than inside either actions.ts.

const selectOptionValidator = v.object({
  label: v.string(),
  value: v.string(),
});

// Discriminated union rather than one object with an optional sourceKey:
// only "dynamic" ever carries a sourceKey, and this shape makes the other
// two kinds carrying one unconstructible instead of just unlikely.
export const dataSourceValidator = v.union(
  v.object({ kind: v.literal("static") }),
  v.object({ kind: v.literal("dynamic"), sourceKey: v.string() }),
  v.object({ kind: v.literal("system") })
);

export const visibilityValidator = v.object({
  dependsOn: v.string(),
  op: v.union(v.literal("equals"), v.literal("notEquals"), v.literal("oneOf")),
  value: v.optional(v.any()),
  values: v.optional(v.array(v.any())),
});

export const validationRuleValidator = v.object({
  max: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  min: v.optional(v.number()),
  regex: v.optional(v.string()),
});

export const parameterValidator = v.object({
  dataSource: dataSourceValidator,
  default: v.optional(v.any()),
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  options: v.optional(v.array(selectOptionValidator)),
  required: v.boolean(),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select")
  ),
  validation: v.optional(validationRuleValidator),
  visibility: v.optional(visibilityValidator),
});

// An Operation is a named action a template exposes against an
// already-running workload (e.g. "backup_state" on firefox/chrome) —
// distinct from a template's own deploy-time parameters, discovered the
// same way: it's part of the catalog response. Renamed from
// "customFunction" to match ai-cloud-operator's current terminology.
export const operationValidator = v.object({
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  parameters: v.array(parameterValidator),
  // Catalog-level hint: true means safe to re-invoke on our own interval
  // (side-effect-free read), false means it does real work and should only
  // run on explicit user action. Purely informational — Convex builds
  // whatever polling policy it wants on top, the operator does nothing
  // special with this value itself.
  refreshable: v.boolean(),
});

export const templateValidator = v.object({
  description: v.string(),
  icon: v.string(),
  id: v.string(),
  name: v.string(),
  operations: v.optional(v.array(operationValidator)),
  parameters: v.array(parameterValidator),
  // Manually-bumped by the operator whenever this template's parameters
  // change. The operator never reads/enforces this itself — purely
  // informational, currently unused here beyond being piped through to the
  // frontend for a future presets feature.
  version: v.string(),
});

export type CatalogTemplate = typeof templateValidator.type;
export type CatalogOperation = typeof operationValidator.type;
export type CatalogParameter = typeof parameterValidator.type;

// POST /workloads/{namespace}/{name}/functions/{key} response shape.
export const additionalInfoValidator = v.object({
  name: v.string(),
  type: v.union(v.literal("secret"), v.literal("plain")),
  // The operator's Go struct is `Value any` — not guaranteed to be a
  // string, the doc's examples just happen to show strings.
  value: v.any(),
});

export const operationResultValidator = v.object({
  additionalInfo: v.array(additionalInfoValidator),
});

export type OperationResult = typeof operationResultValidator.type;
