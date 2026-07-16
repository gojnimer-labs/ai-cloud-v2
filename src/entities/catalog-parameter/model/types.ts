// Hand-mirrors convex/operators/validators.ts — the frontend has never
// imported action-internal types from convex/, only the generated api/Id,
// so this is kept in sync by hand, same pattern as the rest of this repo.

export type ParameterType = "string" | "number" | "boolean" | "select";

export type DataSource =
  | { kind: "static" }
  | { kind: "dynamic"; sourceKey: string }
  | { kind: "system" }
  // Same rules as "system" (Convex-injected, never an editable form field) —
  // just a more specific label for the file-download-URL case.
  // direction/handler/sourceParam aren't used by the frontend today (only
  // isServerManagedDataSource below cares about "file" at all) — kept here
  // for accuracy since this type is hand-mirrored from convex/operators/
  // validators.ts, not generated.
  | {
      kind: "file";
      direction: "upload" | "download";
      handler: string;
      sourceParam?: string;
    };

// "system" and "file" are both server-managed: the operator recomputes the
// value itself, so these must never be seeded or rendered as editable form
// fields (an editable profileDownloadUrl would be an SSRF vector).
export const isServerManagedDataSource = (dataSource: DataSource): boolean =>
  dataSource.kind === "system" || dataSource.kind === "file";

export interface ParameterVisibility {
  dependsOn: string;
  op: "equals" | "notEquals" | "oneOf";
  value?: unknown;
  values?: unknown[];
}

export interface ParameterValidation {
  max?: number;
  maxLength?: number;
  min?: number;
  regex?: string;
}

export interface CatalogParameter {
  dataSource: DataSource;
  default?: unknown;
  description?: string;
  key: string;
  label: string;
  options?: { label: string; value: string }[];
  required: boolean;
  type: ParameterType;
  validation?: ParameterValidation;
  visibility?: ParameterVisibility;
}

// A named operation a template exposes against an already-running workload
// (e.g. "backup_state" on firefox/chrome) — distinct from a template's own
// deploy-time parameters, discovered the same way: it's part of the catalog
// response.
export interface CatalogOperation {
  description?: string;
  key: string;
  label: string;
  parameters: CatalogParameter[];
  // Catalog-level hint: true means safe to re-invoke on our own interval
  // (side-effect-free read). Not currently acted on anywhere in this repo —
  // no polling is built, this is deliberately just plumbed through for a
  // future caller that wants it.
  refreshable: boolean;
}

// A named web port a template's Service exposes. Always at least one per
// template — `name` is the mandatory gateway URL path segment
// (/gw/{namespace}/{name}/{entrypoint}/{subpath...}), `label` is what to
// show a user picking between entrypoints when a template declares more
// than one.
export interface Entrypoint {
  label: string;
  name: string;
}

export interface CatalogTemplate {
  description: string;
  entrypoints: Entrypoint[];
  icon: string;
  id: string;
  name: string;
  operations?: CatalogOperation[];
  parameters: CatalogParameter[];
  // Manually-bumped by the operator whenever this template's parameters
  // change. Not consumed anywhere yet (presets aren't built) — piped
  // through so a future presets feature has it without another catalog
  // shape change.
  version: string;
}

export type AdditionalInfoType = "secret" | "plain";

export interface AdditionalInfoItem {
  name: string;
  type: AdditionalInfoType;
  value: unknown;
}

export interface OperationResult {
  additionalInfo: AdditionalInfoItem[];
}
