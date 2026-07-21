import type { Doc } from "@convex/_generated/dataModel";

// Astryx Badge's 9 non-semantic color variants — same set as
// entities/preset/model/types.ts's PresetGroupBadgeColor, kept independent
// here too since entities/workload must not depend on entities/preset.
export type WorkloadGroupBadgeColor =
  | "blue"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "teal"
  | "yellow";

// Small hand-mirrored union — same 5 states as
// pages/workspace/model/format.ts#WorkloadInteractionState, kept
// independent here too since entities/workload must not depend on the
// pages/workspace slice.
export type WorkloadInteractionState =
  | "attention"
  | "in-flight"
  | "paused"
  | "ready"
  | "update-available";

// The full contract WorkloadCard renders from — data and pre-resolved action
// callbacks in via props, nothing reaching into Convex or permission logic
// itself. Keeping this the ONLY thing WorkloadCard knows about means a
// future visual redesign only ever touches ui/workload-card.tsx, never the
// Workspace page that feeds it. Status is Doc<"workloads">["status"] rather
// than a hand-copied literal union — same convention
// pages/workspace/model/format.ts already uses, since that union is too
// large/volatile to safely hand-mirror.
export interface WorkloadSummary {
  _id: string;
  displayName: string;
  groups: { _id: string; badgeColor: WorkloadGroupBadgeColor; name: string }[];
  // Whether the source preset has moved on to a newer version than the one
  // this workload was deployed from — drives the "update-available"
  // interaction state. Always false for a workload not deployed from a
  // preset (no provenance to compare against).
  hasPresetUpdate: boolean;
  // The preset's own version number (presetVersions.version) — distinct
  // from templateVersion (the underlying catalog template's version).
  // Optional key (not just an optional value): the real listMine row
  // doesn't resolve this yet, so callers can omit it entirely until the
  // backend query is extended to join it in.
  presetVersion?: number;
  sourcePresetDisplayName: string | null;
  status: Doc<"workloads">["status"];
  templateId: string;
  templateVersion: string | undefined;
  thumbnailUrl: string | null;
}
