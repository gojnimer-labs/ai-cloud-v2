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
  sourcePresetDisplayName: string | null;
  status: Doc<"workloads">["status"];
  templateId: string;
  templateVersion: string | undefined;
  thumbnailUrl: string | null;
}
