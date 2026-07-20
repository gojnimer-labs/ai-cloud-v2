import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { Link } from "@astryxdesign/core/Link";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { MouseEvent } from "react";

import { m } from "@/paraglide/messages";

import { needsExpansion, truncateForInline } from "../model/needs-expansion";
import type { NotificationListItem } from "../model/use-notification-inbox";
import { VARIANT_STATUS_DOT, variantLabel } from "../model/variant";

// Timestamp's `value` prop takes Unix seconds, not the milliseconds
// createdAt is stored/returned as.
const MS_PER_SECOND = 1000;

// The row itself is the click target for marking seen (and opening the
// read-modal when the body doesn't fit inline) — a link gets its own
// explicit open-link action in endContent instead of piggybacking on that
// click or a modal, per the "no modal just to open a link" requirement.
// stopPropagation on the link keeps its click from also bubbling into the
// row's own onClick (which would otherwise also try to open the read-modal
// for a long body at the same time).
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
    if (needsExpansion(body)) {
      onOpenReadModal();
    }
  };

  const handleOpenLink = (event: MouseEvent) => {
    event.stopPropagation();
    if (!notification.isSeen) {
      onMarkSeen();
    }
  };

  return (
    <Item
      description={
        <VStack gap={1}>
          {body ? (
            <Text type="supporting">{truncateForInline(body)}</Text>
          ) : null}
          <HStack vAlign="center" width="100%">
            <StackItem size="fill">
              <span title={variantLabel(variant)}>
                <Icon
                  color={VARIANT_STATUS_DOT[variant]}
                  icon={variant}
                  size="sm"
                />
              </span>
            </StackItem>
            <Timestamp value={notification.createdAt / MS_PER_SECOND} />
          </HStack>
        </VStack>
      }
      endContent={
        href ? (
          <Link
            href={href}
            label={m.notifications_open_link()}
            onClick={handleOpenLink}
            target="_blank"
            tooltip={m.notifications_open_link()}
          >
            <Icon icon={ArrowTopRightOnSquareIcon} size="sm" />
          </Link>
        ) : undefined
      }
      label={
        <Text type="body" weight={notification.isSeen ? undefined : "medium"}>
          {title}
        </Text>
      }
      onClick={handleClick}
    />
  );
};
