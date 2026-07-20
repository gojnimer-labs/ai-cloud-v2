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
// Neither of these two takes an admin-scoped mutation/action directly — both
// accept the invoke function as a prop (onRun/onRedeploy) — so they're
// reused as-is by both admin-clusters' Fleet detail panel and workspace's
// end-user deployment actions (src/pages/workspace/ui/my-deployments.tsx),
// each binding a different (admin-bypass vs. owner-scoped+permission-gated)
// backend call at the call site.
export { WorkloadOperationDialog } from "./ui/workload-operation-dialog";
export { WorkloadRedeployDialog } from "./ui/workload-redeploy-dialog";
