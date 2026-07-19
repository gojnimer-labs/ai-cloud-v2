import type { CheckboxInputProps } from "@astryxdesign/core/CheckboxInput";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";

import { errorMessage } from "@/shared/lib/form/error-message";
import { useFieldContext } from "@/shared/lib/form/form-context";

type CheckboxFieldProps = Pick<
  CheckboxInputProps,
  "description" | "isRequired" | "label"
>;

export const CheckboxField = ({
  description,
  isRequired,
  label,
}: CheckboxFieldProps) => {
  const field = useFieldContext<boolean>();
  const error = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;

  return (
    <CheckboxInput
      description={description}
      isRequired={isRequired}
      label={label}
      onBlur={field.handleBlur}
      onChange={(checked) => field.handleChange(checked)}
      status={
        error ? { message: errorMessage(error), type: "error" } : undefined
      }
      value={field.state.value}
    />
  );
};
