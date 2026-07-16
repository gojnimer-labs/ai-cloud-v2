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
  v.object({ kind: v.literal("system") }),
  // Same rules as "system" (Convex-injected, never an editable form field) —
  // just a more specific label for the file-download-URL case. handler
  // names the convex/selectOptions/handlers.ts entry that knows how to
  // mint an upload target (direction "upload") or resolve a selected
  // row's payload into a URL (direction "download", using sourceParam to
  // find which other parameter holds the selected row id) — see
  // deployWorkload/runOperation in workloads/actions.ts, which dispatch on
  // these generically instead of hardcoding parameter names.
  v.object({
    direction: v.union(v.literal("upload"), v.literal("download")),
    handler: v.string(),
    kind: v.literal("file"),
    sourceParam: v.optional(v.string()),
  })
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

// A named web port a template's Service exposes. Always at least one per
// template — `name` is the mandatory gateway URL path segment
// (/gw/{namespace}/{name}/{entrypoint}/{subpath...}), `label` is what to
// show a user picking between entrypoints when a template declares more
// than one.
export const entrypointValidator = v.object({
  label: v.string(),
  name: v.string(),
});

export const templateValidator = v.object({
  description: v.string(),
  entrypoints: v.array(entrypointValidator),
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
export type Entrypoint = typeof entrypointValidator.type;

// POST /workloads/{namespace}/{name}/functions/{key} response shape — what
// runOperation returns to the *client*. Only secret/plain: insert_row/
// update_row/remove_row (see operatorAdditionalInfoValidator below) are
// processing directives runOperation consumes and strips server-side, the
// frontend never sees them.
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

// table is a curated row-directive registry key (see
// convex/rowDirectives/registry.ts), not a literal Convex table name
// handed to ctx.db directly — only tables with a registered target are
// reachable this way. fields is opaque here (v.any(), same reasoning as
// additionalInfoValidator's own value: v.any() above): its shape depends
// entirely on which table the directive targets, and only that target's
// own implementation (and the mutation it calls) validates it.
const insertRowValueValidator = v.object({
  fields: v.any(),
  table: v.string(),
});
const updateRowValueValidator = v.object({
  fields: v.any(),
  rowId: v.string(),
  table: v.string(),
});
const removeRowValueValidator = v.object({
  rowId: v.string(),
  table: v.string(),
});

// Raw shape of the operator's function-call response — broader than
// additionalInfoValidator above (what runOperation returns to the client):
// "*_row" entries are processing directives (see catalog.AdditionalInfo*Row
// in ai-cloud-operator) consumed server-side in runOperation and stripped
// before the client ever sees the result.
export const operatorAdditionalInfoValidator = v.union(
  v.object({ name: v.string(), type: v.literal("secret"), value: v.any() }),
  v.object({ name: v.string(), type: v.literal("plain"), value: v.any() }),
  v.object({
    name: v.string(),
    type: v.literal("insert_row"),
    value: insertRowValueValidator,
  }),
  v.object({
    name: v.string(),
    type: v.literal("update_row"),
    value: updateRowValueValidator,
  }),
  v.object({
    name: v.string(),
    type: v.literal("remove_row"),
    value: removeRowValueValidator,
  })
);

export const operatorFunctionResultValidator = v.object({
  additionalInfo: v.array(operatorAdditionalInfoValidator),
});

export type OperatorFunctionResult =
  typeof operatorFunctionResultValidator.type;
