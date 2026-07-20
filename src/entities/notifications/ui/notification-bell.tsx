import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover } from "@astryxdesign/core/Popover";
import { HStack } from "@astryxdesign/core/Stack";
import { BellIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { QueryErrorBoundary } from "@/shared/ui/query-error-boundary";

import { useNotificationInbox } from "../model/use-notification-inbox";
import { NotificationPanel } from "./notification-panel";

import styles from "./notification-bell.module.css";

const MAX_DISPLAYED_COUNT = 99;

const NotificationBellInner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const inbox = useNotificationInbox();

  return (
    <Popover
      // Popover always mounts `content` in the DOM (toggling visibility via
      // the native `popover` HTML attribute, not conditional React
      // rendering) — gating it on isOpen keeps NotificationPanel's own
      // query/loading state out of the tree until the user actually opens
      // the bell, instead of sitting there hidden-but-present.
      content={isOpen ? <NotificationPanel inbox={inbox} /> : undefined}
      isOpen={isOpen}
      label={m.notifications_panel_title()}
      onOpenChange={setIsOpen}
      width={380}
    >
      <HStack className={styles.wrapper} vAlign="center">
        <IconButton
          icon={<Icon icon={BellIcon} size="sm" />}
          label={m.nav_notifications()}
          tooltip={m.nav_notifications()}
          variant="ghost"
        />
        {inbox.unseenCount > 0 ? (
          <Badge
            className={styles.badge}
            label={
              inbox.unseenCount > MAX_DISPLAYED_COUNT
                ? `${MAX_DISPLAYED_COUNT}+`
                : String(inbox.unseenCount)
            }
            variant="error"
          />
        ) : null}
      </HStack>
    </Popover>
  );
};

// Wrapped in QueryErrorBoundary (see that component's own doc comment) —
// this is mounted in the top nav on every authed page, so a transient
// Convex error here (e.g. mid-deployment) must not take down the whole
// shell.
export const NotificationBell = () => (
  <QueryErrorBoundary>
    <NotificationBellInner />
  </QueryErrorBoundary>
);
