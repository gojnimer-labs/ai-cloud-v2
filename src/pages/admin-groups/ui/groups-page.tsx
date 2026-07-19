import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
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
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { formatDate } from "../model/format";
import type { GroupFormMode, GroupFormState, GroupRow } from "../model/types";
import { GroupFormDialog } from "./group-form-dialog";

export const GroupsPage = () => {
  const groups = useQuery(api.groups.queries.listGroups);
  const createGroup = useMutation(api.groups.mutations.createGroup);
  const renameGroup = useMutation(api.groups.mutations.renameGroup);
  const deleteGroup = useMutation(api.groups.mutations.deleteGroup);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const [groupForm, setGroupForm] = useState<{
    mode: GroupFormMode;
    state: GroupFormState;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateDialog = () => {
    setFormError(null);
    setGroupForm({ mode: { kind: "create" }, state: { name: "" } });
  };

  const openEditDialog = useCallback((group: GroupRow) => {
    setFormError(null);
    setGroupForm({
      mode: { groupId: group._id, kind: "edit" },
      state: { name: group.name },
    });
  }, []);

  const closeGroupForm = () => {
    setGroupForm(null);
    setFormError(null);
  };

  const handleGroupFormSubmit = async () => {
    if (!groupForm) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await (groupForm.mode.kind === "create"
        ? createGroup({ name: groupForm.state.name })
        : renameGroup({
            groupId: groupForm.mode.groupId,
            name: groupForm.state.name,
          }));
      setGroupForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = useCallback(
    (group: GroupRow) => {
      deleteAlert.show({
        actionLabel: m.admin_groups_delete_confirm_action(),
        description: m.admin_groups_delete_confirm_description({
          name: group.name,
        }),
        onAction: async () => {
          try {
            await deleteGroup({ groupId: group._id });
            deleteAlert.hide();
            toast({ body: m.admin_groups_delete_success() });
          } catch (error) {
            toast({
              body: m.admin_groups_delete_error({
                error: error instanceof Error ? error.message : String(error),
              }),
              type: "error",
            });
          }
        },
        title: m.admin_groups_delete_confirm_title(),
      });
    },
    [deleteAlert, deleteGroup, toast]
  );

  const columns = useMemo<TableColumn<GroupRow>[]>(
    () => [
      {
        header: m.admin_groups_column_name(),
        key: "name",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.name}
          </Text>
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
        error={formError}
        formState={groupForm?.state ?? null}
        isSubmitting={isSubmitting}
        mode={groupForm?.mode ?? null}
        onChange={(state) =>
          setGroupForm((prev) => (prev ? { ...prev, state } : prev))
        }
        onClose={closeGroupForm}
        onSubmit={handleGroupFormSubmit}
      />
      {deleteAlert.element}
    </Section>
  );
};
