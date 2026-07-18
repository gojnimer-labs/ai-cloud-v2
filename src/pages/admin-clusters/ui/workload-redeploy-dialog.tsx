import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterForm,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";

// Admin mirror of src/pages/workloads/ui/redeploy-dialog.tsx — pre-filled
// from the row's persisted `config` (the "last-applied config" per
// convex/schema.ts's doc comment). Deliberately narrower than a deploy
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
  const form = useParameterForm({
    initialValues: config,
    parameters: template.parameters,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRedeploy = async () => {
    if (!form.validate()) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onRedeploy(form.values);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : m.admin_workload_redeploy_error()
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} />
      {error ? (
        <Text weight="medium">{m.admin_clusters_error({ error })}</Text>
      ) : null}
      <HStack gap={2} hAlign="end">
        <Button label={m.cancel()} onClick={onClose} variant="secondary" />
        <Button
          isDisabled={!form.isValid || isSubmitting}
          label={
            isSubmitting
              ? m.admin_workload_redeploying()
              : m.admin_workload_redeploy()
          }
          onClick={handleRedeploy}
          variant="primary"
        />
      </HStack>
    </VStack>
  );
};
