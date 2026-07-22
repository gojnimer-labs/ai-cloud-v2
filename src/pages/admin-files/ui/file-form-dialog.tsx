import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";

import { UserSelect } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { useAppForm } from "@/shared/lib/form/form";
import { requiredText } from "@/shared/lib/form/schemas";

import type { FileFormMode, FileFormState } from "../model/types";

// onMount is required alongside onChange: FormApi only runs validateSync
// ("mount") when validators.onMount is set — without it, state.isValid is
// optimistically true until the user first touches a field, so Save would
// render enabled on a blank required form. Same reasoning as
// use-parameter-form.ts#useParameterFormOptions.
const requiredValidators = { onChange: requiredText, onMount: requiredText };

// Remounted (via the `key` FileFormDialog gives it below) whenever the
// target file or create/edit mode changes — useAppForm's defaultValues only
// ever apply on mount, so a fresh instance per file is how the form actually
// picks up a different file's values, same trick new-workload-dialog.tsx
// uses for its template-scoped fields.
const FileFormContent = ({
  initialValues,
  mode,
  onClose,
  onSubmit,
}: {
  initialValues: FileFormState;
  mode: FileFormMode;
  onClose: () => void;
  onSubmit: (values: FileFormState) => Promise<void>;
}) => {
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  // FormApi re-throws whatever onSubmit throws after validating — see
  // operation-dialog.tsx#handleRun for the same pattern.
  const handleSave = async () => {
    setError(null);
    try {
      await form.handleSubmit();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : m.admin_files_error_generic()
      );
    }
  };

  return (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={3}>
            <form.AppField name="label" validators={requiredValidators}>
              {(field) => (
                <field.TextField isLabelHidden={false} label={m.label_name()} />
              )}
            </form.AppField>
            <form.AppField name="group" validators={requiredValidators}>
              {(field) => (
                <field.TextField
                  description={m.admin_field_group_description()}
                  isLabelHidden={false}
                  label={m.admin_field_group()}
                />
              )}
            </form.AppField>
            <form.AppField name="type" validators={requiredValidators}>
              {(field) => (
                <field.TextField
                  isLabelHidden={false}
                  label={m.admin_field_type()}
                />
              )}
            </form.AppField>
            <form.AppField name="r2Bucket" validators={requiredValidators}>
              {(field) => (
                <field.TextField
                  isLabelHidden={false}
                  label={m.admin_field_r2_bucket()}
                />
              )}
            </form.AppField>
            <form.AppField name="r2Key" validators={requiredValidators}>
              {(field) => (
                <field.TextField
                  isLabelHidden={false}
                  label={m.admin_field_r2_key()}
                />
              )}
            </form.AppField>
            <form.AppField name="userId" validators={requiredValidators}>
              {(field) => (
                <UserSelect
                  description={m.admin_field_owner_id_description()}
                  label={m.admin_field_owner_id()}
                  onChange={field.handleChange}
                  placeholder={m.admin_field_owner_id_placeholder()}
                  value={field.state.value}
                />
              )}
            </form.AppField>
            {error ? (
              <Text weight="medium">{m.admin_files_error({ error })}</Text>
            ) : null}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end">
            <Button label={m.cancel()} onClick={onClose} variant="secondary" />
            <form.Subscribe
              selector={(state) => [state.isValid, state.isSubmitting] as const}
            >
              {([isValid, isSubmitting]) => (
                <Button
                  isDisabled={!isValid || isSubmitting}
                  label={isSubmitting ? m.saving() : m.save()}
                  onClick={handleSave}
                  variant="primary"
                />
              )}
            </form.Subscribe>
          </HStack>
        </LayoutFooter>
      }
      header={
        <DialogHeader
          onOpenChange={onClose}
          title={
            mode.kind === "create"
              ? m.admin_files_create_title()
              : m.admin_files_edit_title()
          }
        />
      }
    />
  );
};

export const FileFormDialog = ({
  initialValues,
  mode,
  onClose,
  onSubmit,
}: {
  initialValues: FileFormState | null;
  mode: FileFormMode | null;
  onClose: () => void;
  onSubmit: (values: FileFormState) => Promise<void>;
}) => (
  <Dialog
    isOpen={Boolean(mode)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={480}
  >
    {mode && initialValues ? (
      <FileFormContent
        initialValues={initialValues}
        key={mode.kind === "edit" ? mode.fileId : "create"}
        mode={mode}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    ) : null}
  </Dialog>
);
