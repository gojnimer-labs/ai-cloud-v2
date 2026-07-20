import type { Id } from "@convex/_generated/dataModel";

// Astryx Badge's 9 non-semantic color variants (see @astryxdesign/core's
// Badge component) — the fixed set a group's badge color is chosen from.
export type GroupBadgeColor =
  | "blue"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "teal"
  | "yellow";

export interface GroupRow extends Record<string, unknown> {
  _id: Id<"groups">;
  badgeColor: GroupBadgeColor;
  createdAt: number;
  name: string;
}

export interface GroupFormState {
  badgeColor: GroupBadgeColor;
  name: string;
}

export type GroupFormMode =
  | { kind: "create" }
  | { kind: "edit"; groupId: Id<"groups"> };
