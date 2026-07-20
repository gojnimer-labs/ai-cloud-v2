export { NewWorkloadDialog } from "./ui/new-workload-dialog";
// Exported for reuse by admin-presets' create/edit dialog, which needs the
// same "pick a template from the live catalog" step but its own parameter
// form (built directly on entities/catalog-parameter's useParameterFormOptions
// + ParameterFormFields, same as workload-redeploy-dialog.tsx — unlike
// DeployWorkloadFields, that composition accepts prefilled initialValues,
// which editing a preset's saved params needs and DeployWorkloadFields'
// imperative-ref shape doesn't support) — see
// src/pages/admin-presets/ui/preset-form-dialog.tsx.
export type { MergedCatalogEntry } from "./model/types";
export { entryKey, TemplatePicker } from "./ui/template-picker";
