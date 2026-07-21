import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { Divider } from "@astryxdesign/core/Divider";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { OverflowList } from "@astryxdesign/core/OverflowList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import type { CSSProperties, ReactNode } from "react";

import { m } from "@/paraglide/messages";

import type { WorkloadInteractionState, WorkloadSummary } from "../model/types";

// Purely decorative overlay glyph (attention's warning icon, update-
// available's info icon) — pointer-events none so it never steals hover
// away from the Thumbnail underneath, which is the actual HoverCard trigger
// for every state, both of these included.
const centerStyle: CSSProperties = {
  left: "50%",
  pointerEvents: "none",
  position: "absolute",
  top: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 1,
};

// HoverCard's floating panel already carries a background + shadow-med
// natively, but on a plain white page background that's not enough to read
// as "popped out" — needs a border for separation regardless of page
// background (per astryx's own elevation guidance: "use --color-border
// tokens for decorative borders, not more shadow layers"). HoverCard's
// style/className/xstyle props exist but this astryx version's
// useHoverCard#renderHoverCard never actually threads them onto the
// rendered popover element (confirmed: the prop is silently dropped, no
// border/class ever reaches the DOM) — so the border goes on our own
// content root instead of the (currently unstyleable) popover chrome. The
// popover's own inner wrapper already applies --spacing-3 padding around
// whatever we render, so a matching negative margin cancels that out
// (otherwise the border sits inset, doubled up with our own padding below
// it, reading as a strange empty gap around the border) — width is bumped
// by the same amount on both sides to keep the visible content area at the
// original 260px.
const hoverCardContentStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-container)",
  margin: "calc(var(--spacing-3) * -1)",
  padding: "var(--spacing-3)",
  width: "calc(260px + var(--spacing-3) * 2)",
};

// The StatusDot color per interaction state — same semantic mapping as
// pages/workspace/model/format.ts's old per-status variant table, just
// collapsed onto the 5 interaction states instead of all 13 statuses.
const STATUS_DOT_VARIANT: Record<WorkloadInteractionState, StatusDotVariant> = {
  attention: "error",
  "in-flight": "accent",
  paused: "neutral",
  ready: "success",
  "update-available": "accent",
};

// Shared top section (name/template/version/preset-version + status/groups)
// between both HoverCard bodies below.
const identityRows = (
  workload: WorkloadSummary,
  statusLabel: string,
  interactionState: WorkloadInteractionState
) => (
  <>
    <HStack gap={3} justify="between" vAlign="center">
      <HStack gap={2} vAlign="end">
        <Heading level={4}>{workload.displayName}</Heading>
        <Text type="supporting">
          {workload.templateVersion
            ? `${workload.templateId} · v${workload.templateVersion}`
            : workload.templateId}
        </Text>
      </HStack>
      {workload.presetVersion === undefined ? null : (
        <Badge label={`v${workload.presetVersion}`} variant="neutral" />
      )}
    </HStack>
    <HStack gap={3} justify="between" vAlign="center">
      <HStack gap={1} vAlign="center">
        <StatusDot
          label={statusLabel}
          variant={STATUS_DOT_VARIANT[interactionState]}
        />
        <Text color="secondary" type="supporting">
          {statusLabel}
        </Text>
      </HStack>
      {workload.groups.length > 0 ? (
        <OverflowList
          gap={1}
          overflowRenderer={(overflowItems) => (
            <Text color="secondary" type="supporting">
              +{overflowItems.length}
            </Text>
          )}
          style={{ minWidth: 0 }}
        >
          {workload.groups.map((group) => (
            <Badge
              key={group._id}
              label={group.name}
              variant={group.badgeColor}
            />
          ))}
        </OverflowList>
      ) : null}
    </HStack>
  </>
);

// The "healthy" HoverCard body — ready/in-flight/paused. Anchored on the
// thumbnail itself (see WorkloadCard below). "update-available" gets its own
// body (below), not this one, even though its Thumbnail is also dimmed.
const healthyHoverCardContent = (
  workload: WorkloadSummary,
  statusLabel: string,
  interactionState: WorkloadInteractionState
) => (
  <VStack gap={3} style={hoverCardContentStyle}>
    {identityRows(workload, statusLabel, interactionState)}
    {interactionState === "ready" || interactionState === "paused" ? (
      <Center axis="horizontal">
        <Text color="secondary" type="supporting">
          {interactionState === "ready" ? "Click to open" : "Click to resume"}
        </Text>
      </Center>
    ) : null}
  </VStack>
);

// The "attention" HoverCard body — adds a sync-error Item + a (disabled for
// now, no retry wiring yet) Report action below a divider. Anchored on the
// thumbnail itself, same as the healthy body — the warning glyph rendered
// over the thumbnail is decorative only (see centerStyle). The specific
// failure copy is still a placeholder — real failureReason data isn't
// plumbed onto WorkloadSummary yet.
const attentionHoverCardContent = (
  workload: WorkloadSummary,
  statusLabel: string
) => (
  <VStack gap={3} style={hoverCardContentStyle}>
    {identityRows(workload, statusLabel, "attention")}
    <Divider />
    <Item
      density="compact"
      description="Retry after checking service credentials"
      label="Sync failed"
      startContent={<Icon color="error" icon="error" size="sm" />}
      style={{ padding: 0 }}
    />
    <HStack justify="center">
      <Button isDisabled label="Report" size="sm" variant="ghost" />
    </HStack>
  </VStack>
);

