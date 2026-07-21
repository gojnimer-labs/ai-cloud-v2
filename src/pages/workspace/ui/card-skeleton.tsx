import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";

// Two distinct skeleton shapes, matching each section's real card exactly so
// the loading state never visually jumps once data arrives: PresetItem is a
// boxed Card around a native 64px Thumbnail + heading + badge row + a
// full-width Deploy button. WorkloadCard is just the bare 64px Thumbnail on
// its own — name/status/groups all live in its HoverCard, never visible on
// the card surface itself.
const PresetCardSkeleton = ({ index }: { index: number }) => (
  <Card padding={4} width={280}>
    <VStack gap={3}>
      <Skeleton height={64} index={index} radius={2} width={64} />
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

const WorkloadCardSkeleton = ({ index }: { index: number }) => (
  <Skeleton height={64} index={index} radius={2} width={64} />
);

// Renders `count` skeletons inside the same Grid the real card grid uses
// (same minWidth per variant too), so the loading state occupies the same
// footprint as the eventual content.
export const CardSkeletonGrid = ({
  count = 4,
  variant = "workload",
}: {
  count?: number;
  variant?: "preset" | "workload";
}) => (
  <Grid columns={{ minWidth: variant === "preset" ? 280 : 100 }} gap={4}>
    {Array.from({ length: count }, (_, index) =>
      variant === "preset" ? (
        // oxlint-disable-next-line no-array-index-key -- a static placeholder list with no identity beyond position; nothing ever reorders or removes an individual skeleton.
        <PresetCardSkeleton index={index} key={index} />
      ) : (
        // oxlint-disable-next-line no-array-index-key -- see above.
        <WorkloadCardSkeleton index={index} key={index} />
      )
    )}
  </Grid>
);
