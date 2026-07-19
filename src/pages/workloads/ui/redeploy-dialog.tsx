import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterFormOptions,
} from "@/entities/catalog-parameter";
import { useAppForm } from "@/shared/lib/form/form";

// Reuses the same parameter-form building blocks as DeployWorkloadForm/
// OperationDialog, pre-filled from the row's persisted `config` (the
// "last-applied config" per convex/schema.ts's doc comment). Deliberately
// narrower than DeployWorkloadForm: requestRedeployAction only ever takes
// {workloadId, params} — redeploy can't rename a workload or move it to a
// different operator, so there's no displayName/tags field here at all.
export const RedeployDialog = ({
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
          : "The redeploy request failed."
      );
    }
  };

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} parameters={template.parameters} />
      {error ? <Text weight="medium">Error: {error}</Text> : null}
      <HStack gap={2} hAlign="end">
        <Button label="Cancel" onClick={onClose} variant="secondary" />
        <form.Subscribe
          selector={(state) => [state.isValid, state.isSubmitting] as const}
        >
          {([isValid, isSubmitting]) => (
            <Button
              isDisabled={!isValid || isSubmitting}
              label={isSubmitting ? "Redeploying…" : "Redeploy"}
              onClick={handleRedeploy}
              variant="primary"
            />
          )}
        </form.Subscribe>
      </HStack>
    </VStack>
  );
};
