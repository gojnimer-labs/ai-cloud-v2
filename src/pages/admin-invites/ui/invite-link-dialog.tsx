import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

import { m } from "@/paraglide/messages";
import { CopyField } from "@/shared/ui/copy-field";

export const InviteLinkDialog = ({
  emailSent,
  link,
  onClose,
}: {
  emailSent?: boolean;
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
              {emailSent ? (
                <Text color="secondary">
                  {m.admin_invites_link_email_sent()}
                </Text>
              ) : (
                <>
                  <Text color="secondary">
                    {m.admin_invites_link_description()}
                  </Text>
                  <CopyField value={link} />
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label={m.admin_invites_link_done()}
                onClick={onClose}
                variant={emailSent ? "primary" : "secondary"}
              />
            </HStack>
          </LayoutFooter>
        }
        header={<DialogHeader title={m.admin_invites_link_title()} />}
      />
    ) : null}
  </Dialog>
);
