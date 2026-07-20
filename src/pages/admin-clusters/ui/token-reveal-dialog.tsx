import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

import { m } from "@/paraglide/messages";
import { CopyField } from "@/shared/ui/copy-field";

export const TokenRevealDialog = ({
  onClose,
  revealed,
}: {
  onClose: () => void;
  revealed: { clusterName: string; token: string } | null;
}) => (
  <Dialog
    isOpen={Boolean(revealed)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="required"
    width={480}
  >
    {revealed ? (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <Text color="secondary">
                {m.admin_clusters_token_reveal_description()}
              </Text>
              <CopyField value={revealed.token} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label={m.admin_clusters_token_reveal_done()}
                onClick={onClose}
                variant="secondary"
              />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            title={m.admin_clusters_token_reveal_title({
              name: revealed.clusterName,
            })}
          />
        }
      />
    ) : null}
  </Dialog>
);
