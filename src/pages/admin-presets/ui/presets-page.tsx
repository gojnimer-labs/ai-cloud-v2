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
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { formatDate } from "../model/format";
import type { PresetFormMode, PresetRow } from "../model/types";
import { PresetFormDialog } from "./preset-form-dialog";

const routeApi = getRouteApi("/_authed/admin/presets");

export const PresetsPage = () => {
  const presets = useQuery(api.presets.queries.listPresets);
  const groups = useQuery(api.groups.queries.listGroups);
  const deletePreset = useMutation(api.presets.mutations.deletePreset);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const { modal, presetId } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const groupById = useMemo(
    () =>
      new Map(
        (groups ?? []).map((group) => [
          group._id,
          { badgeColor: group.badgeColor, name: group.name },
        ])
      ),
    [groups]
  );

  const rows = useMemo<PresetRow[]>(
    () =>
      (presets ?? []).map((preset) => {
        const memberGroups = preset.groupIds
          .map((groupId) => groupById.get(groupId))
          .filter((group): group is NonNullable<typeof group> =>
            Boolean(group)
          );
        return {
          ...preset,
          groupBadgeColors: memberGroups.map((group) => group.badgeColor),
          groupNames: memberGroups.map((group) => group.name),
        };
      }),
    [presets, groupById]
  );

  // Resolves the URL's raw presetId string against the already-loaded rows
  // to get a properly-typed Id<"presets"> — same "look it up rather than
  // cast the URL param" pattern as admin-groups' groupSeed. A stale/deleted
  // presetId (edited elsewhere, or a reload after delete) resolves to
  // `null` here, so PresetFormDialog never opens for a target that no
  // longer exists rather than opening blank.
  const editTarget = useMemo(
    () =>
      modal === "edit" && presetId
        ? (rows.find((row) => row._id === presetId) ?? null)
        : null,
    [modal, presetId, rows]
  );

  const formMode = useMemo<PresetFormMode | null>(() => {
    if (modal === "create") {
      return { kind: "create" };
    }
    return editTarget ? { kind: "edit", presetId: editTarget._id } : null;
  }, [modal, editTarget]);

  const openCreateDialog = () => {
    navigate({
      search: (prev) => ({ ...prev, modal: "create", presetId: undefined }),
    });
  };

  const openEditDialog = useCallback(
    (row: PresetRow) => {
      navigate({
        search: (prev) => ({ ...prev, modal: "edit", presetId: row._id }),
      });
    },
    [navigate]
  );

  const closePresetForm = useCallback(() => {
    navigate({
      replace: true,
      search: (prev) => {
        const { modal: _modal, presetId: _presetId, ...rest } = prev;
        return rest;
      },
    });
  }, [navigate]);

  const confirmDelete = useCallback(
    (row: PresetRow) => {
      const baseOptions = {
        actionLabel: m.admin_presets_delete_confirm_action(),
        description: m.admin_presets_delete_confirm_description({
          name: row.displayName,
        }),
        title: m.admin_presets_delete_confirm_title(),
      };
      const onAction = async () => {
        // oxlint-disable-next-line react/react-compiler -- onAction refers to itself so a retry click after a failure reuses the same handler; same pattern as admin-groups' confirmDelete.
        deleteAlert.show({ ...baseOptions, isActionLoading: true, onAction });
        try {
          await deletePreset({ presetId: row._id });
          deleteAlert.hide();
          toast({ body: m.admin_presets_delete_success() });
        } catch (error) {
          deleteAlert.show({
            ...baseOptions,
            isActionLoading: false,
            onAction,
          });
          toast({
            body: m.admin_presets_delete_error({
              error: getErrorMessage(error),
            }),
            type: "error",
          });
        }
      };
      deleteAlert.show({ ...baseOptions, onAction });
    },
    [deleteAlert, deletePreset, toast]
  );

  const columns = useMemo<TableColumn<PresetRow>[]>(
    () => [
      {
        header: m.admin_presets_column_name(),
        key: "displayName",
        renderCell: (row) => (
          <HStack gap={2} vAlign="center">
            <Thumbnail
              alt=""
              label={row.displayName}
              src={row.thumbnailUrl ?? undefined}
            />
            <VStack gap={0}>
              <Text weight="medium">{row.displayName}</Text>
              <Text color="secondary" type="supporting">
                {row.templateId} · v{row.templateVersion}
              </Text>
            </VStack>
          </HStack>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_presets_column_version(),
        key: "currentVersion",
        renderCell: (row) => (
          <Badge label={`v${row.currentVersion}`} variant="neutral" />
        ),
        width: proportional(1),
      },
      {
        header: m.admin_presets_column_groups(),
        key: "groupNames",
        renderCell: (row) =>
          row.groupNames.length > 0 ? (
            <HStack gap={1} wrap="wrap">
              {row.groupNames.map((name, index) => (
                <Badge
                  key={`${name}-${index}`}
                  label={name}
                  variant={row.groupBadgeColors[index]}
                />
              ))}
            </HStack>
          ) : (
            <Text color="secondary">{m.admin_presets_no_groups()}</Text>
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
                label: m.admin_presets_edit(),
                onClick: () => openEditDialog(row),
              },
              {
                icon: TrashIcon,
                label: m.admin_presets_delete(),
                onClick: () => confirmDelete(row),
              },
            ]}
            label={m.admin_presets_row_actions()}
          />
        ),
        resizable: false,
        width: pixel(48),
      },
    ],
    [openEditDialog, confirmDelete]
  );

  if (presets === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_presets_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={3} role="main">
            {rows.length === 0 ? (
              <Center axis="both" style={{ minHeight: 240 }}>
                <EmptyState
                  description={m.admin_presets_empty_description()}
                  title={m.admin_presets_empty_title()}
                />
              </Center>
            ) : (
              <Table<PresetRow>
                columns={columns}
                data={rows}
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
                  <Heading level={1}>{m.nav_presets()}</Heading>
                  <Text color="secondary">
                    {m.admin_presets_page_subtitle()}
                  </Text>
                </VStack>
              </StackItem>
              <Button
                label={m.admin_presets_create_button()}
                onClick={openCreateDialog}
                variant="primary"
              />
            </HStack>
          </LayoutHeader>
        }
        height="fill"
      />

      <PresetFormDialog mode={formMode} onClose={closePresetForm} />
      {deleteAlert.element}
    </Section>
  );
};
