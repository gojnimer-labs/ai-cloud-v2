import type { CatalogParameter } from "./types";

export const defaultParamValues = (
  parameters: CatalogParameter[]
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const param of parameters) {
    if (param.source === "user" && param.default !== undefined) {
      values[param.key] = param.default;
    }
  }
  return values;
};
