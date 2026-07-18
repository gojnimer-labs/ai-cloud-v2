import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";

import { m } from "@/paraglide/messages";

import { formatDate } from "../model/format";

const STATUS_VARIANT = {
  canceled: "neutral",
  expired: "warning",
  pending: "info",
  rejected: "error",
  used: "success",
} as const;

const STATUS_LABEL = {
  canceled: () => m.admin_users_invite_status_canceled(),
  expired: () => m.admin_users_invite_status_expired(),
  pending: () => m.admin_users_invite_status_pending(),
  rejected: () => m.admin_users_invite_status_rejected(),
  used: () => m.admin_users_invite_status_used(),
};

export const InvitesTable = () => {
  const invites = useQuery(api.admin.queries.listInvites);
  const cancelInvite = useMutation(api.admin.mutations.cancelInvite);

  // Canceled and used invites are hidden by default — no filter UI, this is
  // the only view. Pending, expired, and rejected still show, since those
  // are the states an admin might actually need to act on or explain.
  const visibleInvites = useMemo(
    () =>
      (invites ?? []).filter(
        (invite) => invite.status !== "canceled" && invite.status !== "used"
      ),
    [invites]
  );

  if (invites === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_users_loading()}</Text>
      </Center>
    );
  }

  if (visibleInvites.length === 0) {
    return (
      <Center axis="both" style={{ minHeight: 240 }}>
        <EmptyState
          description={m.admin_users_empty_invites_description()}
          title={m.admin_users_empty_invites_title()}
        />
      </Center>
    );
  }

  return (
    <List density="compact" hasDividers>
      {visibleInvites.map((invite) => (
        <ListItem
          description={m.admin_users_invite_description({
            date: formatDate(invite.expiresAt),
            role:
              invite.role === "admin"
                ? m.admin_users_role_admin()
                : m.admin_users_role_user(),
          })}
          endContent={
            <HStack gap={2} vAlign="center">
              <Badge
                label={STATUS_LABEL[invite.status]()}
                variant={STATUS_VARIANT[invite.status]}
              />
              {invite.status === "pending" ? (
                <MoreMenu
                  items={[
                    {
                      icon: XCircleIcon,
                      label: m.admin_users_invite_action_cancel(),
                      onClick: () => cancelInvite({ token: invite.token }),
                    },
                  ]}
                  label={m.admin_users_row_actions()}
                  size="sm"
                />
              ) : null}
            </HStack>
          }
          key={invite.token}
          label={invite.email ?? m.admin_users_invite_unknown_creator()}
        />
      ))}
    </List>
  );
};
