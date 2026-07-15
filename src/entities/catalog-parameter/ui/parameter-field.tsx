import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";

import type { CatalogParameter } from "../model/types";

// Dispatches purely on parameter.type — dynamic-select options are always
// pre-resolved server-side (getCatalog runs resolveDynamicOptions before
// the catalog ever reaches the frontend), so this component never fetches
// anything itself, static or dynamic.
export const ParameterField = ({
  error,
  onChange,
  parameter,
  value,
}: {
  error?: string;
  onChange: (value: unknown) => void;
  parameter: CatalogParameter;
  value: unknown;
}) => {
  const status = error
    ? ({ message: error, type: "error" } as const)
    : undefined;

  if (parameter.type === "boolean") {
    return (
      <CheckboxInput
        description={parameter.description}
        isRequired={parameter.required}
        label={parameter.label}
        onChange={(checked) => onChange(checked)}
        status={status}
        value={value === true}
      />
    );
  }
  if (parameter.type === "number") {
    return (
      <NumberInput
        description={parameter.description}
        isRequired={parameter.required}
        label={parameter.label}
        max={parameter.validation?.max ?? null}
        min={parameter.validation?.min ?? null}
        onChange={(n) => onChange(n)}
        status={status}
        value={typeof value === "number" ? value : null}
      />
    );
  }
  if (parameter.type === "select") {
    return (
      <Selector
        description={parameter.description}
        isRequired={parameter.required}
        label={parameter.label}
        onChange={(v) => onChange(v)}
        options={(parameter.options ?? []).map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        status={status}
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  return (
    <TextInput
      description={parameter.description}
      isRequired={parameter.required}
      label={parameter.label}
      onChange={(v) => onChange(v)}
      status={status}
      value={typeof value === "string" ? value : ""}
    />
  );
};
