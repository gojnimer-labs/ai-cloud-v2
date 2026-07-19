import { useMemo } from "react";

import { defaultParameterValues } from "./default-values";
import { buildParameterSchema } from "./schema";
import type { CatalogParameter } from "./types";

// Not a hook that owns a form — every consumer needs its own onSubmit (to
// call whatever action actually deploys/redeploys/runs an operation), so
// this only builds the shared useAppForm options; callers spread these into
// their own useAppForm({...options, onSubmit: ...}) call directly.
export const useParameterFormOptions = (
  parameters: CatalogParameter[],
  initialValues?: Record<string, unknown>
) => {
  const schema = useMemo(() => buildParameterSchema(parameters), [parameters]);
  const defaultValues = useMemo(
    () => initialValues ?? defaultParameterValues(parameters),
    [parameters, initialValues]
  );
  // onMount is required, not just onChange: FormApi only runs
  // validateSync("mount") when validators.onMount is set — without it,
  // state.isValid is optimistically true until the user first touches a
  // field, so a submit button would render enabled on an empty required
  // form. Same schema object for both, no extra cost.
  return { defaultValues, validators: { onChange: schema, onMount: schema } };
};
