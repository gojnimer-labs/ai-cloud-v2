import { VStack } from "@astryxdesign/core/VStack";

import type { AppFormInstance } from "@/shared/lib/form/form";

import { isServerManagedDataSource } from "../model/types";
import type { CatalogParameter } from "../model/types";
import { isParameterVisible } from "../model/visibility";

// Presentational only — no Dialog/Section/Popover baked in, so a caller can
// embed this inside literally any container. Wrapped in form.Subscribe
// (not a plain filter at the top of the component) because visibility can
// depend on another field's live value — this block re-runs on every
// value change to recompute which parameters are currently visible; each
// individual field below then only re-renders off its own field state.
export const ParameterFormFields = ({
  form,
  parameters,
}: {
  form: AppFormInstance;
  parameters: CatalogParameter[];
}) => (
  <VStack gap={3}>
    <form.Subscribe
      selector={(state: { values: Record<string, unknown> }) => state.values}
    >
      {(values: Record<string, unknown>) => {
        const visible = parameters.filter(
          (parameter) =>
            !isServerManagedDataSource(parameter.dataSource) &&
            isParameterVisible(parameter, values)
        );
        return visible.map((parameter) => (
          <form.AppField key={parameter.key} name={parameter.key}>
            {/* oxlint-disable-next-line no-explicit-any -- AppFormInstance is intentionally `any` (see shared/lib/form/form.ts), so form.AppField's render-prop needs an explicit type here. */}
            {(field: any) => {
              if (parameter.type === "boolean") {
                return (
                  <field.CheckboxField
                    description={parameter.description}
                    isRequired={parameter.validation.required}
                    label={parameter.label}
                  />
                );
              }
              if (parameter.type === "number") {
                return (
                  <field.NumberField
                    description={parameter.description}
                    isRequired={parameter.validation.required}
                    label={parameter.label}
                    max={parameter.validation.max ?? null}
                    min={parameter.validation.min ?? null}
                  />
                );
              }
              if (parameter.type === "select") {
                return (
                  <field.SelectField
                    description={parameter.description}
                    isRequired={parameter.validation.required}
                    label={parameter.label}
                    options={parameter.options ?? []}
                  />
                );
              }
              return (
                <field.TextField
                  description={parameter.description}
                  isLabelHidden={false}
                  isRequired={parameter.validation.required}
                  label={parameter.label}
                />
              );
            }}
          </form.AppField>
        ));
      }}
    </form.Subscribe>
  </VStack>
);
