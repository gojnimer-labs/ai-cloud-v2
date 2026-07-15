import type { Id } from "@convex/_generated/dataModel";

export type ParameterSource = "user" | "system";

// "string" | "number" | "boolean" | "select" are the fixed widget kinds;
// anything matching "select_<sourceKey>" (see convex/operators/actions.ts)
// is also rendered as a select, its options resolved live per-source — see
// isSelectType in ui/param-field.tsx. Kept as a plain string rather than a
// closed union since new dynamic-select sources don't need a frontend type
// change.
export type ParameterType = string;

export interface CatalogParameter {
  default?: unknown;
  description?: string;
  key: string;
  label: string;
  options?: { label: string; value: string }[];
  required: boolean;
  source: ParameterSource;
  type: ParameterType;
}

// A named operation a template exposes against an already-running workload
// (e.g. "backup_state" on firefox/chrome) — distinct from a template's own
// deploy-time parameters, discovered the same way: it's part of the catalog
// response. See ai-cloud-operator's catalog.CustomFunction for the reusable
// pattern this mirrors.
export interface CatalogCustomFunction {
  description?: string;
  key: string;
  label: string;
  parameters: CatalogParameter[];
}

export interface CatalogTemplate {
  customFunctions?: CatalogCustomFunction[];
  description: string;
  icon: string;
  id: string;
  name: string;
  parameters: CatalogParameter[];
}

// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay a type alias: Table<T> requires T extends Record<string, unknown>, which an interface doesn't structurally satisfy.
export type WorkloadRow = {
  _id: Id<"workloads">;
  name: string;
  namespace: string;
  operatorId: Id<"operators">;
  phase: string;
  readyReplicas: number;
  templateId: string;
};

export type OperatorHealthStatus = "healthy" | "offline" | "ready_to_destroy";
