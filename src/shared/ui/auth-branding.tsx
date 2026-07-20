import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

import { m } from "@/paraglide/messages";

export const AuthBranding = () => (
  <VStack gap={2} hAlign="center">
    <img
      alt=""
      src="/tabai-icon.svg"
      style={{ height: "var(--spacing-9)", width: "var(--spacing-9)" }}
    />
    <Text size="lg" type="body" weight="bold">
      {m.product_name()}
    </Text>
  </VStack>
);
