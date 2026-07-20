import { m } from "@/paraglide/messages";

import type { GroupBadgeColor } from "./types";

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const groupBadgeColorLabel = (color: GroupBadgeColor): string =>
  ({
    blue: m.admin_groups_color_blue(),
    cyan: m.admin_groups_color_cyan(),
    green: m.admin_groups_color_green(),
    orange: m.admin_groups_color_orange(),
    pink: m.admin_groups_color_pink(),
    purple: m.admin_groups_color_purple(),
    red: m.admin_groups_color_red(),
    teal: m.admin_groups_color_teal(),
    yellow: m.admin_groups_color_yellow(),
  })[color];

// The fixed set of Astryx Badge color variants a group's badge can use —
// same order as @astryxdesign/core's own Badge variant enum.
export const GROUP_BADGE_COLORS: GroupBadgeColor[] = [
  "blue",
  "cyan",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "teal",
  "yellow",
];

export const GROUP_BADGE_COLOR_OPTIONS: {
  label: string;
  value: GroupBadgeColor;
}[] = GROUP_BADGE_COLORS.map((color) => ({
  label: groupBadgeColorLabel(color),
  value: color,
}));
