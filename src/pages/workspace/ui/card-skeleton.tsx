import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";

// Borderless photo-tile-shaped loading placeholder, matching PresetItem's
// and WorkloadCard's shared shell (square thumbnail + heading + badge row,
// no bounding Card box), so the loading state previews the real layout
// instead of a generic spinner/"Loading…" text. `hasActionRow` distinguishes
// PresetItem's visible Deploy button from WorkloadCard's buttonless shell
// (its action lives inside the thumbnail itself, not a row below it).
const CardSkeleton = ({
  hasActionRow,
  index,
}: {
  hasActionRow: boolean;
  index: number;
}) => (
  <VStack gap={3} width={280}>
    <Skeleton height={280} index={index} radius={3} width="100%" />
    <VStack gap={1}>
      <Skeleton height={20} index={index} radius={2} width="70%" />
      <HStack gap={1}>
        <Skeleton height={20} index={index} radius="rounded" width={56} />
        <Skeleton height={20} index={index} radius="rounded" width={72} />
      </HStack>
    </VStack>
    {hasActionRow ? (
      <Skeleton height={32} index={index} radius={2} width="100%" />
    ) : null}
  </VStack>
);

// Renders `count` CardSkeletons inside the same Grid the real card grid
// uses, so the loading state occupies the same footprint as the eventual
// content and the two never visually jump between different layouts.
export const CardSkeletonGrid = ({
  count = 4,
  hasActionRow = false,
}: {
  count?: number;
  hasActionRow?: boolean;
}) => (
  <Grid columns={{ minWidth: 280 }} gap={4}>
    {Array.from({ length: count }, (_, index) => (
      // oxlint-disable-next-line no-array-index-key -- a static placeholder list with no identity beyond position; nothing ever reorders or removes an individual skeleton.
      <CardSkeleton hasActionRow={hasActionRow} index={index} key={index} />
    ))}
  </Grid>
);
