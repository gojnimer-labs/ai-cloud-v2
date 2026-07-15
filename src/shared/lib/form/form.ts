import { createFormHook } from "@tanstack/react-form";

import { SubmitButton } from "@/shared/ui/form/submit-button";
import { TextField } from "@/shared/ui/form/text-field";

import { fieldContext, formContext } from "./form-context";

export const { useAppForm } = createFormHook({
  fieldComponents: { TextField },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
});
