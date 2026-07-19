import { useSelector } from "@tanstack/react-form";
import { forwardRef, useEffect, useImperativeHandle } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterFormOptions,
} from "@/entities/catalog-parameter";
import { useAppForm } from "@/shared/lib/form/form";

export interface DeployWorkloadFieldsHandle {
  getValues: () => Record<string, unknown>;
  // Goes through form.handleSubmit() (not a field-level-only validate call)
  // since validation here lives entirely in the form-level onChange/onMount
  // schema — individual fields carry no per-field validators of their own,
  // so handleSubmit() (which runs form-level validation too, and marks
  // fields touched) is the only method that reproduces what the old
  // form.validate() did. No onSubmit is set on the form itself — there's
  // nothing for this component to submit to, the caller does that.
  submit: () => Promise<boolean>;
}

// Keyed by template id+version from the caller (see new-workload-dialog.tsx)
// so switching templates remounts this component and gets fresh form state,
// instead of the hook needing its own imperative reset. Submission lives in
// the dialog's shared step-2 footer, not here, so this exposes
// submit/getValues imperatively rather than owning a Deploy button.
export const DeployWorkloadFields = forwardRef<
  DeployWorkloadFieldsHandle,
  { onValidityChange: (isValid: boolean) => void; template: CatalogTemplate }
>(({ onValidityChange, template }, ref) => {
  const options = useParameterFormOptions(template.parameters);
  const form = useAppForm(options);
  const isValid = useSelector(form.store, (state) => state.isValid);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  useImperativeHandle(ref, () => ({
    getValues: () => form.state.values,
    submit: async () => {
      await form.handleSubmit();
      return form.state.isSubmitSuccessful;
    },
  }));

  return <ParameterFormFields form={form} parameters={template.parameters} />;
});

DeployWorkloadFields.displayName = "DeployWorkloadFields";
