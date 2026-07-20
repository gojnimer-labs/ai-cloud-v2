import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterFormOptions,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";
import { useAppForm } from "@/shared/lib/form/form";

// Pre-filled from the row's persisted `config` (the "last-applied config"
// per convex/schema.ts's doc comment). Deliberately narrower than a deploy
// form: adminRequestRedeploy only ever takes {workloadId, params} — redeploy
// can't rename a workload or move it to a different operator, so there's no
// displayName/tags field here at all.
export const WorkloadRedeployDialog = ({
  config,
  onClose,
  onRedeploy,
  template,
}: {
  config: Record<string, unknown> | undefined;
  onClose: () => void;
  onRedeploy: (values: Record<string, unknown>) => Promise<unknown>;
  template: CatalogTemplate;
}) => {
  const options = useParameterFormOptions(template.parameters, config);
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    ...options,
    onSubmit: async ({ value }) => {
      await onRedeploy(value);
      onClose();
    },
  });

  const handleRedeploy = async () => {
    setError(null);
    try {
      await form.handleSubmit();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : m.admin_workload_redeploy_error()
      );
    }
  };

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} parameters={template.parameters} />
      {error ? (
        <Text weight="medium">{m.admin_clusters_error({ error })}</Text>
      ) : null}
      <HStack gap={2} hAlign="end">
        <Button label={m.cancel()} onClick={onClose} variant="secondary" />
        <form.Subscribe
          selector={(state) => [state.isValid, state.isSubmitting] as const}
        >
          {([isValid, isSubmitting]) => (
            <Button
              isDisabled={!isValid || isSubmitting}
              label={
                isSubmitting
                  ? m.admin_workload_redeploying()
                  : m.admin_workload_redeploy()
              }
              onClick={handleRedeploy}
              variant="primary"
            />
          )}
        </form.Subscribe>
      </HStack>
    </VStack>
  );
};
