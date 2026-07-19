import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { adminAction } from "../functions";
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

// Admin mirror of workloads/actions.ts's getOwned-based row lookup — every
// action below looks the row up unconditionally via workloads/queries.ts#
// getById (no ownership check at all, unlike getOwned), since an admin
// intentionally acts across every user's workloads. Wherever the owner-
// facing actions pass ctx.user._id (the calling user) into resolveFileParams
// or a files row, these pass row.userId (the workload's real owner)
// instead — an admin has no selectOptions/files of their own worth
// resolving against, and any file an operation uploads belongs to the
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
      throw new Error("Workload not found");
    }
    if (!row.operatorId) {
      throw new Error("Workload has no assigned operator yet");
    }
    return await fetchResolvedCatalog(ctx, row.operatorId, row.userId);
  },
  returns: v.array(templateValidator),
});

// Admin mirror of workloads/actions.ts#requestRedeployAction.
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
      throw new Error("Workload not found");
    }
    if (!row.operatorId) {
      throw new Error("Workload has no assigned operator yet");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Operator not found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, row.templateId);
    if (!template) {
      throw new Error("Template not found");
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

// Admin mirror of workloads/actions.ts#runOperation.
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
      throw new Error("Workload not found");
    }
    if (!row.operatorId || !row.name) {
      throw new Error("Workload is not active");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Operator not found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, row.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    const operation = findOperation(template, args.operationKey);
    if (!operation) {
      throw new Error("Operation not found");
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
      throw new Error(`Operator function call failed: ${res.status}`);
    }
    const rawResult: OperatorFunctionResult = await res.json();

    if (rawResult.file) {
      if (!preparedUpload) {
        throw new Error(
          "operator reported a file but no upload was prepared for this operation"
        );
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
