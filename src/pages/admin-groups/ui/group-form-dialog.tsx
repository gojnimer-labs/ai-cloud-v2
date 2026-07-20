import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type { GroupFormMode, GroupFormState } from "../model/types";

// Remounted (via the `key` GroupFormDialog gives it below) whenever the
// target group or create/edit mode changes, so its local state starts fresh
// per target without an effect resyncing it — see files-form-dialog.tsx's
// FileFormContent for the same trick with a real form library instead of
// plain useState.
const GroupFormContent = ({
  initialState,
  mode,
  onClose,
  onSubmit,
}: {
  initialState: GroupFormState;
  mode: GroupFormMode;
  onClose: () => void;
  onSubmit: (state: GroupFormState) => Promise<void>;
}) => {
  const [state, setState] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(state);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={3}>
            <TextInput
              label={m.admin_groups_name_label()}
              onChange={(name) => setState({ ...state, name })}
              value={state.name}
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
            <Button label={m.cancel()} onClick={onClose} variant="secondary" />
            <Button
              isDisabled={isSubmitting || !state.name.trim()}
              label={isSubmitting ? m.saving() : m.save()}
              onClick={handleSubmit}
              variant="primary"
            />
          </HStack>
        </LayoutFooter>
      }
      header={
        <DialogHeader
          onOpenChange={onClose}
          title={
            mode.kind === "create"
              ? m.admin_groups_create_title()
              : m.admin_groups_edit_title()
          }
        />
      }
    />
  );
};

export const GroupFormDialog = ({
  initialState,
  mode,
  onClose,
  onSubmit,
}: {
  initialState: GroupFormState | null;
  mode: GroupFormMode | null;
  onClose: () => void;
  onSubmit: (state: GroupFormState) => Promise<void>;
}) => (
  <Dialog
    isOpen={Boolean(mode)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={420}
  >
    {mode && initialState ? (
      <GroupFormContent
        initialState={initialState}
        key={mode.kind === "edit" ? mode.groupId : "create"}
        mode={mode}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    ) : null}
  </Dialog>
);
