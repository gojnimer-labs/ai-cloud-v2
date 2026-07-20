export { NewWorkloadDialog } from "./ui/new-workload-dialog";
// Exported for reuse by admin-presets' create/edit dialog, which needs the
// same "pick a template, then fill its parameter form" pieces, including
// DeployWorkloadFields' now-optional initialValues prop (for prefilling a
// previously-saved preset's params on edit) — see
// src/pages/admin-presets/ui/preset-form-dialog.tsx.
export type { MergedCatalogEntry } from "./model/types";
export type { DeployWorkloadFieldsHandle } from "./ui/deploy-workload-form";
export { DeployWorkloadFields } from "./ui/deploy-workload-form";
export { entryKey, TemplatePicker } from "./ui/template-picker";
