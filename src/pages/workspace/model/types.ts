import type { Doc } from "@convex/_generated/dataModel";

export type LifecycleAction = "destroy" | "redeploy" | "resume" | "stop";

// Shape returned by convex/workloads/queries.ts#listMine — hand-declared
// rather than inferred (same convention as entities/preset/model/types.ts's
// PresetSummary), since this file never imports convex/ code directly.
export interface MyDeploymentRow {
  _id: Doc<"workloads">["_id"];
  allowedEntrypoints: "all" | string[];
  allowedLifecycleActions: "all" | LifecycleAction[];
  allowedOperations: "all" | string[];
  createdAt: number;
  displayName: string;
  sourcePresetId: Doc<"workloads">["sourcePresetId"];
  status: Doc<"workloads">["status"];
  templateId: string;
  templateVersion: string | undefined;
}
