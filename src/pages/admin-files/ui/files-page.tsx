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
import { StackItem } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { formatDate } from "../model/format";
import type { FileFormMode, FileFormState, FileRow } from "../model/types";
import { FileDetailPanel } from "./file-detail-panel";
import { FileFormDialog } from "./file-form-dialog";

const FILE_FIELD_DEFS = [
  { key: "label", label: m.label_name(), type: "string" },
  { key: "group", label: m.admin_field_group(), type: "string" },
  { key: "type", label: m.admin_field_type(), type: "string" },
  { key: "userEmail", label: m.admin_field_user(), type: "string" },
] as const;

const DEFAULT_FILTERS: PowerSearchFilter[] = [];

export const FilesPage = () => {
  const files = useQuery(api.admin.queries.listFiles);
  const createFile = useMutation(api.admin.mutations.createFile);
  const updateFile = useMutation(api.admin.mutations.updateFile);
  const deleteFile = useMutation(api.admin.mutations.deleteFile);
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    FILE_FIELD_DEFS,
    "AdminFilesSearch"
  );

  const [fileForm, setFileForm] = useState<{
    mode: FileFormMode;
    state: FileFormState;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileRow | null>(null);
  const deleteAlert = useImperativeAlertDialog();
  const toast = useToast();

  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  const openEditDialog = useCallback((file: FileRow) => {
    setFormError(null);
    setFileForm({
      mode: { fileId: file._id, kind: "edit" },
      state: {
        group: file.group,
        label: file.label,
        r2Bucket: file.r2Bucket,
        r2Key: file.r2Key,
        type: file.type,
        userId: file.userId,
      },
    });
  }, []);

  const closeFileForm = () => {
    setFileForm(null);
    setFormError(null);
  };

  const handleFileFormSubmit = async () => {
    if (!fileForm) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await (fileForm.mode.kind === "create"
        ? createFile({ ...fileForm.state })
        : updateFile({ fileId: fileForm.mode.fileId, ...fileForm.state }));
      setFileForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = useCallback(
    (file: FileRow) => {
      deleteAlert.show({
        actionLabel: m.admin_files_delete_confirm_action(),
        description: m.admin_files_delete_confirm_description({
          name: file.label,
        }),
        onAction: async () => {
          try {
            await deleteFile({ fileId: file._id });
            deleteAlert.hide();
            setSelectedFile(null);
            toast({ body: m.admin_files_delete_success() });
          } catch (error) {
            toast({
              body: m.admin_files_delete_error({
                error: error instanceof Error ? error.message : String(error),
              }),
              type: "error",
            });
          }
        },
        title: m.admin_files_delete_confirm_title(),
      });
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
              <Heading level={1}>{m.nav_files()}</Heading>
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
        error={formError}
        formState={fileForm?.state ?? null}
        isSubmitting={isSubmitting}
        mode={fileForm?.mode ?? null}
        onChange={(state) =>
          setFileForm((prev) => (prev ? { ...prev, state } : prev))
        }
        onClose={closeFileForm}
        onSubmit={handleFileFormSubmit}
      />
      {deleteAlert.element}
    </Section>
  );
};