// The "update-available" HoverCard body — same identity rows + divider +
// Item structure as the attention body, swapped to an informational (not
// error) tone: an info Icon instead of error, "Update available" instead of
// "Sync failed", and an enabled "Update" action (onUpdate opens the
// existing redeploy flow — see use-workload-actions.ts#resolveCardInteraction)
// instead of the disabled placeholder Report button.
const updateAvailableHoverCardContent = (
  workload: WorkloadSummary,
  statusLabel: string,
  onUpdate: (() => void) | undefined
) => (
  <VStack gap={3} style={hoverCardContentStyle}>
    {identityRows(workload, statusLabel, "update-available")}
    <Divider />
    <Item
      density="compact"
      description="A newer version of this preset is ready to deploy"
      label="Update available"
      startContent={<Icon color="accent" icon="info" size="sm" />}
      style={{ padding: 0 }}
    />
    <HStack justify="center">
      <Button label="Update" onClick={onUpdate} size="sm" variant="ghost" />
    </HStack>
  </VStack>
);

// The overlay glyph rendered over a dimmed thumbnail — attention gets a
// static warning icon, update-available a static info icon, everything else
// none (see centerStyle for why it's pointer-events:none/decorative-only).
const OVERLAY_ICON: Partial<Record<WorkloadInteractionState, ReactNode>> = {
  attention: <Icon color="warning" icon="warning" size="lg" />,
  "update-available": <Icon color="accent" icon="info" size="lg" />,
};

// The thumbnail IS the HoverCard trigger for every state, attention and
// update-available included — never Thumbnail's own native isDisabled,
// since that sets pointer-events:none and would kill hover entirely.
// "paused"/"attention"/"update-available" instead get a manual opacity dim
// via style so they still read as non-interactive while remaining
// hoverable. Otherwise astryx Thumbnail's own native states drive
// everything —
//   ready            -> enabled, clickable (onClick = native "Open {name}" button)
//   in-flight        -> isLoading (native shimmer/spinner)
//   paused           -> manually dimmed, still clickable (onClick = onResume) —
//                       Thumbnail's native isInteractive/hover treatment fires
//                       the same as "ready" since onClick is set and isDisabled
//                       isn't; the button's native aria-label always reads
//                       "Open {name}" regardless of action (a Thumbnail
//                       limitation, same tradeoff already accepted for "ready")
//   attention        -> manually dimmed, no onClick (non-interactive) —
//                       action lives in the HoverCard's Report button instead
//   update-available -> manually dimmed, no onClick (non-interactive) —
//                       action lives in the HoverCard's Update button instead
// Right-click (ContextMenu) still reaches the full action set regardless of
// state.
export const WorkloadCard = ({
  interactionState,
  menuItems,
  onOpen,
  onResume,
  onUpdate,
  statusLabel,
  workload,
}: {
  interactionState: WorkloadInteractionState;
  menuItems: DropdownMenuOption[];
  onOpen: (() => void) | undefined;
  onResume: (() => void) | undefined;
  onUpdate: (() => void) | undefined;
  statusLabel: string;
  workload: WorkloadSummary;
}) => {
  let thumbnailOnClick: (() => void) | undefined;
  if (interactionState === "ready") {
    thumbnailOnClick = onOpen;
  } else if (interactionState === "paused") {
    thumbnailOnClick = onResume;
  }

  const isDimmed =
    interactionState === "paused" ||
    interactionState === "attention" ||
    interactionState === "update-available";

  const thumbnail = (
    <Thumbnail
      alt={workload.displayName}
      isLoading={interactionState === "in-flight"}
      onClick={thumbnailOnClick}
      src={workload.thumbnailUrl ?? undefined}
      style={isDimmed ? { opacity: 0.5 } : undefined}
    />
  );

  const hoverCardContent = (() => {
    if (interactionState === "attention") {
      return attentionHoverCardContent(workload, statusLabel);
    }
    if (interactionState === "update-available") {
      return updateAvailableHoverCardContent(workload, statusLabel, onUpdate);
    }
    return healthyHoverCardContent(workload, statusLabel, interactionState);
  })();

  return (
    <ContextMenu
      items={menuItems}
      label={`${m.workspace_deployment_actions()} ${workload.displayName}`}
    >
      <VStack style={{ position: "relative", width: "fit-content" }}>
        <HoverCard content={hoverCardContent} placement="end">
          {thumbnail}
        </HoverCard>
        {OVERLAY_ICON[interactionState] ? (
          <Center axis="both" style={centerStyle}>
            {OVERLAY_ICON[interactionState]}
          </Center>
        ) : null}
      </VStack>
    </ContextMenu>
  );
};
