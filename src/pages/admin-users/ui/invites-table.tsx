import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { formatDate } from "../model/format";
import type { InviteRow } from "../model/types";
import { InviteFormDialog } from "./invite-form-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";

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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const columns = useMemo<TableColumn<InviteRow>[]>(
    () => [
      { header: m.admin_users_column_role(), key: "role", width: pixel(120) },
      {
        header: m.admin_users_invites_column_status(),
        key: "status",
        width: pixel(120),
      },
      {
        header: m.admin_users_invites_column_created_by(),
        key: "createdByEmail",
        width: proportional(1),
      },
      {
        header: m.admin_users_column_created(),
        key: "createdAt",
        width: pixel(140),
      },
      {
        header: m.admin_users_invites_column_expires(),
        key: "expiresAt",
        width: pixel(140),
      },
      {
        header: m.admin_field_actions(),
        key: "actions",
        width: pixel(56),
      },
    ],
    []
  );

  const resolvedWidths = resolveColumnWidths(columns);

  const header = (
    <HStack gap={3} style={{ padding: "var(--spacing-4)" }} vAlign="center">
      <StackItem size="fill">
        <Text type="body" weight="medium">
          {m.admin_users_tab_invites()}
        </Text>
      </StackItem>
      <Button
        label={m.admin_users_invite_button()}
        onClick={() => setIsCreateOpen(true)}
        variant="primary"
      />
    </HStack>
  );

  const body = () => {
    if (invites === undefined) {
      return (
        <Center axis="both" style={{ minHeight: 240 }}>
          <Text type="supporting">{m.admin_users_loading()}</Text>
        </Center>
      );
    }

    if (invites.length === 0) {
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
      <Table<InviteRow>
        columns={columns}
        density="balanced"
        dividers="rows"
        hasHover
        textOverflow="truncate"
      >
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={resolvedWidths.columns.get(column.key)?.style}
            />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow isHeaderRow>
            {columns.map((column) => (
              <TableHeaderCell
                key={column.key}
                style={resolvedWidths.columns.get(column.key)?.style}
              >
                {column.header}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        {invites.map((invite) => (
          <TableRow key={invite.token}>
            <TableCell>
              <Badge
                label={
                  invite.role === "admin"
                    ? m.admin_users_role_admin()
                    : m.admin_users_role_user()
                }
                variant={invite.role === "admin" ? "purple" : "neutral"}
              />
            </TableCell>
            <TableCell>
              <Badge
                label={STATUS_LABEL[invite.status]()}
                variant={STATUS_VARIANT[invite.status]}
              />
            </TableCell>
            <TableCell>
              <Text color="secondary" type="supporting">
                {invite.createdByEmail ??
                  m.admin_users_invite_unknown_creator()}
              </Text>
            </TableCell>
            <TableCell>
              <Text color="secondary" type="supporting">
                {formatDate(invite.createdAt)}
              </Text>
            </TableCell>
            <TableCell>
              <Text color="secondary" type="supporting">
                {formatDate(invite.expiresAt)}
              </Text>
            </TableCell>
            <TableCell>
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
                />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </Table>
    );
  };

  return (
    <VStack gap={0} hAlign="stretch">
      {header}
      {body()}
      <InviteFormDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(link) => {
          setIsCreateOpen(false);
          setCreatedLink(link);
        }}
      />
      <InviteLinkDialog
        link={createdLink}
        onClose={() => setCreatedLink(null)}
      />
    </VStack>
  );
};
