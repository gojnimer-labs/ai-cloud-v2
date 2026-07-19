// Zod (and other Standard Schema validators) report field-level errors as
// issue objects with a `.message`, not plain strings — this reads either.
export const errorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};
