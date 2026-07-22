import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Center } from "@astryxdesign/core/Center";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import type { TableColumn } from "@astryxdesign/core/Table";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useToast } from "@astryxdesign/core/Toast";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArchiveBoxXMarkIcon } from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import { NOTIFICATION_VARIANTS, variantLabel } from "@/entities/notifications";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { NotificationComposeDialog } from "./notification-compose-dialog";
import { SystemAlertComposeDialog } from "./system-alert-compose-dialog";

// Timestamp's `value` prop takes Unix seconds, not the milliseconds
// createdAt is stored/returned as.
const MS_PER_SECOND = 1000;

const routeApi = getRouteApi("/_authed/admin/notifications");

type HistoryStatus = "active" | "retracted" | "sent";

// The raw shape from listHistoryForAdmin, plus a few fields computed once in
// `rows` below purely so PowerSearch has stable, typed values to filter on
// (createdAtSeconds for date-range operators, source/status/user as plain
// strings instead of re-deriving them per row inside the search matcher).
interface HistoryRow extends Record<string, unknown> {
  _id: string;
  alertId?: Id<"systemAlerts">;
  createdAt: number;
  createdAtSeconds: number;
  createdBy?: string;
  isActive?: boolean;
  kind: "alert" | "send";
  source: "admin" | "system";
  status: HistoryStatus;
  targetMode?: "everyone" | "groups" | "user";
  targetSummary?: string;
  title: string;
  topic?: string;
  user: string;
  variant: "error" | "info" | "success" | "warning";
}

const GLOBAL_TOPIC = "global";

const targetLabel = (row: HistoryRow): string => {
  if (row.kind === "alert") {
    return row.topic === GLOBAL_TOPIC
      ? m.admin_notifications_topic_global()
      : (row.topic ?? "");
  }
  if (row.targetMode === "everyone") {
    return m.admin_notifications_target_everyone();
  }
  if (row.targetMode === "groups") {
    return row.targetSummary || m.admin_notifications_target_groups();
  }
  return row.targetSummary || m.admin_notifications_target_user();
};

const STATUS_LABEL: Record<HistoryStatus, () => string> = {
  active: m.admin_notifications_status_active,
  retracted: m.admin_notifications_status_retracted,
  sent: m.admin_notifications_status_sent,
};

const rowStatus = (row: {
  isActive?: boolean;
  kind: "alert" | "send";
}): HistoryStatus => {
  if (row.kind === "send") {
    return "sent";
  }
  return row.isActive ? "active" : "retracted";
};

const NOTIFICATION_HISTORY_FIELD_DEFS = [
  { key: "title", label: m.admin_notifications_column_title(), type: "string" },
  { key: "user", label: m.admin_field_user(), type: "string" },
  {
    enumValues: [
      { label: m.admin_notifications_type_alert(), value: "alert" },
      { label: m.admin_notifications_type_send(), value: "send" },
    ],
    key: "kind",
    label: m.admin_notifications_column_type(),
    type: "enum",
  },
  {
    enumValues: NOTIFICATION_VARIANTS.map((variant) => ({
      label: variantLabel(variant),
      value: variant,
    })),
    key: "variant",
    label: m.admin_notifications_column_variant(),
    type: "enum",
  },
  {
    enumValues: [
      { label: m.admin_notifications_source_admin(), value: "admin" },
      { label: m.admin_notifications_source_system(), value: "system" },
    ],
    key: "source",
    label: m.admin_notifications_column_source(),
    type: "enum",
  },
  {
    enumValues: (["active", "retracted", "sent"] satisfies HistoryStatus[]).map(
      (status) => ({ label: STATUS_LABEL[status](), value: status })
    ),
    key: "status",
    label: m.admin_notifications_column_status(),
    type: "enum",
  },
  { key: "createdAtSeconds", label: m.admin_field_created(), type: "date" },
] as const;

