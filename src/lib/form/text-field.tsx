import { TextInput, type TextInputProps } from "@astryxdesign/core/TextInput";
import { useFieldContext } from "./form-context";

type TextFieldProps = Pick<
  TextInputProps,
  "label" | "placeholder" | "size" | "type"
>;

export function TextField({ label, placeholder, size, type }: TextFieldProps) {
  const field = useFieldContext<string>();
  const error = field.state.meta.isTouched
    ? field.state.meta.errors[0]
    : undefined;

  return (
    <TextInput
      isLabelHidden
      label={label}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value)}
      placeholder={placeholder}
      size={size}
      status={error ? { message: String(error), type: "error" } : undefined}
      type={type}
      value={field.state.value}
    />
  );
}
