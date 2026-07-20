import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArchiveBoxXMarkIcon } from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";

import { variantLabel, VARIANT_STATUS_DOT } from "@/entities/notifications";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { NotificationComposeDialog } from "./notification-compose-dialog";

// Timestamp's `value` prop takes Unix seconds, not the milliseconds
// createdAt is stored/returned as.
const MS_PER_SECOND = 1000;

const routeApi = getRouteApi("/_authed/admin/notifications");

interface HistoryRow extends Record<string, unknown> {
  _id: string;
  alertId?: Id<"systemAlerts">;
  createdAt: number;
  createdBy?: string;
  isActive?: boolean;
  kind: "alert" | "send";
  targetMode?: "everyone" | "groups" | "user";
  targetSummary?: string;
  title: string;
  topic?: string;
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

const statusLabel = (row: HistoryRow): string => {
  if (row.kind === "send") {
    return m.admin_notifications_status_sent();
  }
  return row.isActive
    ? m.admin_notifications_status_active()
    : m.admin_notifications_status_retracted();
};

export const NotificationsPage = () => {
  const history = useQuery(api.notifications.queries.listHistoryForAdmin);
  const retractSystemAlert = useMutation(
    api.systemAlerts.mutations.retractSystemAlert
  );
  const retractAlert = useImperativeAlertDialog();
  const toast = useToast();

  const { modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const openCompose = () => {
    navigate({ search: (prev) => ({ ...prev, modal: "compose" }) });
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

  const columns = useMemo<TableColumn<HistoryRow>[]>(
    () => [
      {
        header: m.admin_notifications_column_variant(),
        key: "variant",
        renderCell: (row) => (
          <StatusDot
            label={variantLabel(row.variant)}
            tooltip={variantLabel(row.variant)}
            variant={VARIANT_STATUS_DOT[row.variant]}
          />
        ),
        width: pixel(48),
      },
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
        header: m.admin_notifications_column_status(),
        key: "status",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {statusLabel(row)}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_field_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Timestamp format="date" value={row.createdAt / MS_PER_SECOND} />
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
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_notifications_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={3} role="main">
            {history.length === 0 ? (
              <Center axis="both" style={{ minHeight: 240 }}>
                <EmptyState
                  description={m.admin_notifications_empty_description()}
                  title={m.admin_notifications_empty_title()}
                />
              </Center>
            ) : (
              <Table<HistoryRow>
                columns={columns}
                data={history}
                density="balanced"
                dividers="rows"
                hasHover
                idKey="_id"
              />
            )}
          </LayoutContent>
        }
        header={
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
              <Button
                label={m.admin_notifications_compose_button()}
                onClick={openCompose}
                variant="primary"
              />
            </HStack>
          </LayoutHeader>
        }
        height="fill"
      />

      <NotificationComposeDialog
        isOpen={modal === "compose"}
        onClose={closeCompose}
      />
      {retractAlert.element}
    </Section>
  );
};
