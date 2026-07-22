import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { OverflowList } from "@astryxdesign/core/OverflowList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";

import { m } from "@/paraglide/messages";

import type { PresetSummary } from "../model/types";

// Module-level (not defined inside PresetItem's render) so it's a stable
// reference across renders, not a new nested component every time.
const renderGroupOverflow = (overflowItems: unknown[]) => (
  <Text color="secondary" type="supporting">
    +{overflowItems.length}
  </Text>
);

// Compact "marketplace tile": an icon+title header row (small Thumbnail
// beside the admin's own preset name, with the underlying template's own
// name/icon as a supporting subtitle — distinct identities, since an admin
// may rename "Chrome + DevTools" from the template simply called "chrome"),
// then a footer row pinning group badges + the Deploy button to the card's
// bottom edge regardless of how much content sits above — `height="100%"` +
// `justify="between"` is what keeps every card in a Grid row the same height
// instead of each one's footer landing at a different y position ("jumping"
// between cards with and without groups). Pure/presentational — every value
// comes in as a prop and the only way out is onDeploy, so a future visual
// redesign only ever touches this file.
export const PresetItem = ({
  isDeploying,
  onDeploy,
  preset,
}: {
  isDeploying: boolean;
  onDeploy: () => void;
  preset: PresetSummary;
}) => (
  <Card minHeight={112} padding={3} width={280}>
    <VStack gap={2} height="100%" justify="between">
      <HStack gap={2} vAlign="center">
        <Thumbnail
          alt=""
          label={preset.displayName}
          src={preset.thumbnailUrl ?? undefined}
        />
        <VStack gap={0} style={{ minWidth: 0 }}>
          <Heading level={4}>{preset.displayName}</Heading>
          {preset.templateName ? (
            <Text color="secondary" type="supporting">
              {preset.templateIcon ? `${preset.templateIcon} ` : ""}
              {preset.templateName}
            </Text>
          ) : null}
        </VStack>
      </HStack>
      <HStack
        justify={preset.groups.length > 0 ? "between" : "end"}
        vAlign="center"
      >
        {preset.groups.length > 0 ? (
          <OverflowList
            gap={1}
            overflowRenderer={renderGroupOverflow}
            style={{ minWidth: 0 }}
          >
            {preset.groups.map((group) => (
              <Badge
                key={group._id}
                label={group.name}
                variant={group.badgeColor}
              />
            ))}
          </OverflowList>
        ) : null}
        <Button
          isDisabled={isDeploying}
          label={
            isDeploying ? m.workspace_deploying() : m.workspace_deploy_button()
          }
          onClick={onDeploy}
          size="sm"
          variant="primary"
        />
      </HStack>
    </VStack>
  </Card>
);
