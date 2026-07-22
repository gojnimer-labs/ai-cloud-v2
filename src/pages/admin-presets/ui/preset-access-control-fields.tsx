import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

import type {
  CatalogOperation,
  CatalogTemplate,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";

export type LifecycleAction = "destroy" | "redeploy" | "resume" | "stop";

const LIFECYCLE_ACTIONS: {
  action: LifecycleAction;
  label: () => string;
}[] = [
  { action: "stop", label: m.admin_workload_pause },
  { action: "resume", label: m.admin_workload_resume },
  { action: "redeploy", label: m.admin_workload_redeploy },
  { action: "destroy", label: m.admin_workload_destroy },
];

export const ALL_LIFECYCLE_ACTIONS: LifecycleAction[] = LIFECYCLE_ACTIONS.map(
  ({ action }) => action
);

export interface PresetAccessControlValue {
  allowedEntrypoints: string[];
  allowedLifecycleActions: LifecycleAction[];
  allowedOperations: string[];
}

const toggle = <T,>(list: T[], item: T, checked: boolean): T[] =>
  checked ? [...list, item] : list.filter((entry) => entry !== item);

// Grained "which of this template's interactions can a workspace user
// invoke" checkboxes — every entrypoint/operation the resolved template
// declares, plus the fixed Stop/Resume/Redeploy/Delete lifecycle set (no
// "Start": a preset's group associations already gate who can deploy a new
// instance at all, see presetGroups in convex/schema.ts, so there's nothing
// left for a separate "start" grant to restrict). Entrypoints/operations
// come from the resolved template and so only render once one is selected
// (same Suspense boundary as the parameter form) — the lifecycle checkboxes
// don't depend on the template and always render.
export const PresetAccessControlFields = ({
  onChange,
  template,
  value,
}: {
  onChange: (next: PresetAccessControlValue) => void;
  template: CatalogTemplate | null;
  value: PresetAccessControlValue;
}) => {
  const entrypoints = template?.entrypoints ?? [];
  const operations: CatalogOperation[] = template?.operations ?? [];

  return (
    <VStack gap={4}>
      <Text weight="bold">{m.admin_presets_access_control_label()}</Text>

      <VStack gap={2}>
        <Text color="secondary" type="supporting">
          {m.admin_presets_access_control_entrypoints_label()}
        </Text>
        {entrypoints.length === 0 ? (
          <Text color="secondary">
            {m.admin_presets_access_control_entrypoints_empty()}
          </Text>
        ) : (
          entrypoints.map((entrypoint) => (
            <CheckboxInput
              key={entrypoint.name}
              label={entrypoint.label}
              onChange={(checked) =>
                onChange({
                  ...value,
                  allowedEntrypoints: toggle(
                    value.allowedEntrypoints,
                    entrypoint.name,
                    checked
                  ),
                })
              }
              value={value.allowedEntrypoints.includes(entrypoint.name)}
            />
          ))
        )}
      </VStack>

      <VStack gap={2}>
        <Text color="secondary" type="supporting">
          {m.admin_presets_access_control_operations_label()}
        </Text>
        {operations.length === 0 ? (
          <Text color="secondary">
            {m.admin_presets_access_control_operations_empty()}
          </Text>
        ) : (
          operations.map((operation) => (
            <CheckboxInput
              description={operation.description}
              key={operation.key}
              label={operation.label}
              onChange={(checked) =>
                onChange({
                  ...value,
                  allowedOperations: toggle(
                    value.allowedOperations,
                    operation.key,
                    checked
                  ),
                })
              }
              value={value.allowedOperations.includes(operation.key)}
            />
          ))
        )}
      </VStack>

      <VStack gap={2}>
        <Text color="secondary" type="supporting">
          {m.admin_presets_access_control_lifecycle_label()}
        </Text>
        {LIFECYCLE_ACTIONS.map(({ action, label }) => (
          <CheckboxInput
            key={action}
            label={label()}
            onChange={(checked) =>
              onChange({
                ...value,
                allowedLifecycleActions: toggle(
                  value.allowedLifecycleActions,
                  action,
                  checked
                ),
              })
            }
            value={value.allowedLifecycleActions.includes(action)}
          />
        ))}
      </VStack>
    </VStack>
  );
};
