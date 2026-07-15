import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";

import { m } from "@/paraglide/messages";

import type {
  ClusterFormMode,
  ClusterFormState,
  RetentionPolicy,
} from "../model/types";

// No fixed vocabulary for cluster tags — hasCreate lets the admin type any
// value; there's nothing to search or bootstrap from.
const TAG_SEARCH_SOURCE = { bootstrap: () => [], search: () => [] };

export const ClusterFormDialog = ({
  formState,
  isSubmitting,
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
}: {
  formState: ClusterFormState | null;
  isSubmitting: boolean;
  error: string | null;
  mode: ClusterFormMode | null;
  onChange: (state: ClusterFormState) => void;
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
                onChange={(name) => onChange({ ...formState, name })}
                value={formState.name}
              />
              <TextInput
                label={m.admin_field_description()}
                onChange={(description) =>
                  onChange({ ...formState, description })
                }
                value={formState.description}
              />
              <TextInput
                label={m.admin_field_region()}
                onChange={(region) => onChange({ ...formState, region })}
                value={formState.region}
              />
              <Tokenizer
                hasCreate
                label={m.admin_field_tags()}
                onChange={(items) =>
                  onChange({
                    ...formState,
                    tags: items.map((item) => item.label),
                  })
                }
                searchSource={TAG_SEARCH_SOURCE}
                value={formState.tags.map((tag) => ({ id: tag, label: tag }))}
              />
              <Selector
                label={m.admin_field_retention_policy()}
                onChange={(retentionPolicy) =>
                  onChange({
                    ...formState,
                    retentionPolicy: retentionPolicy as RetentionPolicy,
                  })
                }
                options={[
                  { label: m.admin_retention_standard(), value: "standard" },
                  { label: m.admin_retention_retain(), value: "retain" },
                ]}
                value={formState.retentionPolicy}
              />
              {error ? (
                <Text weight="medium">{m.admin_clusters_error({ error })}</Text>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label={m.cancel()}
                onClick={onClose}
                variant="secondary"
              />
              <Button
                isDisabled={isSubmitting || !formState.name}
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
                ? m.admin_clusters_create_title()
                : m.admin_clusters_edit_title()
            }
          />
        }
      />
    ) : null}
  </Dialog>
);
