import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo } from "react";

import { m } from "@/paraglide/messages";

import {
  formatDate,
  inviteStatusLabel,
  inviteStatusVariant,
  userRoleLabel,
  userRoleVariant,
} from "../model/format";
import type { InviteRow } from "../model/types";

// Purely presentational — query/filter state lives in InvitesPage now, so
// its PowerSearch bar can render in the page header (consistent with every
// other admin table page) instead of floating inside the content area.
export const InvitesTable = ({
  onSelectInvite,
  rows,
}: {
  onSelectInvite: (invite: InviteRow) => void;
  rows: InviteRow[];
}) => {
  const rowClickPlugin: TablePlugin<InviteRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => onSelectInvite(item),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    [onSelectInvite]
  );

  const columns = useMemo<TableColumn<InviteRow>[]>(
    () => [
      {
        header: m.admin_invites_column_email(),
        key: "email",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.email}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_users_column_role(),
        key: "role",
        renderCell: (row) => (
          <Badge
            label={userRoleLabel(row.role)}
            variant={userRoleVariant(row.role)}
          />
        ),
        width: proportional(1),
      },
      {
        header: m.admin_invites_column_status(),
        key: "status",
        renderCell: (row) => (
          <Badge
            label={inviteStatusLabel(row.status)}
            variant={inviteStatusVariant(row.status)}
          />
        ),
        width: proportional(1),
      },
      {
        header: m.admin_invites_column_created_by(),
        key: "createdByEmail",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.createdByEmail}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_invites_column_expires(),
        key: "expiresAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDate(row.expiresAt)}
          </Text>
        ),
        width: proportional(1),
      },
    ],
    []
  );

  if (rows.length === 0) {
    return (
      <Center axis="both" minHeight={240}>
        <EmptyState
          description={m.admin_invites_empty_description()}
          title={m.admin_invites_empty_title()}
        />
      </Center>
    );
  }

  return (
    <Table<InviteRow>
      columns={columns}
      data={rows}
      density="balanced"
      dividers="rows"
      hasHover
      idKey="token"
      plugins={{ rowClick: rowClickPlugin }}
    />
  );
};
