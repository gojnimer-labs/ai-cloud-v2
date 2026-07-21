import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";

// Card-shaped loading placeholder, matching both PresetItem's and
// WorkloadCard's shared shell (Card padding=4 width=280 > thumbnail +
// heading + badge row + action row), so the loading state previews the
// real layout instead of a generic spinner/"Loading…" text.
const CardSkeleton = ({ index }: { index: number }) => (
  <Card padding={4} width={280}>
    <VStack gap={3}>
      <Skeleton height={280 - 32} index={index} radius={3} width="100%" />
      <VStack gap={1}>
        <Skeleton height={20} index={index} radius={2} width="70%" />
        <HStack gap={1}>
          <Skeleton height={20} index={index} radius="rounded" width={56} />
          <Skeleton height={20} index={index} radius="rounded" width={72} />
        </HStack>
      </VStack>
      <Skeleton height={32} index={index} radius={2} width="100%" />
    </VStack>
  </Card>
);

// Renders `count` CardSkeletons inside the same Grid the real card grid
// uses, so the loading state occupies the same footprint as the eventual
// content and the two never visually jump between different layouts.
export const CardSkeletonGrid = ({ count = 4 }: { count?: number }) => (
  <Grid columns={{ minWidth: 280 }} gap={4}>
    {Array.from({ length: count }, (_, index) => (
      // oxlint-disable-next-line no-array-index-key -- a static placeholder list with no identity beyond position; nothing ever reorders or removes an individual skeleton.
      <CardSkeleton index={index} key={index} />
    ))}
  </Grid>
);
