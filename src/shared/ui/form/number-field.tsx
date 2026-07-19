import type { NumberInputProps } from "@astryxdesign/core/NumberInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";

import { errorMessage } from "@/shared/lib/form/error-message";
import { useFieldContext } from "@/shared/lib/form/form-context";

type NumberFieldProps = Pick<
  NumberInputProps,
  "description" | "isRequired" | "label" | "max" | "min" | "placeholder"
>;

export const NumberField = ({
  description,
  isRequired,
  label,
  max,
  min,
  placeholder,
}: NumberFieldProps) => {
  const field = useFieldContext<number | null>();
  const error = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;

  return (
    <NumberInput
      description={description}
      isRequired={isRequired}
      label={label}
      max={max}
      min={min}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value)}
      placeholder={placeholder}
      status={
        error ? { message: errorMessage(error), type: "error" } : undefined
      }
      value={field.state.value}
    />
  );
};
