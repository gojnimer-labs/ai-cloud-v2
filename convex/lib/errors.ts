import { ConvexError } from "convex/values";

// Every application error thrown anywhere in convex/ goes through
// `throw appError(...)` below instead of a bare `throw new Error(...)`, so
// the frontend can key a translated message off `error.data.code` instead
// of pattern-matching English text (see src/shared/lib/get-error-message.ts,
// the sole reader of `.data` on the client). `code` is dot-namespaced
// (`<domain>.<reason>`), lowercase snake_case per segment — mirrors the
// operator's own "stable, namespaced message key" convention for catalog
// function results (see ai-cloud-operator's docs/catalog-parameters.md).
//
// appError() (not a throwing helper) is deliberate: this repo's TS
// toolchain doesn't narrow types after a *call* to an imported never-typed
// function across module boundaries the way it does after a real `throw`
// statement — every call site must write `throw appError(...)`, not
// `appError(...)` on its own line.
//
// Adding a new code: add it to AppErrorCode, add its English fallback to
// FALLBACK_MESSAGES, then add matching keys (`error_<code with . and _
// replaced by _>`) to messages/en.json and messages/pt.json — see
// src/shared/lib/get-error-message.ts's doc comment for the exact mapping.
export type AppErrorCode =
  | "auth.not_authenticated"
  | "auth.admin_required"
  | "workload.not_found"
  | "workload.not_active"
  | "workload.no_operator_assigned"
  | "workload.no_matching_operator"
  | "workload.duplicate_display_name"
  | "workload.name_generation_failed"
  | "workload.invalid_status_for_destroy"
  | "workload.invalid_status_for_stop"
  | "workload.invalid_status_for_resume"
  | "workload.invalid_status_for_redeploy"
  | "workload.file_param_required"
  | "catalog.template_not_found"
  | "catalog.template_version_drift"
  | "catalog.operation_not_found"
  | "operator.not_found"
  | "operator.catalog_fetch_failed"
  | "operator.function_call_failed"
  | "operator.upload_not_prepared"
  | "preset.not_found"
  | "preset.not_permitted"
  | "system_alert.not_found"
  | "system_alert.not_dismissable";

export type AppErrorParams = Record<string, string | number>;

export interface AppErrorData {
  code: AppErrorCode;
  message: string;
  params: AppErrorParams;
}

// English source of truth for every code's fallback text — read by
// throwAppError below, and mirrored (translated) into messages/en.json's
// `error_*` keys. Interpolation is `{param}`, matching paraglide's own
// syntax, so a translator copying one into the other doesn't have to
// convert a format.
const FALLBACK_MESSAGES: Record<
  AppErrorCode,
  (params: AppErrorParams) => string
> = {
  "auth.admin_required": () => "Admin access required",
  "auth.not_authenticated": () => "Not authenticated",
  "catalog.operation_not_found": () => "Operation not found",
  "catalog.template_not_found": () => "Template not found",
  "catalog.template_version_drift": () =>
    "The selected template version is no longer available; please choose a template again.",
  "operator.catalog_fetch_failed": ({ status }) =>
    `Catalog fetch failed: ${status}`,
  "operator.function_call_failed": ({ status }) =>
    `Operator function call failed: ${status}`,
  "operator.not_found": () => "Operator not found",
  "operator.upload_not_prepared": () =>
    "Operator reported a file but no upload was prepared for this operation",
  "preset.not_found": () => "Preset not found",
  "preset.not_permitted": () => "This preset is not available to you",
  "system_alert.not_dismissable": () => "This system alert cannot be dismissed",
  "system_alert.not_found": () => "System alert not found",
  "workload.duplicate_display_name": ({ displayName }) =>
    `You already have a workload named "${displayName}"`,
  "workload.file_param_required": ({ label }) => `${label} is required`,
  "workload.invalid_status_for_destroy": ({ status }) =>
    `Cannot destroy a workload with status "${status}"`,
  "workload.invalid_status_for_redeploy": ({ status }) =>
    `Cannot redeploy a workload with status "${status}"`,
  "workload.invalid_status_for_resume": ({ status }) =>
    `Cannot resume a workload with status "${status}"`,
  "workload.invalid_status_for_stop": ({ status }) =>
    `Cannot stop a workload with status "${status}"`,
  "workload.name_generation_failed": () =>
    "Could not generate a unique workload name — please provide one",
  "workload.no_matching_operator": () =>
    "No operator currently matches the requested tags",
  "workload.no_operator_assigned": () =>
    "Workload has no assigned operator yet",
  "workload.not_active": () => "Workload is not active",
  "workload.not_found": () => "Workload not found",
};

// Builds the ConvexError every application-level throw site in convex/
// raises via `throw appError(...)`. Sets both `.data` (code/message/params,
// read by the frontend's get-error-message.ts) and the plain `.message`
// (readable English, for Convex dashboard logs and any call site that
// hasn't migrated off `error.message` yet) to the same fallback text, so
// nothing regresses to a raw JSON blob mid-migration. Not parametrized as
// `ConvexError<AppErrorData>` — the named interface doesn't structurally
// satisfy Value's index signature the way an inferred literal type does.
export const appError = (
  code: AppErrorCode,
  params: AppErrorParams = {}
): ConvexError<{
  code: AppErrorCode;
  message: string;
  params: AppErrorParams;
}> => {
  const message = FALLBACK_MESSAGES[code](params);
  const error = new ConvexError({ code, message, params });
  error.message = message;
  return error;
};
