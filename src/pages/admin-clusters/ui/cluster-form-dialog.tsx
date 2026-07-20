import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type {
  ClusterFormMode,
  ClusterFormState,
  RetentionPolicy,
} from "../model/types";

// No fixed vocabulary for cluster tags — hasCreate lets the admin type any
// value; there's nothing to search or bootstrap from.
const TAG_SEARCH_SOURCE = { bootstrap: () => [], search: () => [] };

// Remounted (via the `key` ClusterFormDialog gives it below) whenever the
// target cluster or create/edit mode changes, so its local state starts
// fresh per target without an effect resyncing it — see
// group-form-dialog.tsx's GroupFormContent for the same trick.
const ClusterFormContent = ({
  initialState,
  mode,
  onClose,
  onSubmit,
}: {
  initialState: ClusterFormState;
  mode: ClusterFormMode;
  onClose: () => void;
  onSubmit: (state: ClusterFormState) => Promise<void>;
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
              label={m.label_name()}
              onChange={(name) => setState({ ...state, name })}
              value={state.name}
            />
            <TextInput
              label={m.admin_field_description()}
              onChange={(description) => setState({ ...state, description })}
              value={state.description}
            />
            <TextInput
              label={m.admin_field_region()}
              onChange={(region) => setState({ ...state, region })}
              value={state.region}
            />
            <Tokenizer
              hasCreate
              label={m.admin_field_tags()}
              onChange={(items) =>
                setState({ ...state, tags: items.map((item) => item.label) })
              }
              searchSource={TAG_SEARCH_SOURCE}
              value={state.tags.map((tag) => ({ id: tag, label: tag }))}
            />
            <Selector
              label={m.admin_field_retention_policy()}
              onChange={(retentionPolicy) =>
                setState({
                  ...state,
                  retentionPolicy: retentionPolicy as RetentionPolicy,
                })
              }
              options={[
                { label: m.admin_retention_standard(), value: "standard" },
                { label: m.admin_retention_retain(), value: "retain" },
              ]}
              value={state.retentionPolicy}
            />
            {error ? (
              <Text weight="medium">{m.admin_clusters_error({ error })}</Text>
            ) : null}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end">
            <Button label={m.cancel()} onClick={onClose} variant="secondary" />
            <Button
              isDisabled={isSubmitting || !state.name}
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
              ? m.admin_clusters_create_title()
              : m.admin_clusters_edit_title()
          }
        />
      }
    />
  );
};

export const ClusterFormDialog = ({
  initialState,
  mode,
  onClose,
  onSubmit,
}: {
  initialState: ClusterFormState | null;
  mode: ClusterFormMode | null;
  onClose: () => void;
  onSubmit: (state: ClusterFormState) => Promise<void>;
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
    {mode && initialState ? (
      <ClusterFormContent
        initialState={initialState}
        key={mode.kind === "edit" ? mode.operatorId : "create"}
        mode={mode}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    ) : null}
  </Dialog>
);
