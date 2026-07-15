import { VStack } from "@astryxdesign/core/VStack";

import type { UseParameterFormResult } from "../model/use-parameter-form";
import { ParameterField } from "./parameter-field";

// Presentational only — no Dialog/Section/Popover baked in, so a caller can
// embed this inside literally any container.
export const ParameterFormFields = ({
  form,
}: {
  form: Pick<
    UseParameterFormResult,
    "errors" | "setValue" | "values" | "visibleParameters"
  >;
}) => (
  <VStack gap={3}>
    {form.visibleParameters.map((parameter) => (
      <ParameterField
        error={form.errors[parameter.key]}
        key={parameter.key}
        onChange={(value) => form.setValue(parameter.key, value)}
        parameter={parameter}
        value={form.values[parameter.key]}
      />
    ))}
  </VStack>
);
