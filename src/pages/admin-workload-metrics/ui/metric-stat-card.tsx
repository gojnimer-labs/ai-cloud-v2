import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

export const MetricStatCard = ({
  caption,
  label,
  value,
}: {
  caption?: string;
  label: string;
  value: string;
}) => (
  <Card>
    <VStack gap={2}>
      <Heading level={4}>{label}</Heading>
      <Heading level={2}>{value}</Heading>
      {caption ? (
        <Text color="secondary" type="supporting">
          {caption}
        </Text>
      ) : null}
    </VStack>
  </Card>
);
