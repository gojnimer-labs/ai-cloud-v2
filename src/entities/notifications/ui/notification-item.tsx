import { Item } from "@astryxdesign/core/Item";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";

import { needsReadModal } from "../model/needs-read-modal";
import type { NotificationListItem } from "../model/use-notification-inbox";
import { VARIANT_STATUS_DOT, variantLabel } from "../model/variant";

// Timestamp's `value` prop takes Unix seconds, not the milliseconds
// createdAt is stored/returned as.
const MS_PER_SECOND = 1000;

// The whole row is the click target (mark seen, and open the read-modal if
// the body doesn't fit inline) — no separate per-item dismiss button, since
// Item's own guidance is not to nest a second interactive element inside an
// already-clickable row. Bulk clearing is covered by the panel's "Clear
// all".
export const NotificationItem = ({
  notification,
  onMarkSeen,
  onOpenReadModal,
}: {
  notification: NotificationListItem;
  onMarkSeen: () => void;
  onOpenReadModal: () => void;
}) => {
  const { body, href, title, variant } = notification.data;

  const handleClick = () => {
    if (!notification.isSeen) {
      onMarkSeen();
    }
    if (needsReadModal(body, href)) {
      onOpenReadModal();
    }
  };

  return (
    <Item
      description={body}
      descriptionLines={2}
      endContent={<Timestamp value={notification.createdAt / MS_PER_SECOND} />}
      label={
        <Text type="body" weight={notification.isSeen ? undefined : "medium"}>
          {title}
        </Text>
      }
      onClick={handleClick}
      startContent={
        <StatusDot
          label={variantLabel(variant)}
          tooltip={variantLabel(variant)}
          variant={VARIANT_STATUS_DOT[variant]}
        />
      }
    />
  );
};
