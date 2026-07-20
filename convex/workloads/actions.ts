import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { adminAction, authedAction } from "../functions";
import { appError } from "../lib/errors";
import { fetchResolvedCatalog } from "../operators/actions";
import {
  fetchCatalogTemplates,
  findOperation,
  findTemplate,
} from "../operators/catalogClient";
import { resolveFileParams } from "../operators/fileParams";
import type {
  CatalogTemplate,
  OperationResult,
  OperatorFunctionResult,
} from "../operators/validators";
import {
  operationResultValidator,
  templateValidator,
} from "../operators/validators";
import { r2 } from "../storage/r2";

type OperatorForDeploy = { deployToken: string; externalUrl: string } | null;

// The shared "resolve an operator, verify the template, create the row"
// pipeline behind both requestWorkload (a user-filled form) and
// presets/actions.ts#deployPreset (a preset's stored config, no form at
// all) — extracted so the latter reuses this exactly rather than
// duplicating it. displayNamePrefix/sourcePresetId/sourcePresetVersionId
// are optional because requestWorkload's own call site never sets them
// (see below); deployPreset is the only caller that does.
export const createWorkloadFromSpec = async (
  ctx: ActionCtx,
  spec: {
    desiredOperatorTags: string[];
    displayName?: string;
    displayNamePrefix?: string;
    params: Record<string, unknown>;
    sourcePresetId?: Id<"presets">;
    sourcePresetVersionId?: Id<"presetVersions">;
    templateId: string;
    templateVersion: string;
    userId: string;
  }
): Promise<Id<"workloads">> => {
  const operator: OperatorForDeploy = await ctx.runQuery(
    internal.operators.queries.getRepresentativeForTags,
    {
      desiredOperatorTags: spec.desiredOperatorTags,
      templateId: spec.templateId,
      templateVersion: spec.templateVersion,
    }
  );
  if (!operator) {
    throw appError("workload.no_matching_operator");
  }

  const templates = await fetchCatalogTemplates(operator);
  const template = findTemplate(templates, spec.templateId);
  if (!template) {
    throw appError("catalog.template_not_found");
  }
  if (template.version !== spec.templateVersion) {
    throw appError("catalog.template_version_drift");
  }

  // config starts from the caller-supplied params; every file-sourced key
  // is always recomputed below and overwrites whatever was passed in —
  // never trust a client value for those. Which params are file-sourced
  // and which direction comes entirely from the catalog itself —
  // resolveFileParams (shared with adminRunOperation's upload-direction
  // case) has no template- or param-name-specific knowledge at all.
  const resolvedFileParams = await resolveFileParams(ctx, template.parameters, {
    rawParams: spec.params,
    userId: spec.userId,
  });

  const config: Record<string, unknown> = { ...spec.params };
  for (const entry of resolvedFileParams) {
    config[entry.key] = entry.paramValue;
  }

  const workloadId: Id<"workloads"> = await ctx.runMutation(
    internal.workloads.mutations.requestCreate,
    {
      config,
      desiredOperatorTags: spec.desiredOperatorTags,
      displayName: spec.displayName,
      displayNamePrefix: spec.displayNamePrefix,
      sourcePresetId: spec.sourcePresetId,
      sourcePresetVersionId: spec.sourcePresetVersionId,
      templateId: spec.templateId,
      templateVersion: template.version,
      userId: spec.userId,
    }
  );
  return workloadId;
};

// Renamed from deployWorkload. Resolves a representative tag-matched
// operator that also self-reports the exact requested templateId+
// templateVersion (rather than a client-supplied operatorId — the manual
// operator dropdown is gone entirely, tags are the only selection mechanism
// now), fetches its live catalog, re-verifies the live template's version
// still matches (defends against drift between the self-reported catalog
// used to pick the operator and its live catalog moments later), resolves
// params exactly as before, and hands off to requestCreate. The row is NOT
// assigned to an operator here — that happens later, competitively, via
// claim() once some matching operator's heartbeat picks it up. The actual
// pipeline lives in createWorkloadFromSpec above, shared with
// presets/actions.ts#deployPreset.
//
// Documented limitation: a tag class with zero reachable operators fails
// fast here (an error the client sees immediately), rather than queuing the
// request forever with nothing left to claim it.
export const requestWorkload = authedAction({
  args: {
    desiredOperatorTags: v.array(v.string()),
    displayName: v.optional(v.string()),
    params: v.record(v.string(), v.any()),
    templateId: v.string(),
    templateVersion: v.string(),
  },
  handler: async (ctx, args) =>
    await createWorkloadFromSpec(ctx, { ...args, userId: ctx.user._id }),
  returns: v.id("workloads"),
});

// --- Admin-facing entry points below ---------------------------------------
//
// Owner-facing counterparts to these (a redeploy/run-operation/list-mine
// action pair gated by getOwned instead of getById) existed here until the
// self-service /workloads page that called them was removed — see
// workloads/mutations.ts's own "Admin-facing entry points" section for the
// mutation-layer half of that same removal. requestWorkload above is the
// one owner-facing action that's still live (the New Workload dialog still
// creates workloads directly), so it's the template these follow: every
// action below looks the row up unconditionally via
// workloads/queries.ts#getById (no ownership check at all, unlike getOwned),
// since an admin intentionally acts across every user's workloads. Wherever
// the owner-facing actions above pass ctx.user._id (the calling user) into
// resolveFileParams or a files row, these pass row.userId (the workload's
// real owner) instead — an admin has no selectOptions/files of their own
// worth resolving against, and any file an operation uploads belongs to the
// workload's owner, not whichever admin happened to trigger it.

