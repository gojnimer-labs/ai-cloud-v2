import { Badge } from "@astryxdesign/core/Badge";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { Card } from "@astryxdesign/core/Card";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Overlay } from "@astryxdesign/core/Overlay";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import {
  ArrowTopRightOnSquareIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

import { m } from "@/paraglide/messages";

import type { WorkloadSummary } from "../model/types";

// The single Stop-or-Resume 1-click action, pre-resolved by the page (which
// status permits which toggle, and which icon/label goes with it) — the
// card never re-derives that business rule, only renders what it's given,
// same discipline as PresetItem's onDeploy.
export interface WorkloadOneClickToggle {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
}

// Pure/presentational, parallels entities/preset/ui/preset-item.tsx: every
// value comes in as a prop (data, permission-derived callbacks, pre-built
// menu items), the only ways out are onOpen/onToggleLifecycle/menuItems'
// own onClicks — so a future visual redesign only ever touches this file.
// Callers (pages/workspace) own data-fetching, permission gating, and the
// one buildMenuItems array that drives BOTH the always-visible MoreMenu
// (three-dot trigger) and the right-click ContextMenu wrapping the whole
// card — same option shape, zero duplication.
export const WorkloadCard = ({
  isBusy,
  isStatusPulsing,
  menuItems,
  onOpen,
  onToggleLifecycle,
  statusLabel,
  statusTooltip,
  statusVariant,
  workload,
}: {
  isBusy: boolean;
  isStatusPulsing: boolean;
  menuItems: DropdownMenuOption[];
  onOpen: (() => void) | undefined;
  onToggleLifecycle: WorkloadOneClickToggle | undefined;
  statusLabel: string;
  statusTooltip: string;
  statusVariant: StatusDotVariant;
  workload: WorkloadSummary;
}) => {
  const ToggleIcon = onToggleLifecycle?.icon;
  const handleToggleLifecycle = onToggleLifecycle?.onClick;

  return (
    <ContextMenu items={menuItems} label={m.workspace_deployment_actions()}>
      <Card padding={4} width={280}>
        <VStack gap={3}>
          <Overlay
            content={
              <HStack gap={2} justify="between" vAlign="center">
                <HoverCard
                  content={
                    <VStack gap={2}>
                      <Text weight="medium">
                        {workload.sourcePresetDisplayName ??
                          workload.templateId}
                      </Text>
                      {workload.groups.length > 0 ? (
                        <HStack gap={1} wrap="wrap">
                          {workload.groups.map((group) => (
                            <Badge
                              key={group._id}
                              label={group.name}
                              variant={group.badgeColor}
                            />
                          ))}
                        </HStack>
                      ) : null}
                      <Text color="secondary" type="supporting">
                        {workload.templateVersion
                          ? `${workload.templateId} · v${workload.templateVersion}`
                          : workload.templateId}
                      </Text>
                    </VStack>
                  }
                  placement="below"
                >
                  <IconButton
                    icon={<InformationCircleIcon />}
                    label={m.workspace_workload_info_label()}
                    size="sm"
                    tooltip={m.workspace_workload_info_label()}
                    variant="ghost"
                  />
                </HoverCard>
                <HStack gap={1} vAlign="center">
                  <StatusDot
                    isPulsing={isStatusPulsing}
                    label={statusLabel}
                    tooltip={statusTooltip}
                    variant={statusVariant}
                  />
                  <Text type="supporting">{statusLabel}</Text>
                </HStack>
              </HStack>
            }
            position="top"
            scrim="dark"
          >
            <Thumbnail
              alt=""
              label={workload.displayName}
              src={workload.thumbnailUrl ?? undefined}
            />
          </Overlay>

          <VStack gap={1}>
            <Heading level={4}>{workload.displayName}</Heading>
            {workload.groups.length > 0 ? (
              <HStack gap={1} wrap="wrap">
                {workload.groups.map((group) => (
                  <Badge
                    key={group._id}
                    label={group.name}
                    variant={group.badgeColor}
                  />
                ))}
              </HStack>
            ) : null}
          </VStack>

          <HStack justify="between" vAlign="center">
            {onOpen || onToggleLifecycle ? (
              <ButtonGroup label={m.workspace_deployment_actions()}>
                {onOpen ? (
                  <IconButton
                    icon={<ArrowTopRightOnSquareIcon />}
                    isDisabled={isBusy}
                    label={m.admin_workload_open()}
                    onClick={onOpen}
                    tooltip={m.admin_workload_open()}
                  />
                ) : null}
                {onToggleLifecycle && ToggleIcon && handleToggleLifecycle ? (
                  <IconButton
                    icon={<ToggleIcon />}
                    isDisabled={isBusy}
                    label={onToggleLifecycle.label}
                    onClick={handleToggleLifecycle}
                    tooltip={onToggleLifecycle.label}
                  />
                ) : null}
              </ButtonGroup>
            ) : (
              <StackItem />
            )}
            {menuItems.length > 0 ? (
              <MoreMenu
                items={menuItems}
                label={m.workspace_deployment_actions()}
              />
            ) : null}
          </HStack>
        </VStack>
      </Card>
    </ContextMenu>
  );
};
