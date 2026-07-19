import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
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
import { useAppForm } from "@/shared/lib/form/form";

// Stays open on success and shows additionalInfo instead of auto-closing —
// a direct consequence of needing to display secret/plain results (masked
// secrets, reveal/copy). refreshable is available on `operation` but
// deliberately unused here: no polling/auto-refresh is built, this is a
// product decision left for later, not an oversight.
export const OperationDialog = ({
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

  // FormApi re-throws whatever onSubmit throws after validating, so this
  // is a 1:1 swap for the old "if (!form.validate()) return; try { await
  // onRun(form.values) } ..." — form.handleSubmit() both validates and
  // runs the submit above.
  const handleRun = async () => {
    setError(null);
    try {
      await form.handleSubmit();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The operation failed."
      );
    }
  };

  if (result) {
    return (
      <VStack gap={3}>
        <OperationResultList items={result.additionalInfo} />
        <HStack hAlign="end">
          <Button label="Close" onClick={onClose} variant="secondary" />
        </HStack>
      </VStack>
    );
  }

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} parameters={operation.parameters} />
      {error ? <Text weight="medium">Error: {error}</Text> : null}
      <HStack gap={2} hAlign="end">
        <Button label="Cancel" onClick={onClose} variant="secondary" />
        <form.Subscribe
          selector={(state) => [state.isValid, state.isSubmitting] as const}
        >
          {([isValid, isSubmitting]) => (
            <Button
              isDisabled={!isValid || isSubmitting}
              label={isSubmitting ? "Running…" : operation.label}
              onClick={handleRun}
              variant="primary"
            />
          )}
        </form.Subscribe>
      </HStack>
    </VStack>
  );
};
