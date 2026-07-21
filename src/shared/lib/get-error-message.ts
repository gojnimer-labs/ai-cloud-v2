import { ConvexError } from "convex/values";

import { m } from "@/paraglide/messages";

// The frontend's counterpart to convex/lib/errors.ts#appError. Not imported
// directly — same convention this codebase already used for
// TEMPLATE_VERSION_DRIFT_ERROR (see new-workload-dialog.tsx's old doc
// comment) and CatalogTemplate: the frontend never imports action-internal
// code from convex/, it hand-mirrors the contract. `code` here must stay in
// sync with convex/lib/errors.ts#AppErrorCode by hand — adding a code there
// means adding its entry here too (and the matching `error_*` key in
// messages/en.json + messages/pt.json).
//
// Each entry's actual paraglide function requires its own specific named
// inputs (e.g. `{ status: NonNullable<unknown> }`), which a generic
// `Record<string, string | number>` parameter type isn't assignable to
// (TS won't assume an index-signature type actually carries a given
// required key) — hence `(params: any) => string` here. Correctness relies
// on convention: each code's params must match what its `error_*` message
// declares, same as convex/lib/errors.ts#FALLBACK_MESSAGES already assumes
// for that code.
// oxlint-disable-next-line typescript/no-explicit-any -- see above.
const ERROR_MESSAGES: Record<string, (params: any) => string> = {
  "auth.admin_required": m.error_auth_admin_required,
  "auth.not_authenticated": m.error_auth_not_authenticated,
  "catalog.operation_not_found": m.error_catalog_operation_not_found,
  "catalog.template_not_found": m.error_catalog_template_not_found,
  "operator.function_call_failed": m.error_operator_function_call_failed,
  "operator.not_found": m.error_operator_not_found,
  "operator.upload_not_prepared": m.error_operator_upload_not_prepared,
  "preset.already_up_to_date": m.error_preset_already_up_to_date,
  "preset.version_not_found": m.error_preset_version_not_found,
  "system_alert.not_dismissable": m.error_system_alert_not_dismissable,
  "system_alert.not_found": m.error_system_alert_not_found,
  "workload.action_not_permitted": m.error_workload_action_not_permitted,
  "workload.duplicate_display_name": m.error_workload_duplicate_display_name,
  "workload.file_param_required": m.error_workload_file_param_required,
  "workload.invalid_status_for_destroy":
    m.error_workload_invalid_status_for_destroy,
  "workload.invalid_status_for_redeploy":
    m.error_workload_invalid_status_for_redeploy,
  "workload.invalid_status_for_resume":
    m.error_workload_invalid_status_for_resume,
  "workload.invalid_status_for_stop": m.error_workload_invalid_status_for_stop,
  "workload.name_generation_failed": m.error_workload_name_generation_failed,
  "workload.no_matching_operator": m.error_workload_no_matching_operator,
  "workload.no_operator_assigned": m.error_workload_no_operator_assigned,
  "workload.no_source_preset": m.error_workload_no_source_preset,
  "workload.not_active": m.error_workload_not_active,
  "workload.not_found": m.error_workload_not_found,
};

// Structural shape of the `data` ConvexError({code, message, params})
// constructs — see convex/lib/errors.ts#appError. Read with `in`/typeof
// guards rather than assumed, since `.data` on a ConvexError raised by
// Convex's own runtime (not appError) can be any JSON value, or absent.
interface AppErrorData {
  code?: unknown;
  params?: unknown;
}

const isAppErrorData = (data: unknown): data is AppErrorData =>
  typeof data === "object" && data !== null;

// Exposed separately from getErrorMessage for call sites that need to
// branch on *which* error happened, not just show a message — see
// convex/lib/errors.ts#AppErrorCode for the full code list.
export const getErrorCode = (error: unknown): string | undefined => {
  if (error instanceof ConvexError && isAppErrorData(error.data)) {
    const { code } = error.data;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

// Single choke point for turning any caught error into a user-facing,
// translated string — use this everywhere a caught mutation/action error is
// shown (toast, inline form error, etc.) instead of reading `error.message`
// directly. A ConvexError raised via convex/lib/errors.ts#appError maps
// `data.code` through ERROR_MESSAGES above; anything else (a ConvexError
// with no recognized code, a network failure, an unrelated thrown value)
// falls back to error_generic rather than surfacing a raw English string or
// a JSON blob in an unmigrated locale.
export const getErrorMessage = (error: unknown): string => {
  const code = getErrorCode(error);
  if (code && code in ERROR_MESSAGES) {
    const params =
      error instanceof ConvexError && isAppErrorData(error.data)
        ? error.data.params
        : undefined;
    const paramsRecord =
      typeof params === "object" && params !== null
        ? (params as Record<string, string | number>)
        : {};
    return ERROR_MESSAGES[code](paramsRecord);
  }
  return m.error_generic();
};
