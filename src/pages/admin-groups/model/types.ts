import type { Id } from "@convex/_generated/dataModel";

export interface GroupRow extends Record<string, unknown> {
  _id: Id<"groups">;
  createdAt: number;
  name: string;
}

export interface GroupFormState {
  name: string;
}

export type GroupFormMode =
  | { kind: "create" }
  | { kind: "edit"; groupId: Id<"groups"> };
