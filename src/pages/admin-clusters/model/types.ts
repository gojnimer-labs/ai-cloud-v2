import type { Id } from "@convex/_generated/dataModel";

export type GroupByField = "cluster" | "user";

export type HealthStatus =
  | "pending"
  | "healthy"
  | "offline"
  | "ready_to_destroy";
export type RetentionPolicy = "standard" | "retain";

export interface ClusterWorkloadRow extends Record<string, unknown> {
  _id: Id<"workloads">;
  clusterId: Id<"operators">;
  clusterName: string;
  createdAt: number;
  name: string;
  namespace: string;
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
