import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";

import { m } from "@/paraglide/messages";
import { GalleryThumbnail } from "@/shared/ui/gallery-thumbnail";

import type { PresetSummary } from "../model/types";

// Borderless photo tile — no bounding Card box, matching
// entities/workload/ui/workload-card.tsx's redesigned shell: the thumbnail
// image IS the card, with name/badges/action below it, so the whole
// Workspace page reads as one gallery rather than a grid of boxed forms.
// Pure/presentational — every value comes in as a prop and the only way out
// is onDeploy, so a future visual redesign only ever touches this file.
// Callers own data-fetching, in-flight tracking, and toast feedback (see
// pages/workspace/ui/workspace-page.tsx).
export const PresetItem = ({
  isDeploying,
  onDeploy,
  preset,
}: {
  isDeploying: boolean;
  onDeploy: () => void;
  preset: PresetSummary;
}) => (
  <VStack gap={3} width={280}>
    <GalleryThumbnail alt={preset.displayName} src={preset.thumbnailUrl} />
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
);
