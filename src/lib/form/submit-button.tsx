import { Button, type ButtonProps } from "@astryxdesign/core/Button";
import { useFormContext } from "./form-context";

type SubmitButtonProps = Pick<ButtonProps, "label" | "size" | "variant">;

export function SubmitButton({ label, size, variant }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button
          isLoading={isSubmitting}
          label={label}
          size={size}
          type="submit"
          variant={variant}
        />
      )}
    </form.Subscribe>
  );
}
