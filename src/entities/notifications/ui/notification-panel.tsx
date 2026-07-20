import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type {
  NotificationListItem,
  useNotificationInbox,
} from "../model/use-notification-inbox";
import { NotificationItem } from "./notification-item";
import { NotificationReadModal } from "./notification-read-modal";

export const NotificationPanel = ({
  inbox,
}: {
  inbox: ReturnType<typeof useNotificationInbox>;
}) => {
  const clearAllAlert = useImperativeAlertDialog();
  const [readModalItem, setReadModalItem] =
    useState<NotificationListItem | null>(null);

  const confirmClearAll = () => {
    clearAllAlert.show({
      actionLabel: m.notifications_clear_all_confirm_action(),
      description: m.notifications_clear_all_confirm_description(),
      onAction: async () => {
        await inbox.dismissAll();
        clearAllAlert.hide();
      },
      title: m.notifications_clear_all_confirm_title(),
    });
  };

  return (
    <VStack gap={0}>
      <HStack gap={2} padding={3} vAlign="center">
        <StackItem size="fill">
          <Heading level={3}>{m.notifications_panel_title()}</Heading>
        </StackItem>
        <Button
          isDisabled={inbox.unseenCount === 0}
          label={m.notifications_mark_all_seen()}
          onClick={() => inbox.markAllSeen()}
          size="sm"
          variant="ghost"
        />
        <Button
          isDisabled={!inbox.notifications || inbox.notifications.length === 0}
          label={m.notifications_clear_all()}
          onClick={confirmClearAll}
          size="sm"
          variant="ghost"
        />
      </HStack>
      <VStack gap={0} style={{ maxHeight: "70vh", overflowY: "auto" }}>
        {inbox.notifications === undefined ? (
          <Center axis="both" style={{ minHeight: 120 }}>
            <Text type="supporting">{m.loading()}</Text>
          </Center>
        ) : null}
        {inbox.notifications && inbox.notifications.length === 0 ? (
          <EmptyState
            description={m.notifications_empty_description()}
            title={m.notifications_empty_title()}
          />
        ) : null}
        {inbox.notifications?.map((notification) => (
          <NotificationItem
            key={notification._id}
            notification={notification}
            onMarkSeen={() => inbox.markSeen(notification._id)}
            onOpenReadModal={() => setReadModalItem(notification)}
          />
        ))}
      </VStack>
      {clearAllAlert.element}
      <NotificationReadModal
        notification={readModalItem}
        onClose={() => setReadModalItem(null)}
      />
    </VStack>
  );
};
