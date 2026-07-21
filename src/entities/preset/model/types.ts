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
  // The underlying catalog template's own description/icon/name — live data
  // resolved against whatever operators currently report (see
  // convex/presets/queries.ts#listAvailablePresetsForCurrentUser), null when
  // the preset's pinned templateId+templateVersion no longer matches any
  // operator's catalog (a stale/removed template). Distinct from
  // displayName, which is the admin's own name for this preset, not the
  // underlying app's name.
  templateDescription: string | null;
  templateIcon: string | null;
  templateId: string;
  templateName: string | null;
  thumbnailUrl: string | null;
}
