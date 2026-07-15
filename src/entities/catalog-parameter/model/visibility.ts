import type { CatalogParameter } from "./types";

export const isParameterVisible = (
  parameter: CatalogParameter,
  values: Record<string, unknown>
): boolean => {
  const { visibility } = parameter;
  if (!visibility) {
    return true;
  }
  const actual = values[visibility.dependsOn];
  switch (visibility.op) {
    case "equals": {
      return actual === visibility.value;
    }
    case "notEquals": {
      return actual !== visibility.value;
    }
    case "oneOf": {
      return (visibility.values ?? []).includes(actual);
    }
    default: {
      return true;
    }
  }
};
