import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";

import { m } from "@/paraglide/messages";

import type { PresetSummary } from "../model/types";

// Simple v1 by design: a Card with a thumbnail, name, group badges, and a
// single Deploy action. Pure/presentational — every value comes in as a
// prop and the only way out is onDeploy, so a future visual redesign only
// ever touches this file. Callers own data-fetching, in-flight tracking,
// and toast feedback (see pages/workspace/ui/workspace-page.tsx).
export const PresetItem = ({
  isDeploying,
  onDeploy,
  preset,
}: {
  isDeploying: boolean;
  onDeploy: () => void;
  preset: PresetSummary;
}) => (
  <Card padding={4} width={280}>
    <VStack gap={3}>
      <Thumbnail
        alt=""
        label={preset.displayName}
        src={preset.thumbnailUrl ?? undefined}
      />
      <VStack gap={1}>
        <Heading level={4}>{preset.displayName}</Heading>
        {preset.groups.length > 0 ? (
          <HStack gap={1} wrap="wrap">
            {preset.groups.map((group) => (
              <Badge
                key={group._id}
                label={group.name}
                variant={group.badgeColor}
              />
            ))}
          </HStack>
        ) : null}
      </VStack>
      <Button
        isDisabled={isDeploying}
        label={
          isDeploying ? m.workspace_deploying() : m.workspace_deploy_button()
        }
        onClick={onDeploy}
        style={{ width: "100%" }}
        variant="primary"
      />
    </VStack>
  </Card>
);
