import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import { UserSelect } from "@/entities/session";
import { m } from "@/paraglide/messages";

import type { FileFormMode, FileFormState } from "../model/types";

export const FileFormDialog = ({
  formState,
  isSubmitting,
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
}: {
  formState: FileFormState | null;
  isSubmitting: boolean;
  error: string | null;
  mode: FileFormMode | null;
  onChange: (state: FileFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => (
  <Dialog
    isOpen={Boolean(formState)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={480}
  >
    {formState ? (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <TextInput
                label={m.label_name()}
                onChange={(label) => onChange({ ...formState, label })}
                value={formState.label}
              />
              <TextInput
                description={m.admin_field_group_description()}
                label={m.admin_field_group()}
                onChange={(group) => onChange({ ...formState, group })}
                value={formState.group}
              />
              <TextInput
                label={m.admin_field_type()}
                onChange={(type) => onChange({ ...formState, type })}
                value={formState.type}
              />
              <TextInput
                label={m.admin_field_r2_bucket()}
                onChange={(r2Bucket) => onChange({ ...formState, r2Bucket })}
                value={formState.r2Bucket}
              />
              <TextInput
                label={m.admin_field_r2_key()}
                onChange={(r2Key) => onChange({ ...formState, r2Key })}
                value={formState.r2Key}
              />
              <UserSelect
                description={m.admin_field_owner_id_description()}
                label={m.admin_field_owner_id()}
                onChange={(userId) => onChange({ ...formState, userId })}
                placeholder={m.admin_field_owner_id_placeholder()}
                value={formState.userId}
              />
              {error ? (
                <Text weight="medium">{m.admin_files_error({ error })}</Text>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                label={m.cancel()}
                onClick={onClose}
                variant="secondary"
              />
              <Button
                isDisabled={
                  isSubmitting ||
                  !formState.label ||
                  !formState.group ||
                  !formState.type ||
                  !formState.r2Bucket ||
                  !formState.r2Key ||
                  !formState.userId
                }
                label={isSubmitting ? m.saving() : m.save()}
                onClick={onSubmit}
                variant="primary"
              />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            onOpenChange={onClose}
            title={
              mode?.kind === "create"
                ? m.admin_files_create_title()
                : m.admin_files_edit_title()
            }
          />
        }
      />
    ) : null}
  </Dialog>
);
