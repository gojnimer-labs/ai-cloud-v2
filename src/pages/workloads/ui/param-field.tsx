import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";

import type { CatalogParameter, ParameterType } from "../model/types";

const DYNAMIC_SELECT_PREFIX = "select_";

const isSelectType = (type: ParameterType): boolean =>
  type === "select" || type.startsWith(DYNAMIC_SELECT_PREFIX);

// Renders one form field for a catalog parameter, dispatching on its
// declared type. Only ever called for source:"user" parameters — system
// ones (e.g. profileDownloadUrl) are computed server-side and never shown.
export const ParamField = ({
  onChange,
  param,
  value,
}: {
  onChange: (value: unknown) => void;
  param: CatalogParameter;
  value: unknown;
}) => {
  if (param.type === "boolean") {
    return (
      <CheckboxInput
        description={param.description}
        label={param.label}
        onChange={(checked) => onChange(checked)}
        value={value === true}
      />
    );
  }
  if (param.type === "number") {
    return (
      <NumberInput
        description={param.description}
        label={param.label}
        onChange={(n) => onChange(n)}
        value={typeof value === "number" ? value : null}
      />
    );
  }
  if (isSelectType(param.type)) {
    return (
      <Selector
        description={param.description}
        label={param.label}
        onChange={(v) => onChange(v)}
        options={(param.options ?? []).map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  return (
    <TextInput
      description={param.description}
      label={param.label}
      onChange={(v) => onChange(v)}
      value={typeof value === "string" ? value : ""}
    />
  );
};
