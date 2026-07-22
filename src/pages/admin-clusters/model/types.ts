import type { Doc, Id } from "@convex/_generated/dataModel";

export type GroupByField = "none" | "cluster" | "user";

export type HealthStatus =
  | "pending"
  | "healthy"
  | "offline"
  | "ready_to_destroy";
export type RetentionPolicy = "standard" | "retain";

// Mirrors convex/operators/queries.ts#listClusters' widened workload shape: `name`/
// `namespace` are now optional (a requested/provisioning row has neither yet —
// see convex/schema.ts), `displayName` is the always-present human-facing
// identity, and `status` is the request-lifecycle status. `clusterId` is
// optional: a freshly `requested` row has no `operatorId` until some
// operator claims it, so it belongs to the synthetic "unclaimed" bucket
// (see clusters-page.tsx's `rows`) rather than any real cluster.
export interface ClusterWorkloadRow extends Record<string, unknown> {
  _id: Id<"workloads">;
  clusterId?: Id<"operators">;
  clusterName: string;
  // "Config to apply"/"last-applied config" — pre-fills the redeploy
  // dialog's parameter form, same as the owner-facing Workloads page.
  config?: Record<string, unknown>;
  createdAt: number;
  displayName: string;
  failureReason?: string;
  name?: string;
  namespace?: string;
  status: Doc<"workloads">["status"];
  templateId: string;
  userEmail: string;
}

// Mirrors convex/schema.ts's operators.resourceCapacity — self-reported by
// the operator on every heartbeat, display-only (see that field's doc
// comment for why it never gates a claim decision).
export interface ResourceCapacity {
  allocatableMemoryBytes: number;
  allocatableMilliCpu: number;
  clusterUsedMemoryBytes?: number;
  clusterUsedMilliCpu?: number;
  managedUsedMemoryBytes?: number;
  managedUsedMilliCpu?: number;
  nodesReporting?: number;
  nodesTotal?: number;
  reportedAt: number;
  usedMemoryBytes: number;
  usedMilliCpu: number;
}

export interface ClusterSummary {
  _id: Id<"operators">;
  claimedAt?: number;
  description?: string;
  healthStatus: HealthStatus;
  lastHeartbeatAt?: number;
  name: string;
  // The subset of `tags` below the operator itself last reported —
  // updateCluster rejects removing any of these from the admin UI (see
  // convex/operators/mutations.ts), so the edit form locks just these
  // tokens rather than the whole tags field.
  operatorTags: string[];
  operatorVersion?: string;
  region?: string;
  resourceCapacity?: ResourceCapacity;
  retentionPolicy: RetentionPolicy;
  tags: string[];
  // True once the operator has self-reported tags via /operators/register
  // (see convex/operators/mutations.ts's claim mutation) — informational
  // only; operatorTags above is what the edit form actually locks against.
  tagsSetByOperator: boolean;
}

// Narrows a listClusters() cluster entry (which also carries its
// `workloads` array) down to just the fields ClusterSummary needs — shared
// so the `groups` grouping and the `clustersById` lookup in clusters-page.tsx
// build the exact same shape instead of two divergent inline literals.
export const toClusterSummary = (cluster: {
  _id: Id<"operators">;
  claimedAt?: number;
  description?: string;
  healthStatus: HealthStatus;
  lastHeartbeatAt?: number;
  name: string;
  operatorTags: string[];
  operatorVersion?: string;
  region?: string;
  resourceCapacity?: ResourceCapacity;
  retentionPolicy: RetentionPolicy;
  tags: string[];
  tagsSetByOperator: boolean;
}): ClusterSummary => ({
  _id: cluster._id,
  claimedAt: cluster.claimedAt,
  description: cluster.description,
  healthStatus: cluster.healthStatus,
  lastHeartbeatAt: cluster.lastHeartbeatAt,
  name: cluster.name,
  operatorTags: cluster.operatorTags,
  operatorVersion: cluster.operatorVersion,
  region: cluster.region,
  resourceCapacity: cluster.resourceCapacity,
  retentionPolicy: cluster.retentionPolicy,
  tags: cluster.tags,
  tagsSetByOperator: cluster.tagsSetByOperator,
});

export interface WorkloadGroup {
  cluster?: ClusterSummary;
  key: string;
  label: string;
  rows: ClusterWorkloadRow[];
}

export interface ClusterFormState {
  description: string;
  name: string;
  region: string;
  retentionPolicy: RetentionPolicy;
  tags: string[];
}

export type ClusterFormMode =
  | { kind: "create" }
  | {
      kind: "edit";
      operatorId: Id<"operators">;
      // Mirrors this cluster's ClusterSummary.operatorTags at the moment
      // the edit dialog opened — lets ClusterFormContent lock just these
      // specific tokens in the Tokenizer instead of the whole tags field,
      // matching updateCluster's per-tag guard (see
      // convex/operators/mutations.ts).
      operatorTags: string[];
    };
