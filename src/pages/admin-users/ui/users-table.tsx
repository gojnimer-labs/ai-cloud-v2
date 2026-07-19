import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import {
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type { CSSProperties } from "react";
import { Fragment, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  accountStatusLabel,
  accountStatusVariant,
  formatDate,
  userRoleLabel,
  userRoleVariant,
} from "../model/format";
import type {
  AdminUserTableRow,
  UserGroupOption,
  UsersGroupByField,
} from "../model/types";

const groupHeaderCell: CSSProperties = {
  backgroundColor: "var(--color-background-muted)",
  cursor: "pointer",
  padding: "var(--spacing-3) var(--spacing-4)",
};

interface UserGroupBucket {
  key: string;
  label: string;
  rows: AdminUserTableRow[];
}

export const UsersTable = ({
  allGroups,
  groupBy,
  hasActiveFilters,
  onSelectUser,
  rows,
}: {
  allGroups: UserGroupOption[];
  groupBy: UsersGroupByField;
  hasActiveFilters: boolean;
  onSelectUser: (user: AdminUserTableRow) => void;
  rows: AdminUserTableRow[];
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const rowClickPlugin: TablePlugin<AdminUserTableRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => onSelectUser(item),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    [onSelectUser]
  );

  const columns = useMemo<TableColumn<AdminUserTableRow>[]>(
    () => [
      {
        header: m.admin_users_column_name(),
        key: "name",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.name}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_users_column_email(),
        key: "email",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
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
        header: m.admin_users_column_status(),
        key: "status",
        renderCell: (row) => (
          <Badge
            label={accountStatusLabel(row.status)}
            variant={accountStatusVariant(row.status)}
          />
        ),
        width: proportional(1),
      },
      {
        header: m.admin_users_column_groups(),
        key: "groupNames",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.groupNames.length > 0 ? row.groupNames.join(", ") : "—"}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_users_column_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDate(row.createdAt)}
          </Text>
        ),
        width: proportional(1),
      },
    ],
    []
  );

  // Anchored on every known group (not just ones with filter matches) so an
  // empty group still shows up when there's no active search — mirrors
  // admin-clusters/ui/clusters-page.tsx's `groups` useMemo, adapted for
  // membership being many-to-many: a user in more than one group appears in
  // every one of their groups' buckets, not just one.
  const buckets = useMemo<UserGroupBucket[]>(() => {
    if (groupBy !== "group") {
      return [];
    }
    const sortedGroups = allGroups.toSorted((a, b) =>
      a.name.localeCompare(b.name)
    );
    const withMatches: UserGroupBucket[] = sortedGroups.map((group) => ({
      key: group._id,
      label: group.name,
      rows: rows.filter((row) => row.groupIds.includes(group._id)),
    }));
    withMatches.push({
      key: "__no_group__",
      label: m.admin_users_no_group(),
      rows: rows.filter((row) => row.groupIds.length === 0),
    });
    return withMatches.filter(
      (bucket) => !hasActiveFilters || bucket.rows.length > 0
    );
  }, [allGroups, rows, groupBy, hasActiveFilters]);

  const isEmpty = groupBy === "none" ? rows.length === 0 : buckets.length === 0;

  if (isEmpty) {
    return (
      <Center axis="both" style={{ minHeight: 240 }}>
        <EmptyState
          description={m.admin_users_empty_users_description()}
          title={m.admin_users_empty_users_title()}
        />
      </Center>
    );
  }

  if (groupBy === "none") {
    return (
      <Table<AdminUserTableRow>
        columns={columns}
        data={rows}
        density="balanced"
        dividers="rows"
        hasHover
        idKey="id"
        plugins={{ rowClick: rowClickPlugin }}
      />
    );
  }

  const columnCount = columns.length;
  const resolvedWidths = resolveColumnWidths(columns);

  return (
    <Table<AdminUserTableRow>
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
      {buckets.map((bucket) => {
        const isCollapsed = collapsedGroups.has(bucket.key);
        let bodyRows = null;
        if (!isCollapsed) {
          bodyRows =
            bucket.rows.length > 0 ? (
              bucket.rows.map((row) => (
                <TableRow key={row.id} onClick={() => onSelectUser(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.renderCell?.(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <Text color="secondary" type="supporting">
                    {m.admin_users_empty_group_row()}
                  </Text>
                </TableCell>
              </TableRow>
            );
        }
        return (
          <Fragment key={bucket.key}>
            <TableRow
              onClick={() => toggleGroup(bucket.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleGroup(bucket.key);
                }
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- TableRow renders a <tr>; a real <button> isn't a valid table-row replacement, so role="button" is the correct a11y signal for this clickable header row.
              role="button"
              tabIndex={0}
            >
              <TableCell colSpan={columnCount} style={groupHeaderCell}>
                <HStack gap={2} vAlign="center">
                  <Icon
                    color="secondary"
                    icon={isCollapsed ? ChevronRightIcon : ChevronDownIcon}
                    size="sm"
                  />
                  <Text type="body" weight="bold">
                    {bucket.label}
                  </Text>
                  <Badge label={String(bucket.rows.length)} variant="neutral" />
                </HStack>
              </TableCell>
            </TableRow>
            {bodyRows}
          </Fragment>
        );
      })}
    </Table>
  );
};
