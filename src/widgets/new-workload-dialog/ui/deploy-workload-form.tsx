import { forwardRef, useEffect, useImperativeHandle } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterForm,
} from "@/entities/catalog-parameter";

export interface DeployWorkloadFieldsHandle {
  getValues: () => Record<string, unknown>;
  validate: () => boolean;
}

// Keyed by template id+version from the caller (see new-workload-dialog.tsx)
// so switching templates remounts this component and gets fresh form state,
// instead of the hook needing its own imperative reset. Submission lives in
// the dialog's shared step-2 footer, not here, so this exposes
// validate/getValues imperatively rather than owning a Deploy button.
export const DeployWorkloadFields = forwardRef<
  DeployWorkloadFieldsHandle,
  { onValidityChange: (isValid: boolean) => void; template: CatalogTemplate }
>(({ onValidityChange, template }, ref) => {
  const form = useParameterForm({ parameters: template.parameters });

  useEffect(() => {
    onValidityChange(form.isValid);
  }, [form.isValid, onValidityChange]);

  useImperativeHandle(ref, () => ({
    getValues: () => form.values,
    validate: form.validate,
  }));

  return <ParameterFormFields form={form} />;
});

DeployWorkloadFields.displayName = "DeployWorkloadFields";
