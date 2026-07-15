import { isServerManagedDataSource } from "./types";
import type { CatalogParameter } from "./types";

export const defaultParameterValues = (
  parameters: CatalogParameter[]
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const parameter of parameters) {
    if (
      !isServerManagedDataSource(parameter.dataSource) &&
      parameter.default !== undefined
    ) {
      values[parameter.key] = parameter.default;
    }
  }
  return values;
};
