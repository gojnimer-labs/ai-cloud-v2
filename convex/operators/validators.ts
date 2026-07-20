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
  // just a more specific label for the file-download-URL case. direction
  // says whether Convex mints a fresh upload target (direction "upload",
  // using group to know which files-table group the result belongs to) or
  // resolves a selected file into a URL (direction "download", using
  // sourceParam to find which other parameter holds the selected files-
  // table row id) — see requestWorkload/adminRunOperation in workloads/
  // actions.ts, which dispatch on these generically instead of hardcoding
  // parameter names.
  v.object({
    direction: v.union(v.literal("upload"), v.literal("download")),
    group: v.optional(v.string()),
    kind: v.literal("file"),
    sourceParam: v.optional(v.string()),
  }),
  // A Select whose options are files Convex resolves from its own files
  // table (see files/queries.ts#listByGroup), scoped by group — the
  // files-table counterpart to "dynamic"/selectOptions.
  v.object({ group: v.string(), kind: v.literal("fileOptions") })
);

export const visibilityValidator = v.object({
  dependsOn: v.string(),
  op: v.union(v.literal("equals"), v.literal("notEquals"), v.literal("oneOf")),
  value: v.optional(v.any()),
  values: v.optional(v.array(v.any())),
});

// Always present on a parameter (unlike visibilityValidator, genuinely
// optional) — required needs a value regardless of whether anything else
// constrains the field. Mirrors ai-cloud-operator's Validation struct,
// which made the same move for the same reason (see its own doc comment).
export const validationRuleValidator = v.object({
  max: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  min: v.optional(v.number()),
  regex: v.optional(v.string()),
  required: v.boolean(),
});

export const parameterValidator = v.object({
  dataSource: dataSourceValidator,
  default: v.optional(v.any()),
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  options: v.optional(v.array(selectOptionValidator)),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select")
  ),
  validation: validationRuleValidator,
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
// adminRunOperation returns to the *client*, and (unlike rounds 1-3) also
// exactly what it parses from the operator's raw response: additionalInfo
// is always pure display data now, secret/plain only, nothing for
// adminRunOperation to strip.
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

const fileResultValidator = v.object({ label: v.string(), type: v.string() });

// Raw shape of the operator's function-call response (see
// catalog.OperationResult in ai-cloud-operator). `file` is set when the
// call produced a file worth recording (see workloads/actions.ts#
// adminRunOperation, which creates the files row itself using data only
// Convex holds) — never forwarded to the client, unlike additionalInfo.
export const operatorFunctionResultValidator = v.object({
  additionalInfo: v.array(additionalInfoValidator),
  file: v.optional(fileResultValidator),
});

export type OperatorFunctionResult =
  typeof operatorFunctionResultValidator.type;
