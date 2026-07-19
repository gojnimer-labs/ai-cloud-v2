import { createFormHook } from "@tanstack/react-form";

import { CheckboxField } from "@/shared/ui/form/checkbox-field";
import { NumberField } from "@/shared/ui/form/number-field";
import { SelectField } from "@/shared/ui/form/select-field";
import { SubmitButton } from "@/shared/ui/form/submit-button";
import { TextField } from "@/shared/ui/form/text-field";

import { fieldContext, formContext } from "./form-context";

export const { useAppForm } = createFormHook({
  fieldComponents: { CheckboxField, NumberField, SelectField, TextField },
  fieldContext,
  formComponents: { SubmitButton },
  formContext,
});

// useAppForm's generic signature has 10+ chained type parameters with no
// defaults past the first, so `ReturnType<typeof useAppForm>` resolves them
// all to `unknown` — a real call site's concrete instance (whose zod schema
// and defaultValues types actually got inferred) isn't assignable to that.
// Components that accept "any tanstack-form instance built from
// useParameterFormOptions" (ParameterFormFields, and consumers passing a
// form instance around) use this loosened alias instead of fighting that
// variance; each call site's own `useAppForm(...)` call is still fully
// typed where it's actually constructed.
// oxlint-disable-next-line no-explicit-any -- see comment above
export type AppFormInstance = any;
