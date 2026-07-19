import { z } from "zod";

import { isServerManagedDataSource } from "./types";
import type { CatalogParameter } from "./types";
import { validateParameterValue } from "./validation";
import { isParameterVisible } from "./visibility";

// One loosely-typed optional key per non-server-managed parameter — the set
// of keys is genuinely runtime data (a CatalogParameter[] from an
// operator's self-reported catalog), so there's no way to get per-key
// literal zod types (z.string() vs z.number()) at compile time. Real
// per-field type/required/min/max/regex checks stay in
// validateParameterValue (unchanged) — reused verbatim here rather than
// re-ported as native zod chains, so there's exactly one implementation of
// "isEmpty" (0 and false are NOT empty — a required checkbox unchecked or a
// required number 0 must not false-positive) and of every other rule.
export const buildParameterSchema = (parameters: CatalogParameter[]) => {
  const visible = parameters.filter(
    (parameter) => !isServerManagedDataSource(parameter.dataSource)
  );
  const shape = Object.fromEntries(
    visible.map((parameter) => [parameter.key, z.unknown().optional()])
  );
  return z.object(shape).superRefine((values, ctx) => {
    for (const parameter of visible) {
      if (!isParameterVisible(parameter, values)) {
        continue;
      }
      const message = validateParameterValue(parameter, values[parameter.key]);
      if (message) {
        ctx.addIssue({ code: "custom", message, path: [parameter.key] });
      }
    }
  });
};
