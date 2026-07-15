import { useMemo, useState } from "react";

import { defaultParameterValues } from "./default-values";
import { isServerManagedDataSource } from "./types";
import type { CatalogParameter } from "./types";
import { validateParameters } from "./validation";
import { isParameterVisible } from "./visibility";

export interface UseParameterFormResult {
  errors: Record<string, string>;
  isValid: boolean;
  setValue: (key: string, value: unknown) => void;
  validate: () => boolean;
  values: Record<string, unknown>;
  visibleParameters: CatalogParameter[];
}

// Headless: pure state/logic, no JSX. Pair with <ParameterFormFields> to
// render — the split is what lets the same form live inside a Dialog, a
// Popover, or a plain page section without this hook knowing which.
export const useParameterForm = ({
  parameters,
  initialValues,
}: {
  parameters: CatalogParameter[];
  initialValues?: Record<string, unknown>;
}): UseParameterFormResult => {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => initialValues ?? defaultParameterValues(parameters)
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  // Never render server-managed ("system"/"file") parameters — the operator
  // always recomputes those server-side; an editable field for one would let
  // a client override a value it should never control (e.g.
  // profileDownloadUrl, an SSRF vector if user-editable).
  const visibleParameters = parameters.filter(
    (parameter) =>
      !isServerManagedDataSource(parameter.dataSource) &&
      isParameterVisible(parameter, values)
  );

  const allErrors = useMemo(
    () => validateParameters(visibleParameters, values),
    [visibleParameters, values]
  );

  const errors = useMemo(() => {
    const shown: Record<string, string> = {};
    for (const [key, message] of Object.entries(allErrors)) {
      if (submitted || touched[key]) {
        shown[key] = message;
      }
    }
    return shown;
  }, [allErrors, submitted, touched]);

  return {
    errors,
    isValid: Object.keys(allErrors).length === 0,
    setValue,
    validate: () => {
      setSubmitted(true);
      return Object.keys(allErrors).length === 0;
    },
    values,
    visibleParameters,
  };
};
