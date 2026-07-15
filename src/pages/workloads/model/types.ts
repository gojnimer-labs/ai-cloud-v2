import type { Id } from "@convex/_generated/dataModel";

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
