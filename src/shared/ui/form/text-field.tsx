import type { TextInputProps } from "@astryxdesign/core/TextInput";
import { TextInput } from "@astryxdesign/core/TextInput";

import { errorMessage } from "@/shared/lib/form/error-message";
import { useFieldContext } from "@/shared/lib/form/form-context";

type TextFieldProps = Pick<
  TextInputProps,
  | "description"
  | "isLabelHidden"
  | "isRequired"
  | "label"
  | "placeholder"
  | "size"
  | "type"
>;

export const TextField = ({
  description,
  isLabelHidden = true,
  isRequired,
  label,
  placeholder,
  size,
  type,
}: TextFieldProps) => {
  const field = useFieldContext<string>();
  const error = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;

  return (
    <TextInput
      description={description}
      isLabelHidden={isLabelHidden}
      isRequired={isRequired}
      label={label}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value)}
      placeholder={placeholder}
      size={size}
      status={
        error ? { message: errorMessage(error), type: "error" } : undefined
      }
      type={type}
      value={field.state.value}
    />
  );
};
