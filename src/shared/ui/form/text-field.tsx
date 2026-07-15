import type { TextInputProps } from "@astryxdesign/core/TextInput";
import { TextInput } from "@astryxdesign/core/TextInput";

import { useFieldContext } from "@/shared/lib/form/form-context";

type TextFieldProps = Pick<
  TextInputProps,
  "label" | "placeholder" | "size" | "type"
>;

// Zod (and other Standard Schema validators) report field-level errors as
// issue objects with a `.message`, not plain strings — this reads either.
const errorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

export const TextField = ({
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
      isLabelHidden
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
