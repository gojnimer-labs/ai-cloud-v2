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
  useParameterForm,
} from "@/entities/catalog-parameter";

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
  const form = useParameterForm({ parameters: operation.parameters });
  const [result, setResult] = useState<OperationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!form.validate()) {
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      setResult(await onRun(form.values));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The operation failed."
      );
    } finally {
      setIsRunning(false);
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
      <ParameterFormFields form={form} />
      {error ? <Text weight="medium">Error: {error}</Text> : null}
      <HStack gap={2} hAlign="end">
        <Button label="Cancel" onClick={onClose} variant="secondary" />
        <Button
          isDisabled={!form.isValid || isRunning}
          label={isRunning ? "Running…" : operation.label}
          onClick={handleRun}
          variant="primary"
        />
      </HStack>
    </VStack>
  );
};
