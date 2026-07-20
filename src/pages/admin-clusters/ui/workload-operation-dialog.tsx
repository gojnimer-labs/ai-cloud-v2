import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";

import type {
  CatalogOperation,
  OperationResult,
} from "@/entities/catalog-parameter";
import {
  OperationResultList,
  ParameterFormFields,
  useParameterFormOptions,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";
import { useAppForm } from "@/shared/lib/form/form";

// Stays open on success and shows additionalInfo instead of auto-closing:
// needs to display secret/plain results (masked secrets, reveal/copy).
export const WorkloadOperationDialog = ({
  onClose,
  onRun,
  operation,
}: {
  onClose: () => void;
  onRun: (values: Record<string, unknown>) => Promise<OperationResult>;
  operation: CatalogOperation;
}) => {
  const options = useParameterFormOptions(operation.parameters);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    ...options,
    onSubmit: async ({ value }) => {
      setResult(await onRun(value));
    },
  });

  const handleRun = async () => {
    setError(null);
    try {
      await form.handleSubmit();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : m.admin_workload_operation_error()
      );
    }
  };

  if (result) {
    return (
      <VStack gap={3}>
        <OperationResultList items={result.additionalInfo} />
        <HStack hAlign="end">
          <Button label={m.close()} onClick={onClose} variant="secondary" />
        </HStack>
      </VStack>
    );
  }

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} parameters={operation.parameters} />
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
                  ? m.admin_workload_operation_running()
                  : operation.label
              }
              onClick={handleRun}
              variant="primary"
            />
          )}
        </form.Subscribe>
      </HStack>
    </VStack>
  );
};