// Scoped to the workload's actual owner, not the calling admin — see
// operators/actions.ts#fetchResolvedCatalog's doc comment. Used to render
// the redeploy dialog's parameter form and list any catalog-defined
// operations for the Fleet detail panel, both keyed off the workload's own
// operator/template.
export const adminGetCatalog = adminAction({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args): Promise<CatalogTemplate[]> => {
    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getById,
      { workloadId: args.workloadId }
    );
    if (!row) {
      throw appError("workload.not_found");
    }
    if (!row.operatorId) {
      throw appError("workload.no_operator_assigned");
    }
    return await fetchResolvedCatalog(ctx, row.operatorId, row.userId);
  },
  returns: v.array(templateValidator),
});

// Requests a redeploy on the SAME operator the workload already lives on
// (looked up via the existing operatorId-keyed getForDeploy — redeploy
// never re-resolves by tags, since a resource can only be redeployed on the
// cluster it already lives on). Resolves params against that operator's
// catalog exactly like requestWorkload does at create time, captures the
// template's current version for the same claim-time compatibility check,
// and hands off to requestRedeploy. Admin-bypass shape (see this section's
// intro doc comment above).
export const adminRequestRedeploy = adminAction({
  args: {
    params: v.record(v.string(), v.any()),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args) => {
    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getById,
      { workloadId: args.workloadId }
    );
    if (!row) {
      throw appError("workload.not_found");
    }
    if (!row.operatorId) {
      throw appError("workload.no_operator_assigned");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw appError("operator.not_found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, row.templateId);
    if (!template) {
      throw appError("catalog.template_not_found");
    }

    const resolvedFileParams = await resolveFileParams(
      ctx,
      template.parameters,
      {
        rawParams: args.params,
        userId: row.userId,
      }
    );

    const config: Record<string, unknown> = { ...args.params };
    for (const entry of resolvedFileParams) {
      config[entry.key] = entry.paramValue;
    }

    await ctx.runMutation(internal.workloads.mutations.requestRedeploy, {
      config,
      templateVersion: template.version,
      workloadId: row._id,
    });
    return null;
  },
  returns: v.null(),
});

// The generic invocation path any catalog Operation reuses (see
// catalog.Operation in ai-cloud-operator): resolving file-sourced params
// (upload targets Convex mints fresh — the mirror of requestWorkload's
// download-direction loop) generically off the catalog's own DataSource
// metadata, proxying to the operator, then recording a files row if the
// operator reports one. None of this is specific to backup_state or any
// other single operation — adding a future operation needs no changes here
// at all. Only meaningful for an `active` workload (one with a real
// name/operatorId) — anything else has no live CR to call an operation
// against. Admin-bypass shape (see this section's intro doc comment above).
export const adminRunOperation = adminAction({
  args: {
    operationKey: v.string(),
    params: v.record(v.string(), v.any()),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args): Promise<OperationResult> => {
    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getById,
      { workloadId: args.workloadId }
    );
    if (!row) {
      throw appError("workload.not_found");
    }
    if (!row.operatorId || !row.name) {
      throw appError("workload.not_active");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw appError("operator.not_found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, row.templateId);
    if (!template) {
      throw appError("catalog.template_not_found");
    }
    const operation = findOperation(template, args.operationKey);
    if (!operation) {
      throw appError("catalog.operation_not_found");
    }

    const resolvedFileParams = await resolveFileParams(
      ctx,
      operation.parameters,
      {
        rawParams: args.params,
        userId: row.userId,
      }
    );

    const params: Record<string, unknown> = { ...args.params };
    let preparedUpload:
      | { group: string; r2Bucket: string; r2Key: string }
      | undefined;
    for (const entry of resolvedFileParams) {
      params[entry.key] = entry.paramValue;
      if (entry.prepared) {
        preparedUpload = entry.prepared;
      }
    }

    const res = await fetch(
      `${operator.externalUrl}/workloads/${row.name}/functions/${args.operationKey}`,
      {
        body: JSON.stringify({ params }),
        headers: {
          Authorization: `Bearer ${operator.deployToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    if (!res.ok) {
      throw appError("operator.function_call_failed", { status: res.status });
    }
    const rawResult: OperatorFunctionResult = await res.json();

    if (rawResult.file) {
      if (!preparedUpload) {
        throw appError("operator.upload_not_prepared");
      }
      await r2.syncMetadata(ctx, preparedUpload.r2Key);
      await ctx.runMutation(internal.files.mutations.create, {
        createdAt: Date.now(),
        group: preparedUpload.group,
        label: rawResult.file.label,
        r2Bucket: preparedUpload.r2Bucket,
        r2Key: preparedUpload.r2Key,
        type: rawResult.file.type,
        userId: row.userId,
      });
    }

    return { additionalInfo: rawResult.additionalInfo };
  },
  returns: operationResultValidator,
});
