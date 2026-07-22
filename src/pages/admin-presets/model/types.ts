import type { Id } from "@convex/_generated/dataModel";

// Astryx Badge's 9 non-semantic color variants — same set as
// admin-groups/model/types.ts's GroupBadgeColor, duplicated here rather than
// cross-imported across page slices (same "each admin page owns its own
// model/types.ts" convention this codebase already follows).
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

export type LifecycleAction = "destroy" | "redeploy" | "resume" | "stop";

export interface PresetRow extends Record<string, unknown> {
  _id: Id<"presets">;
  allowedEntrypoints: string[] | undefined;
  allowedLifecycleActions: LifecycleAction[] | undefined;
  allowedOperations: string[] | undefined;
  createdAt: number;
  currentVersion: number;
  desiredOperatorTags: string[];
  displayName: string;
  groupBadgeColors: GroupBadgeColor[];
  // Parallel to groupBadgeColors (same order/length), not a separate lookup
  // — same convention as admin-users' AdminUserTableRow.
  groupIds: Id<"groups">[];
  groupNames: string[];
  templateId: string;
  templateVersion: string;
  thumbnailUrl: string | null;
  updatedAt: number;
}

// Everything the create/edit dialog collects OUTSIDE the selected template's
// own parameter form (see preset-form-dialog.tsx) — displayName/thumbnail/
// groups/tags are metadata the version-bump diff never looks at (see
// convex/presets/versioning.ts), kept separate here for the same reason
// they're separate on the presets table itself. allowed* are ALSO metadata
// the version-bump diff never looks at (see convex/schema.ts's doc comment
// on presets.allowedEntrypoints) but are grouped here rather than split out,
// same rationale.
export interface PresetFormState {
  allowedEntrypoints: string[];
  allowedLifecycleActions: LifecycleAction[];
  allowedOperations: string[];
  desiredOperatorTags: string[];
  displayName: string;
  groupIds: Id<"groups">[];
  thumbnailFileId: Id<"files"> | undefined;
}

export type PresetFormMode =
  | { kind: "create" }
  | { kind: "edit"; presetId: Id<"presets"> };
