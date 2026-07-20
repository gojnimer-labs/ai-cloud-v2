import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

export const HomePage = () => {
  const user = useCurrentUser();

  return (
    <Section height="100%" padding={6} variant="transparent">
      <VStack gap={2} hAlign="center" height="100%" justify="center">
        <Heading level={1}>{m.home_heading()}</Heading>
        <Text type="supporting">
          {user
            ? m.home_signed_in_as({ email: user.email })
            : m.home_subtitle_guest()}
        </Text>
        <LocaleSwitcher />
      </VStack>
    </Section>
  );
};
