import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import { m } from "@/paraglide/messages";

import type { GroupFormMode, GroupFormState } from "../model/types";

export const GroupFormDialog = ({
  formState,
  isSubmitting,
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
}: {
  formState: GroupFormState | null;
  isSubmitting: boolean;
  error: string | null;
  mode: GroupFormMode | null;
  onChange: (state: GroupFormState) => void;
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
    width={420}
  >
    {formState ? (
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <TextInput
                label={m.admin_groups_name_label()}
                onChange={(name) => onChange({ ...formState, name })}
                value={formState.name}
              />
              {error ? (
                <Text weight="medium">{m.admin_groups_error({ error })}</Text>
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
                isDisabled={isSubmitting || !formState.name.trim()}
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
                ? m.admin_groups_create_title()
                : m.admin_groups_edit_title()
            }
          />
        }
      />
    ) : null}
  </Dialog>
);
