import type { CatalogParameter } from "./types";

// Fails open (treats as matching) on a pattern that can't compile under the
// unicode flag — this is a UX nicety, not enforcement, and the operator
// validates the same regex authoritatively regardless.
const testPattern = (regex: string, value: string): boolean => {
  try {
    return new RegExp(regex, "u").test(value);
  } catch {
    return true;
  }
};

// Client-side validation is a UX nicety, not the last line of defense — the
// operator re-validates every deploy/operation request authoritatively and
// rejects violations with 400 regardless of what passes here.
export const validateParameterValue = (
  parameter: CatalogParameter,
  value: unknown
): string | null => {
  const isEmpty = value === undefined || value === null || value === "";
  if (parameter.required && isEmpty) {
    return `${parameter.label} is required`;
  }
  if (isEmpty || !parameter.validation) {
    return null;
  }

  const { min, max, regex, maxLength } = parameter.validation;
  if (typeof value === "number") {
    if (min !== undefined && value < min) {
      return `Must be >= ${min}`;
    }
    if (max !== undefined && value > max) {
      return `Must be <= ${max}`;
    }
  }
  if (typeof value === "string") {
    if (maxLength !== undefined && value.length > maxLength) {
      return `Must be at most ${maxLength} characters`;
    }
    if (regex !== undefined && !testPattern(regex, value)) {
      return `Must match pattern "${regex}"`;
    }
  }
  return null;
};

// Only ever called with an already visibility-filtered parameter list —
// mirrors the operator's own ResolveParams behavior of skipping
// required/validation entirely for a hidden field.
export const validateParameters = (
  parameters: CatalogParameter[],
  values: Record<string, unknown>
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const parameter of parameters) {
    const message = validateParameterValue(parameter, values[parameter.key]);
    if (message) {
      errors[parameter.key] = message;
    }
  }
  return errors;
};
