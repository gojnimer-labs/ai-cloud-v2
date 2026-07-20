import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import type { TableColumn } from "@astryxdesign/core/Table";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { formatDate } from "../model/format";
import type { GroupFormState, GroupRow } from "../model/types";
import { GroupFormDialog } from "./group-form-dialog";

const routeApi = getRouteApi("/_authed/admin/groups");

export const GroupsPage = () => {
  const groups = useQuery(api.groups.queries.listGroups);
  const createGroup = useMutation(api.groups.mutations.createGroup);
  const updateGroup = useMutation(api.groups.mutations.updateGroup);
  const deleteGroup = useMutation(api.groups.mutations.deleteGroup);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const { groupId, modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // Pure derivation from the URL + the already-loaded groups query — no
  // local state to keep in sync, so there's nothing that can go stale.
  // `undefined` groups (still loading) and an unknown groupId (stale/deleted
  // elsewhere) both resolve to "nothing to show" rather than flashing a
  // dialog open with the wrong content.
  const groupSeed = useMemo(() => {
    if (modal === "create") {
      return {
        initialState: { badgeColor: "blue" as const, name: "" },
        mode: { kind: "create" as const },
      };
    }
    if (modal === "edit" && groupId && groups) {
      const group = groups.find((candidate) => candidate._id === groupId);
      return group
        ? {
            initialState: { badgeColor: group.badgeColor, name: group.name },
            mode: { groupId: group._id, kind: "edit" as const },
          }
        : null;
    }
    return null;
  }, [modal, groupId, groups]);

  const openCreateDialog = () => {
    navigate({
      search: (prev) => ({ ...prev, groupId: undefined, modal: "create" }),
    });
  };

  const openEditDialog = useCallback(
    (group: GroupRow) => {
      navigate({
        search: (prev) => ({ ...prev, groupId: group._id, modal: "edit" }),
      });
    },
    [navigate]
  );

  const closeGroupForm = useCallback(() => {
    navigate({
      replace: true,
      search: (prev) => {
        const { groupId: _groupId, modal: _modal, ...rest } = prev;
        return rest;
      },
    });
  }, [navigate]);

  const handleGroupFormSubmit = async (state: GroupFormState) => {
    if (!groupSeed) {
      return;
    }
    await (groupSeed.mode.kind === "create"
      ? createGroup({ badgeColor: state.badgeColor, name: state.name })
      : updateGroup({
          badgeColor: state.badgeColor,
          groupId: groupSeed.mode.groupId,
          name: state.name,
        }));
    // Clears the URL too, not just local state — otherwise a reload after a
    // successful save reopens the dialog again from the now-stale
    // ?modal=edit&groupId= still sitting in the address bar.
    closeGroupForm();
  };

  const confirmDelete = useCallback(
    (group: GroupRow) => {
      const baseOptions = {
        actionLabel: m.admin_groups_delete_confirm_action(),
        description: m.admin_groups_delete_confirm_description({
          name: group.name,
        }),
        title: m.admin_groups_delete_confirm_title(),
      };
      const onAction = async () => {
        // Disables the action button for the duration of the request —
        // without this, a fast double-click fires onAction twice before
        // the first request resolves.
        // oxlint-disable-next-line react/react-compiler -- onAction refers to itself so a retry click after a failure reuses the same handler; the compiler can't prove this self-reference is stable, but it's a plain local closure re-shown via the imperative alert API, not reactive state it should track.
        deleteAlert.show({ ...baseOptions, isActionLoading: true, onAction });
        try {
          await deleteGroup({ groupId: group._id });
          deleteAlert.hide();
          toast({ body: m.admin_groups_delete_success() });
        } catch (error) {
          deleteAlert.show({
            ...baseOptions,
            isActionLoading: false,
            onAction,
          });
          toast({
            body: m.admin_groups_delete_error({
              error: getErrorMessage(error),
            }),
            type: "error",
          });
        }
      };
      deleteAlert.show({ ...baseOptions, onAction });
    },
    [deleteAlert, deleteGroup, toast]
  );

  const columns = useMemo<TableColumn<GroupRow>[]>(
    () => [
      {
        header: m.admin_groups_column_name(),
        key: "name",
        renderCell: (row) => (
          <Badge label={row.name} variant={row.badgeColor} />
        ),
        width: proportional(2),
      },
      {
        header: m.admin_field_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDate(row.createdAt)}
          </Text>
        ),
        width: proportional(1),
      },
      {
        align: "end",
        header: "",
        key: "actions",
        renderCell: (row) => (
          <MoreMenu
            items={[
              {
                icon: PencilIcon,
                label: m.admin_groups_edit(),
                onClick: () => openEditDialog(row),
              },
              {
                icon: TrashIcon,
                label: m.admin_groups_delete(),
                onClick: () => confirmDelete(row),
              },
            ]}
            label={m.admin_groups_row_actions()}
          />
        ),
        resizable: false,
        width: pixel(48),
      },
    ],
    [openEditDialog, confirmDelete]
  );

  if (groups === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_groups_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={3} role="main">
            {groups.length === 0 ? (
              <Center axis="both" style={{ minHeight: 240 }}>
                <EmptyState
                  description={m.admin_groups_empty_description()}
                  title={m.admin_groups_empty_title()}
                />
              </Center>
            ) : (
              <Table<GroupRow>
                columns={columns}
                data={groups}
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
                  <Heading level={1}>{m.nav_groups()}</Heading>
                  <Text color="secondary">
                    {m.admin_groups_page_subtitle()}
                  </Text>
                </VStack>
              </StackItem>
              <Button
                label={m.admin_groups_create_button()}
                onClick={openCreateDialog}
                variant="primary"
              />
            </HStack>
          </LayoutHeader>
        }
        height="fill"
      />

      <GroupFormDialog
        initialState={groupSeed?.initialState ?? null}
        mode={groupSeed?.mode ?? null}
        onClose={closeGroupForm}
        onSubmit={handleGroupFormSubmit}
      />
      {deleteAlert.element}
    </Section>
  );
};
