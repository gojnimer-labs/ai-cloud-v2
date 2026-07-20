import type { CSSProperties } from "react";

import type { GroupBadgeColor } from "../model/types";

const SWATCH_STYLE_BASE: CSSProperties = {
  borderRadius: "50%",
  display: "inline-block",
  height: 10,
  width: 10,
};

export const GroupBadgeColorSwatch = ({
  color,
}: {
  color: GroupBadgeColor;
}) => (
  <span
    style={{
      ...SWATCH_STYLE_BASE,
      backgroundColor: `var(--color-icon-${color})`,
    }}
  />
);
