import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

import { m } from "@/paraglide/messages";

export const InviteLinkDialog = ({
  link,
  onClose,
}: {
  link: string | null;
  onClose: () => void;
}) => (
  <Dialog
    isOpen={Boolean(link)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="required"
    width={480}
  >
    {link ? (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <Text color="secondary">
                {m.admin_users_invite_link_description()}
              </Text>
              <CodeBlock code={link} language="plaintext" />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label={m.admin_users_invite_link_done()}
                onClick={onClose}
                variant="primary"
              />
            </HStack>
          </LayoutFooter>
        }
        header={<DialogHeader title={m.admin_users_invite_link_title()} />}
      />
    ) : null}
  </Dialog>
);
