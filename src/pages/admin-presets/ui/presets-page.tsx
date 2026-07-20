import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { formatDate } from "../model/format";
import type { PresetFormMode, PresetRow } from "../model/types";
import { PresetDetailPanel } from "./preset-detail-panel";
import { PresetFormDialog } from "./preset-form-dialog";

// Carries only the id, not the row object itself, so the panel it drives
// always reflects the LIVE reactive row (re-derived from `rows` below on
// every render) rather than a frozen snapshot from the moment it was
// clicked — same delete-race-safe pattern admin-clusters' clusters-page.tsx
// uses for its own detail-panel selection, chosen over the
// store-the-whole-row approach admin-files/admin-users use.
const presetById = (
  selectedPresetId: Id<"presets"> | null,
  rows: PresetRow[]
): PresetRow | null =>
  selectedPresetId
    ? (rows.find((row) => row._id === selectedPresetId) ?? null)
    : null;

const routeApi = getRouteApi("/_authed/admin/presets");

export const PresetsPage = () => {
  const presets = useQuery(api.presets.queries.listPresets);
  const groups = useQuery(api.groups.queries.listGroups);
  const deletePreset = useMutation(api.presets.mutations.deletePreset);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const { modal, presetId } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const [selectedPresetId, setSelectedPresetId] =
    useState<Id<"presets"> | null>(null);
  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

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

  // No Actions column — clicking a row (rowClickPlugin below) opens the
  // selected panel, whose own MoreMenu carries Edit/Delete instead, same
  // convention as admin-clusters' clusters-page.tsx.
  const columns = useMemo<TableColumn<PresetRow>[]>(
    () => [
      {
        header: m.admin_presets_column_name(),
        key: "displayName",
        renderCell: (row) => <Text weight="medium">{row.displayName}</Text>,
        width: proportional(2),
      },
      {
        header: m.admin_presets_column_template(),
        key: "templateId",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {row.templateId} · v{row.templateVersion}
          </Text>
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
    ],
    []
  );

  // Data-driven Table mode has no row-level onClick prop, so a whole-row
  // click target needs a plugin (transformBodyRow) instead of a per-cell
  // handler — same reasoning/pattern as admin-clusters' rowClickPlugin.
  const rowClickPlugin: TablePlugin<PresetRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => setSelectedPresetId(item._id),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    []
  );

  const selectedPreset = presetById(selectedPresetId, rows);

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
                plugins={{ rowClick: rowClickPlugin }}
              />
            )}
          </LayoutContent>
        }
        end={
          Boolean(selectedPreset) && (
            <>
              <ResizeHandle
                isAlwaysVisible={false}
                isReversed
                resizable={detailPanel.props}
              />
              <PresetDetailPanel
                onClose={() => setSelectedPresetId(null)}
                onDelete={confirmDelete}
                onEdit={openEditDialog}
                preset={selectedPreset}
                resizable={detailPanel.props}
              />
            </>
          )
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