export const NotificationsPage = () => {
  const history = useQuery(api.notifications.queries.listHistoryForAdmin);
  const retractSystemAlert = useMutation(
    api.systemAlerts.mutations.retractSystemAlert
  );
  const retractAlert = useImperativeAlertDialog();
  const toast = useToast();
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);

  const { modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const openComposeNotification = () => {
    navigate({
      search: (prev) => ({ ...prev, modal: "compose-notification" }),
    });
  };
  const openComposeAlert = () => {
    navigate({ search: (prev) => ({ ...prev, modal: "compose-alert" }) });
  };
  const closeCompose = useCallback(() => {
    navigate({
      replace: true,
      search: (prev) => {
        const { modal: _modal, ...rest } = prev;
        return rest;
      },
    });
  }, [navigate]);

  const confirmRetract = useCallback(
    (row: HistoryRow) => {
      const { alertId } = row;
      if (!alertId) {
        return;
      }
      retractAlert.show({
        actionLabel: m.admin_notifications_retract_confirm_action(),
        description: m.admin_notifications_retract_confirm_description({
          title: row.title,
        }),
        onAction: async () => {
          try {
            await retractSystemAlert({ alertId });
            retractAlert.hide();
            toast({ body: m.admin_notifications_retract_success() });
          } catch (error) {
            toast({
              body: m.admin_notifications_retract_error({
                error: getErrorMessage(error),
              }),
              type: "error",
            });
          }
        },
        title: m.admin_notifications_retract_confirm_title(),
      });
    },
    [retractAlert, retractSystemAlert, toast]
  );

  const rows = useMemo<HistoryRow[]>(
    () =>
      (history ?? []).map((row) => ({
        ...row,
        createdAtSeconds: row.createdAt / MS_PER_SECOND,
        source: row.createdBy ? "admin" : "system",
        status: rowStatus(row),
        user: row.targetSummary ?? "",
      })),
    [history]
  );

  const { config, applyFilters } = usePowerSearchConfig(
    NOTIFICATION_HISTORY_FIELD_DEFS,
    "NotificationHistorySearch"
  );
  const filteredRows = applyFilters(filters, rows);

  const columns = useMemo<TableColumn<HistoryRow>[]>(
    () => [
      {
        header: m.admin_notifications_column_title(),
        key: "title",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.title}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_notifications_column_target(),
        key: "target",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {targetLabel(row)}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_notifications_column_status(),
        key: "status",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {STATUS_LABEL[row.status]()}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_notifications_column_source(),
        key: "source",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {row.createdBy
              ? m.admin_notifications_source_admin()
              : m.admin_notifications_source_system()}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_notifications_column_variant(),
        key: "variant",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {variantLabel(row.variant)}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_field_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Timestamp format="date" value={row.createdAtSeconds} />
        ),
        width: proportional(1),
      },
      {
        align: "end",
        header: "",
        key: "actions",
        renderCell: (row) =>
          row.kind === "alert" && row.isActive ? (
            <MoreMenu
              items={[
                {
                  icon: ArchiveBoxXMarkIcon,
                  label: m.admin_notifications_retract(),
                  onClick: () => confirmRetract(row),
                },
              ]}
              label={m.admin_notifications_row_actions()}
            />
          ) : null,
        resizable: false,
        width: pixel(48),
      },
    ],
    [confirmRetract]
  );

  if (history === undefined) {
    return (
      <Center axis="both" minHeight="100%">
        <Text type="supporting">{m.admin_notifications_loading()}</Text>
      </Center>
    );
  }

  let tableRegion: ReactNode;
  if (history.length === 0) {
    tableRegion = (
      <Center axis="both" minHeight={240}>
        <EmptyState
          description={m.admin_notifications_empty_description()}
          title={m.admin_notifications_empty_title()}
        />
      </Center>
    );
  } else if (filteredRows.length === 0) {
    tableRegion = (
      <Center axis="both" minHeight={240}>
        <EmptyState
          description={m.admin_notifications_no_results_description()}
          title={m.admin_notifications_no_results_title()}
        />
      </Center>
    );
  } else {
    tableRegion = (
      <Table<HistoryRow>
        columns={columns}
        data={filteredRows}
        density="balanced"
        dividers="rows"
        hasHover
        idKey="_id"
      />
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={3} role="main">
            {tableRegion}
          </LayoutContent>
        }
        header={
          <>
            <LayoutHeader hasDivider padding={4}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <VStack gap={2}>
                    <Heading level={1}>{m.nav_notifications()}</Heading>
                    <Text color="secondary">
                      {m.admin_notifications_page_subtitle()}
                    </Text>
                  </VStack>
                </StackItem>
                <DropdownMenu
                  button={{
                    label: m.admin_notifications_compose_button(),
                    variant: "primary",
                  }}
                  items={[
                    {
                      label: m.admin_notifications_compose_notification(),
                      onClick: openComposeNotification,
                    },
                    {
                      label: m.admin_notifications_compose_alert(),
                      onClick: openComposeAlert,
                    },
                  ]}
                />
              </HStack>
            </LayoutHeader>
            {history.length > 0 ? (
              <Toolbar
                dividers={["bottom"]}
                label={m.nav_notifications()}
                startContent={
                  <HStack vAlign="center" width="100%">
                    <StackItem size="fill">
                      <PowerSearch
                        config={config}
                        filters={filters}
                        onChange={(newFilters) => setFilters([...newFilters])}
                        placeholder={m.admin_notifications_search_placeholder()}
                        popoverSaveButtonLabel={m.apply()}
                        resultCount={m.admin_notifications_result_count({
                          count: filteredRows.length,
                        })}
                      />
                    </StackItem>
                  </HStack>
                }
              />
            ) : null}
          </>
        }
        height="fill"
      />

      <NotificationComposeDialog
        isOpen={modal === "compose-notification"}
        onClose={closeCompose}
      />
      <SystemAlertComposeDialog
        isOpen={modal === "compose-alert"}
        onClose={closeCompose}
      />
      {retractAlert.element}
    </Section>
  );
};
