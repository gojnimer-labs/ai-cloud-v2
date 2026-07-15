import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterForm,
} from "@/entities/catalog-parameter";

// Keyed by template id from the caller (see workloads-page.tsx) so
// switching templates remounts this component and gets fresh form state,
// instead of the hook needing its own imperative reset.
export const DeployWorkloadForm = ({
  isDeploying,
  onDeploy,
  template,
}: {
  isDeploying: boolean;
  onDeploy: (values: Record<string, unknown>) => void;
  template: CatalogTemplate;
}) => {
  const form = useParameterForm({ parameters: template.parameters });

  const handleDeploy = () => {
    if (form.validate()) {
      onDeploy(form.values);
    }
  };

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} />
      <HStack>
        <Button
          isDisabled={!form.isValid || isDeploying}
          label={isDeploying ? "Deploying…" : "Deploy"}
          onClick={handleDeploy}
          variant="primary"
        />
      </HStack>
    </VStack>
  );
};
