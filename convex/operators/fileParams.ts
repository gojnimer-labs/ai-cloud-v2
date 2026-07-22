import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { prepareFileUpload, resolveFileUrl } from "../storage/r2";
import type { CatalogParameter } from "./validators";

interface FileParamResolverArgs {
  // False only when the create-workload request is preset-backed (see
  // workloads/actions.ts#createWorkloadFromSpec, which passes
  // `!spec.sourcePresetId`): ownership isn't enforced there because the
  // preset's own group-membership gate
  // (presets/queries.ts#getDeployableSnapshotInternal) is what authorizes
  // file access in that case, not the file row's owner — this is what lets
  // a deployed preset reference an admin-owned file (e.g. the shared
  // PRESET_THUMBNAILS_GROUP). requestWorkload has no preset and thus no such
  // gate, so it still enforces ownership like every other caller (redeploy,
  // run-operation, admin ops), which all omit this and keep the check.
  enforceOwnership?: boolean;
  rawParams: Record<string, unknown>;
  userId: string;
}

interface FileParamResolution {
  paramValue: unknown;
  // Only ever set for an upload-direction param — what a matching `file`
  // result should be recorded against afterward (see workloads/
  // actions.ts#adminRunOperation).
  prepared?: { group: string; r2Bucket: string; r2Key: string };
}

// Resolves every file-kind parameter in `parameters` — used by both
// requestWorkload (download-direction params) and adminRunOperation
// (upload-direction params) so the "walk the catalog's file params
// generically" logic exists exactly once. A plain if/else on `direction`
// is enough — there's exactly one storage backend (R2), so there's
// nothing to dispatch between; a handler registry here would be the same
// premature generalization round 3 built and round 4 removed.
export const resolveFileParams = async (
  ctx: ActionCtx,
  parameters: CatalogParameter[],
  args: FileParamResolverArgs
): Promise<({ key: string } & FileParamResolution)[]> => {
  const resolved = await Promise.all(
    parameters.map(async (param) => {
      if (param.dataSource.kind !== "file") {
        return null;
      }
      if (param.dataSource.direction === "download") {
        // The source parameter's value is a files-table row id (see the
        // per-template "profiles_firefox"/"profiles_chrome" groups in
        // ai-cloud-operator's browser.go), not a literal value — resolve
        // it back to a real download URL. A stale/deleted option (row
        // gone, malformed id) is treated as "nothing to restore" rather
        // than failing the caller when the param is optional — but for a
        // `validation.required: true` param, ending up with no value here
        // would otherwise reach the operator silently unfilled: nothing else
        // in this pipeline checks it (the client never sees this
        // field at all, since server-managed params are never rendered —
        // see entities/catalog-parameter's isServerManagedDataSource), so
        // this is the only point that can actually catch it.
        const sourceValue = args.rawParams[param.dataSource.sourceParam ?? ""];
        if (typeof sourceValue !== "string" || sourceValue.length === 0) {
          if (param.validation.required) {
            throw appError("workload.file_param_required", {
              label: param.label,
            });
          }
          return { key: param.key, paramValue: undefined };
        }
        const file = await (
          args.enforceOwnership === false
            ? ctx.runQuery(internal.files.queries.getUnscoped, {
                id: sourceValue as Id<"files">,
              })
            : ctx.runQuery(internal.files.queries.get, {
                id: sourceValue as Id<"files">,
                userId: args.userId,
              })
        ).catch(() => null);
        if (!file && param.validation.required) {
          throw appError("workload.file_param_required", {
            label: param.label,
          });
        }
        return {
          key: param.key,
          paramValue: file ? await resolveFileUrl(file) : undefined,
        };
      }
      const { paramValue, r2Bucket, r2Key } = await prepareFileUpload(
        param.dataSource.group ?? "",
        args.userId
      );
      return {
        key: param.key,
        paramValue,
        prepared: { group: param.dataSource.group ?? "", r2Bucket, r2Key },
      };
    })
  );
  return resolved.filter(
    (entry): entry is Exclude<typeof entry, null> => entry !== null
  );
};
