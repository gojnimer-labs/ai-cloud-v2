import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { VStack } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  formatDate,
  INVITE_STATUS_OPTIONS,
  inviteStatusLabel,
  inviteStatusVariant,
  USER_ROLE_OPTIONS,
  userRoleLabel,
  userRoleVariant,
} from "../model/format";
import type { InviteRow } from "../model/types";

const INVITE_FIELD_DEFS = [
  { key: "email", label: m.admin_users_invites_column_email(), type: "string" },
  {
    enumValues: USER_ROLE_OPTIONS,
    key: "role",
    label: m.admin_users_column_role(),
    type: "enum",
  },
  {
    enumValues: INVITE_STATUS_OPTIONS,
    key: "status",
    label: m.admin_users_invites_column_status(),
    type: "enum",
  },
  {
    key: "createdByEmail",
    label: m.admin_users_invites_column_created_by(),
    type: "string",
  },
] as const;

// Canceled and used invites are hidden by default so the page opens on
// invites an admin might still act on — clearing this filter surfaces the
// full history, same as admin-users hides banned accounts by default.
const DEFAULT_FILTERS: PowerSearchFilter[] = [
  {
    field: "status",
    operator: "is_none_of",
    value: { type: "enum_list", value: ["canceled", "used"] },
  },
];

export const InvitesTable = ({
  onSelectInvite,
}: {
  onSelectInvite: (invite: InviteRow) => void;
}) => {
  const invites = useQuery(api.admin.queries.listInvites);
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    INVITE_FIELD_DEFS,
    "AdminInvitesSearch"
  );

  // PowerSearch's field-based filtering wants plain present values, not
  // optional/undefined ones — these fallbacks are the same text the panel
  // would otherwise show, applied once here so the filtered data and the
  // detail panel never disagree.
  const rows = useMemo<InviteRow[]>(
    () =>
      (invites ?? []).map((invite) => ({
        ...invite,
        createdByEmail:
          invite.createdByEmail ?? m.admin_users_invite_unknown_creator(),
        email: invite.email ?? m.admin_users_invite_unknown_creator(),
        role: invite.role as InviteRow["role"],
      })),
    [invites]
  );

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
        header: m.admin_users_invites_column_email(),
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
        header: m.admin_users_invites_column_status(),
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
        header: m.admin_users_invites_column_created_by(),
        key: "createdByEmail",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.createdByEmail}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_users_invites_column_expires(),
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

  const filteredInvites = useMemo(
    () => applyFilters(filters, rows),
    [rows, filters, applyFilters]
  );

  if (invites === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_users_loading()}</Text>
      </Center>
    );
  }

  return (
    <VStack gap={4}>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={(newFilters) => setFilters([...newFilters])}
        placeholder={m.admin_users_invites_search_placeholder()}
        popoverSaveButtonLabel={m.apply()}
        resultCount={filteredInvites.length}
      />
      {filteredInvites.length === 0 ? (
        <Center axis="both" style={{ minHeight: 240 }}>
          <EmptyState
            description={m.admin_users_empty_invites_description()}
            title={m.admin_users_empty_invites_title()}
          />
        </Center>
      ) : (
        <Table<InviteRow>
          columns={columns}
          data={filteredInvites}
          density="balanced"
          dividers="rows"
          hasHover
          idKey="token"
          plugins={{ rowClick: rowClickPlugin }}
        />
      )}
    </VStack>
  );
};
