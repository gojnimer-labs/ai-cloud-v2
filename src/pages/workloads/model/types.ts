import type { Doc } from "@convex/_generated/dataModel";

import type { CatalogTemplate } from "@/entities/catalog-parameter";

// Mirrors convex/workloads/queries.ts#workloadRowValidator exactly. Doc<"workloads">
// is generated straight from convex/schema.ts's `workloads` table, which the
// validator is deliberately kept in sync with (see the comment there), so deriving
// the frontend row type from it here means a schema change can't silently drift
// out of sync with this type the way a hand-copied interface could.
export type WorkloadRow = Doc<"workloads">;

// The ~10-literal request-lifecycle status union (requested/provisioning/active/
// requested_destroy/destroying/requested_redeploy/redeploying/failed/destroyed/
// orphaned) — distinct from the CR's own live runtime phase below.
export type WorkloadStatus = WorkloadRow["status"];

// The live-fetched CR phase/readyReplicas from workloads/actions.ts#listMyWorkloads
// — only fetched (and only meaningful) for status === "active" rows; every other
// status returns `phase: row.status` directly there, which the UI already has via
// `row.status` itself, so only the active-row shape is worth keeping around here.
export interface WorkloadLivePhase {
  phase: string;
  readyReplicas: number;
}

export type OperatorHealthStatus = "healthy" | "offline" | "ready_to_destroy";

// Mirrors convex/operators/queries.ts#listMergedCatalog's per-entry return
// shape — a CatalogTemplate plus which operators can serve it. The
// selection key in the New Workload dialog is `${id}@${version}` (matching
// listMergedCatalog's own dedup key), since two entries can share an id.
export interface MergedCatalogEntry extends CatalogTemplate {
  availableTags: string[];
  operatorCount: number;
}
