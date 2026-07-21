import type { Doc } from "@convex/_generated/dataModel";

export type LifecycleAction = "destroy" | "redeploy" | "resume" | "stop";

// Shape returned by convex/workloads/queries.ts#listMine — hand-declared
// rather than inferred (same convention as entities/preset/model/types.ts's
// PresetSummary), since this file never imports convex/ code directly.
//
// Split from the pre-redesign MyDeploymentRow into two views over the same
// listMine row: this one is what use-workload-actions.ts's handlers/
// buildMenuItems operate on — permission fields for gating, plus the
// minimal display data those handlers themselves need (displayName for
// confirm-dialog/toast copy). The richer display shape (thumbnailUrl,
// groups, sourcePresetDisplayName) lives in
// entities/workload/model/types.ts#WorkloadSummary instead, so the
// pure/presentational WorkloadCard never sees permission internals.
export interface WorkloadPermissionRow {
  _id: Doc<"workloads">["_id"];
  allowedEntrypoints: "all" | string[];
  allowedLifecycleActions: "all" | LifecycleAction[];
  allowedOperations: "all" | string[];
  displayName: string;
  status: Doc<"workloads">["status"];
  templateId: string;
  templateVersion: string | undefined;
}

// A permitted entrypoint the page can offer as the card's primary "Open"
// action — page-owned (not entities/workload's concern) since resolving
// which entrypoints are permitted is permission-gating logic, not display.
export interface WorkloadEntrypoint {
  label: string;
  name: string;
  onSelect: () => void;
}
