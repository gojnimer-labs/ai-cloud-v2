import type { Doc, Id } from "@convex/_generated/dataModel";

export type GroupByField = "cluster" | "user";

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

export interface ClusterSummary {
  _id: Id<"operators">;
  description?: string;
  healthStatus: HealthStatus;
  name: string;
  region?: string;
  retentionPolicy: RetentionPolicy;
  tags: string[];
}

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
