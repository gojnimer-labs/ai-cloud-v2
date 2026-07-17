import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { formatDate } from "../model/format";
import type { FileFormMode, FileFormState, FileRow } from "../model/types";
import { FileFormDialog } from "./file-form-dialog";

const EMPTY_FILE_FORM: FileFormState = {
  group: "",
  label: "",
  r2Bucket: "",
  r2Key: "",
  type: "",
  userId: "",
};

export const FilesPage = () => {
  const files = useQuery(api.admin.queries.listFiles);
  const createFile = useMutation(api.admin.mutations.createFile);
  const updateFile = useMutation(api.admin.mutations.updateFile);
  const deleteFile = useMutation(api.admin.mutations.deleteFile);

  const [fileForm, setFileForm] = useState<{
    mode: FileFormMode;
    state: FileFormState;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const deleteAlert = useImperativeAlertDialog();

  const openCreateDialog = () => {
    setFormError(null);
    setFileForm({ mode: { kind: "create" }, state: EMPTY_FILE_FORM });
  };

  const openEditDialog = (file: FileRow) => {
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
  };

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

  const confirmDelete = (file: FileRow) => {
    deleteAlert.show({
      actionLabel: m.admin_files_delete_confirm_action(),
      description: m.admin_files_delete_confirm_description({
        name: file.label,
      }),
      onAction: async () => {
        await deleteFile({ fileId: file._id });
        deleteAlert.hide();
      },
      title: m.admin_files_delete_confirm_title(),
    });
  };

  const columns = useMemo<TableColumn<FileRow>[]>(
    () => [
      { header: m.label_name(), key: "label", width: proportional(1) },
      { header: m.admin_field_group(), key: "group", width: pixel(180) },
      { header: m.admin_field_type(), key: "type", width: pixel(180) },
      { header: m.admin_field_user(), key: "userEmail", width: pixel(220) },
      { header: m.admin_field_created(), key: "createdAt", width: pixel(120) },
      { header: m.admin_field_actions(), key: "actions", width: pixel(56) },
    ],
    []
  );

  const resolvedWidths = resolveColumnWidths(columns);

  if (files === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_files_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={0} role="main">
              {files.length === 0 ? (
                <Center axis="both" style={{ minHeight: 240 }}>
                  <EmptyState
                    description={m.admin_files_empty_description()}
                    title={m.admin_files_empty_title()}
                  />
                </Center>
              ) : (
                <Table<FileRow>
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
                  {files.map((file) => (
                    <TableRow key={file._id}>
                      <TableCell>
                        <Text maxLines={1} type="body">
                          {file.label}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text color="secondary" type="supporting">
                          {file.group}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text color="secondary" type="supporting">
                          {file.type}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text color="secondary" type="supporting">
                          {file.userEmail}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text color="secondary" type="supporting">
                          {formatDate(file.createdAt)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <MoreMenu
                          items={[
                            {
                              icon: PencilIcon,
                              label: m.admin_files_edit(),
                              onClick: () => openEditDialog(file),
                            },
                            { type: "divider" as const },
                            {
                              icon: TrashIcon,
                              label: m.admin_files_delete(),
                              onClick: () => confirmDelete(file),
                            },
                          ]}
                          label={m.admin_files_row_actions()}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </Table>
              )}
            </LayoutContent>
          }
          header={
            <LayoutHeader hasDivider padding={4}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <Heading level={1}>{m.nav_files()}</Heading>
                </StackItem>
                <Button
                  label={m.admin_files_new()}
                  onClick={openCreateDialog}
                  variant="primary"
                />
              </HStack>
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>

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
