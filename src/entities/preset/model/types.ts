// Astryx Badge's 9 non-semantic color variants — same set as
// admin-groups/model/types.ts's GroupBadgeColor and admin-presets'
// duplicate of it, kept independent here too since entities/preset must
// not depend on either admin page slice.
export type PresetGroupBadgeColor =
  | "blue"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "teal"
  | "yellow";

// The full contract PresetItem renders from — data in via props, intent out
// via the onDeploy callback, nothing reaching into Convex itself. Keeping
// this the ONLY thing PresetItem knows about means a future visual redesign
// only ever touches ui/preset-item.tsx, never the Workspace page that feeds
// it.
export interface PresetSummary {
  _id: string;
  displayName: string;
  groups: { _id: string; badgeColor: PresetGroupBadgeColor; name: string }[];
  templateId: string;
  thumbnailUrl: string | null;
}
