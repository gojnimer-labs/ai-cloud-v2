import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { m } from "@/paraglide/messages";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/")({
  component: HelloWorld,
});

function HelloWorld() {
  const user = useQuery(api.auth.getCurrentUser);

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
}
