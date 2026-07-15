import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { CubeIcon } from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

export const AuthBranding = () => (
  <VStack gap={2} hAlign="center">
    <Icon icon={CubeIcon} size="lg" />
    <Text size="lg" type="body" weight="bold">
      {m.product_name()}
    </Text>
  </VStack>
);
