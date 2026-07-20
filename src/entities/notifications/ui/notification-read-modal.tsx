import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";

import { m } from "@/paraglide/messages";

import type { NotificationListItem } from "../model/use-notification-inbox";
import { VARIANT_STATUS_DOT, variantLabel } from "../model/variant";

// Timestamp's `value` prop takes Unix seconds, not the milliseconds
// createdAt is stored/returned as.
const MS_PER_SECOND = 1000;

// Shown for a notification whose body doesn't fit inline in the box (see
// model/needs-read-modal.ts) — the full, untruncated title/body/href.
export const NotificationReadModal = ({
  notification,
  onClose,
}: {
  notification: NotificationListItem | null;
  onClose: () => void;
}) => (
  <Dialog
    isOpen={Boolean(notification)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="info"
    width={420}
  >
    {notification ? (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center">
                <StatusDot
                  label={variantLabel(notification.data.variant)}
                  variant={VARIANT_STATUS_DOT[notification.data.variant]}
                />
                <Timestamp
                  format="date_time"
                  value={notification.createdAt / MS_PER_SECOND}
                />
              </HStack>
              <Text type="body">{notification.data.body}</Text>
              {notification.data.href ? (
                <Link href={notification.data.href} isStandalone>
                  {m.notifications_open_link()}
                </Link>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button label={m.close()} onClick={onClose} variant="primary" />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            onOpenChange={onClose}
            title={notification.data.title}
          />
        }
      />
    ) : null}
  </Dialog>
);
