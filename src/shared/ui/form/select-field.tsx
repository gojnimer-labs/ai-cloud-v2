import type { SelectorProps } from "@astryxdesign/core/Selector";
import { Selector } from "@astryxdesign/core/Selector";

import { errorMessage } from "@/shared/lib/form/error-message";
import { useFieldContext } from "@/shared/lib/form/form-context";

type SelectFieldProps = Pick<
  SelectorProps,
  "description" | "isRequired" | "label" | "options" | "placeholder"
>;

export const SelectField = ({
  description,
  isRequired,
  label,
  options,
  placeholder,
}: SelectFieldProps) => {
  const field = useFieldContext<string>();
  const error = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;

  return (
    <Selector
      description={description}
      isRequired={isRequired}
      label={label}
      onChange={(value) => field.handleChange(value)}
      options={options}
      placeholder={placeholder}
      status={
        error ? { message: errorMessage(error), type: "error" } : undefined
      }
      value={field.state.value}
    />
  );
};
