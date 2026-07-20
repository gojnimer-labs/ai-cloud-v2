import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { StackItem, VStack } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { formatDate } from "../model/format";
import type { FileFormState, FileRow } from "../model/types";
import { FileDetailPanel } from "./file-detail-panel";
import { FileFormDialog } from "./file-form-dialog";

const FILE_FIELD_DEFS = [
  { key: "label", label: m.label_name(), type: "string" },
  { key: "group", label: m.admin_field_group(), type: "string" },
  { key: "type", label: m.admin_field_type(), type: "string" },
  { key: "userEmail", label: m.admin_field_user(), type: "string" },
] as const;

const DEFAULT_FILTERS: PowerSearchFilter[] = [];

const EMPTY_FILE_FORM_STATE: FileFormState = {
  group: "",
  label: "",
  r2Bucket: "",
  r2Key: "",
  type: "",
  userId: "",
};

const routeApi = getRouteApi("/_authed/admin/files");

export const FilesPage = () => {
  const files = useQuery(api.files.queries.listFiles);
  const createFile = useMutation(api.files.mutations.createFile);
  const updateFile = useMutation(api.files.mutations.updateFile);
  const deleteFile = useMutation(api.files.mutations.deleteFile);
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    FILE_FIELD_DEFS,
    "AdminFilesSearch"
  );

  const { fileId, modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileRow | null>(null);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  // Pure derivation from the URL + the already-loaded files query — no local
  // state to keep in sync. `undefined` files (still loading) and an unknown
  // fileId (stale/deleted elsewhere) both resolve to "nothing to show"
  // rather than flashing a dialog open with the wrong content.
  const fileSeed = useMemo(() => {
    if (modal === "create") {
      return {
        initialValues: EMPTY_FILE_FORM_STATE,
        mode: { kind: "create" as const },
      };
    }
    if (modal === "edit" && fileId && files) {
      const file = files.find((candidate) => candidate._id === fileId);
      return file
        ? {
            initialValues: {
              group: file.group,
              label: file.label,
              r2Bucket: file.r2Bucket,
              r2Key: file.r2Key,
              type: file.type,
              userId: file.userId,
            },
            mode: { fileId: file._id, kind: "edit" as const },
          }
        : null;
    }
    return null;
  }, [modal, fileId, files]);

  const openEditDialog = useCallback(
    (file: FileRow) => {
      navigate({
        search: (prev) => ({ ...prev, fileId: file._id, modal: "edit" }),
      });
    },
    [navigate]
  );

  const closeFileForm = useCallback(() => {
    navigate({
      replace: true,
      search: (prev) => {
        const { fileId: _fileId, modal: _modal, ...rest } = prev;
        return rest;
      },
    });
  }, [navigate]);

  // Errors are surfaced by the dialog itself (form.handleSubmit rethrows
  // whatever this throws) — see file-form-dialog.tsx#handleSave.
  const handleFileFormSubmit = async (values: FileFormState) => {
    if (!fileSeed) {
      return;
    }
    await (fileSeed.mode.kind === "create"
      ? createFile({ ...values })
      : updateFile({ fileId: fileSeed.mode.fileId, ...values }));
    // Clears the URL too, not just this render — otherwise a reload after a
    // successful save reopens the dialog from the now-stale
    // ?modal=edit&fileId= still sitting in the address bar.
    closeFileForm();
  };

  const confirmDelete = useCallback(
    (file: FileRow) => {
      const baseOptions = {
        actionLabel: m.admin_files_delete_confirm_action(),
        description: m.admin_files_delete_confirm_description({
          name: file.label,
        }),
        title: m.admin_files_delete_confirm_title(),
      };
      const onAction = async () => {
        // Disables the action button for the duration of the request —
        // without this, a fast double-click fires onAction twice before
        // the first request resolves.
        // oxlint-disable-next-line react/react-compiler -- onAction refers to itself so a retry click after a failure reuses the same handler; the compiler can't prove this self-reference is stable, but it's a plain local closure re-shown via the imperative alert API, not reactive state it should track.
        deleteAlert.show({ ...baseOptions, isActionLoading: true, onAction });
        try {
          await deleteFile({ fileId: file._id });
          deleteAlert.hide();
          setSelectedFile(null);
          toast({ body: m.admin_files_delete_success() });
        } catch (error) {
          deleteAlert.show({
            ...baseOptions,
            isActionLoading: false,
            onAction,
          });
          toast({
            body: m.admin_files_delete_error({
              error: getErrorMessage(error),
            }),
            type: "error",
          });
        }
      };
      deleteAlert.show({ ...baseOptions, onAction });
    },
    [deleteAlert, deleteFile, toast]
  );

  const rowClickPlugin: TablePlugin<FileRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => setSelectedFile(item),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    []
  );

  const columns = useMemo<TableColumn<FileRow>[]>(
    () => [
      {
        header: m.label_name(),
        key: "label",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.label}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_field_group(),
        key: "group",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {row.group}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_field_type(),
        key: "type",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {row.type}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_field_user(),
        key: "userEmail",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.userEmail}
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
    ],
    []
  );

  const filteredFiles = useMemo(
    () => (files ? applyFilters(filters, files) : []),
    [files, filters, applyFilters]
  );

  if (files === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_files_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={0} role="main">
            {filteredFiles.length === 0 ? (
              <Center axis="both" style={{ minHeight: 240 }}>
                <EmptyState
                  description={m.admin_files_empty_description()}
                  title={m.admin_files_empty_title()}
                />
              </Center>
            ) : (
              <Table<FileRow>
                columns={columns}
                data={filteredFiles}
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
          selectedFile && (
            <>
              <ResizeHandle
                isAlwaysVisible={false}
                isReversed
                resizable={detailPanel.props}
              />
              <FileDetailPanel
                file={selectedFile}
                onClose={() => setSelectedFile(null)}
                onDelete={confirmDelete}
                onEdit={openEditDialog}
                resizable={detailPanel.props}
              />
            </>
          )
        }
        header={
          <>
            <LayoutHeader padding={4}>
              <VStack gap={2}>
                <Heading level={1}>{m.nav_files()}</Heading>
                <Text color="secondary">{m.admin_files_page_subtitle()}</Text>
              </VStack>
            </LayoutHeader>
            <Toolbar
              dividers={["bottom"]}
              label={m.nav_files()}
              startContent={
                <StackItem size="fill">
                  <PowerSearch
                    config={config}
                    filters={filters}
                    onChange={(newFilters) => setFilters([...newFilters])}
                    placeholder={m.admin_files_search_placeholder()}
                    popoverSaveButtonLabel={m.apply()}
                    resultCount={filteredFiles.length}
                  />
                </StackItem>
              }
            />
          </>
        }
        height="fill"
      />

      <FileFormDialog
        initialValues={fileSeed?.initialValues ?? null}
        mode={fileSeed?.mode ?? null}
        onClose={closeFileForm}
        onSubmit={handleFileFormSubmit}
      />
      {deleteAlert.element}
    </Section>
  );
};
