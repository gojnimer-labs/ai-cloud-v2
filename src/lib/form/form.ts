import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-context";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

export const { useAppForm } = createFormHook({
  fieldComponents: { TextField },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
});
