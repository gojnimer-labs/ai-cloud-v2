import type { Doc, Id } from "@convex/_generated/dataModel";

export type GroupByField = "none" | "cluster" | "user";

export type HealthStatus =
  | "pending"
  | "healthy"
  | "offline"
  | "ready_to_destroy";
export type RetentionPolicy = "standard" | "retain";

// Mirrors convex/admin/queries.ts#listClusters' widened workload shape: `name`/
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
  region?: string;
  resourceCapacity?: ResourceCapacity;
  retentionPolicy: RetentionPolicy;
  tags: string[];
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
  region?: string;
  resourceCapacity?: ResourceCapacity;
  retentionPolicy: RetentionPolicy;
  tags: string[];
}): ClusterSummary => ({
  _id: cluster._id,
  claimedAt: cluster.claimedAt,
  description: cluster.description,
  healthStatus: cluster.healthStatus,
  lastHeartbeatAt: cluster.lastHeartbeatAt,
  name: cluster.name,
  region: cluster.region,
  resourceCapacity: cluster.resourceCapacity,
  retentionPolicy: cluster.retentionPolicy,
  tags: cluster.tags,
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
  | { kind: "edit"; operatorId: Id<"operators"> };
