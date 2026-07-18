import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { authComponent, createAuth } from "../auth";
import {
  fetchCatalogTemplates,
  findOperation,
  findTemplate,
} from "../operators/catalogClient";
import { resolveFileParams } from "../operators/fileParams";
import type {
  OperationResult,
  OperatorFunctionResult,
} from "../operators/validators";
import { operationResultValidator } from "../operators/validators";
import { r2 } from "../storage/r2";
import { workloadRowValidator } from "./queries";

// Mirrors ai-cloud-operator's WorkloadStatus JSON shape — both fields carry
// `omitempty` on the Go side, so they can genuinely be absent (e.g. right
// after creation, before the reconciler fills them in).
interface WorkloadStatus {
  phase?: string;
  readyReplicas?: number;
}
type OperatorForDeploy = { deployToken: string; externalUrl: string } | null;

// Renamed from deployWorkload. Resolves a representative tag-matched
// operator (rather than a client-supplied operatorId — the manual operator
// dropdown is gone entirely, tags are the only selection mechanism now),
// fetches its catalog, resolves params exactly as before, captures the
// template's current version (first real runtime consumer of that
// previously-informational field — see the plan's "Template version
// compatibility" section), and hands off to requestCreate. The row is NOT
// assigned to an operator here — that happens later, competitively, via
// claim() once some matching operator's heartbeat picks it up.
//
// Documented limitation: a tag class with zero reachable operators fails
// fast here (an error the client sees immediately), rather than queuing the
// request forever with nothing left to claim it.
export const requestWorkload = action({
  args: {
    desiredOperatorTags: v.array(v.string()),
    displayName: v.optional(v.string()),
    params: v.record(v.string(), v.any()),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getRepresentativeForTags,
      { desiredOperatorTags: args.desiredOperatorTags }
    );
    if (!operator) {
      throw new Error("No operator currently matches the requested tags");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // config starts from the user-supplied params; every file-sourced key
    // is always recomputed below and overwrites whatever the client sent —
    // never trust a client value for those. Which params are file-sourced
    // and which direction comes entirely from the catalog itself —
    // resolveFileParams (shared with runOperation's upload-direction case)
    // has no template- or param-name-specific knowledge at all.
    const resolvedFileParams = await resolveFileParams(
      ctx,
      template.parameters,
      {
        rawParams: args.params,
        userId: user._id,
      }
    );

    const config: Record<string, unknown> = { ...args.params };
    for (const entry of resolvedFileParams) {
      config[entry.key] = entry.paramValue;
    }

    const workloadId: Id<"workloads"> = await ctx.runMutation(
      internal.workloads.mutations.requestCreate,
      {
        config,
        desiredOperatorTags: args.desiredOperatorTags,
        displayName: args.displayName,
        templateId: args.templateId,
        templateVersion: template.version,
        userId: user._id,
      }
    );
    return workloadId;
  },
  returns: v.id("workloads"),
});

// Non-reactive by necessity (fetch can't be a query) — the UI polls this on
// a client-side interval. Only `active` rows do the live-CR-phase fetch;
// every other status (requested, provisioning, requested_destroy,
// destroying, requested_redeploy, redeploying, failed, destroyed, orphaned)
// returns the row's own `status` as `phase` directly — there's no operator
// call worth making for a workload that isn't actually running yet (or
// anymore).
export const listMyWorkloads = action({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const rows: Doc<"workloads">[] = await ctx.runQuery(
      internal.workloads.queries.listByUser,
      {
        userId: user._id,
      }
    );

    const operatorCache = new Map<string, OperatorForDeploy>();
    const results = await Promise.all(
      rows.map(async (row) => {
        if (row.status !== "active" || !row.operatorId || !row.name) {
          return { ...row, phase: row.status, readyReplicas: 0 };
        }

        const { operatorId } = row;
        let operator = operatorCache.get(operatorId);
        if (operator === undefined) {
          operator = await ctx.runQuery(
            internal.operators.queries.getForDeploy,
            {
              operatorId,
            }
          );
          operatorCache.set(operatorId, operator ?? null);
        }
        if (!operator) {
          return { ...row, phase: "unknown", readyReplicas: 0 };
        }
        try {
          const res = await fetch(
            `${operator.externalUrl}/workloads/${row.name}`,
            {
              headers: { Authorization: `Bearer ${operator.deployToken}` },
            }
          );
          if (!res.ok) {
            return { ...row, phase: "unknown", readyReplicas: 0 };
          }
          const body: { status?: WorkloadStatus } = await res.json();
          return {
            ...row,
            phase: body.status?.phase ?? "unknown",
            readyReplicas: body.status?.readyReplicas ?? 0,
          };
        } catch {
          return { ...row, phase: "unreachable", readyReplicas: 0 };
        }
      })
    );
    return results;
  },
  returns: v.array(
    v.object({
      ...workloadRowValidator.fields,
      phase: v.string(),
      readyReplicas: v.number(),
    })
  ),
});

// Ownership check, then a thin wrapper around requestDestroy — no operator
// HTTP call at all anymore. The row reactively shows requested_destroy ->
// destroying -> destroyed on its own (via listOwned), so there's no more
// "removingIds stays until row disappears" client-side workaround needed.
export const requestRemoval = action({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      {
        userId: user._id,
        workloadId: args.workloadId,
      }
    );
    if (!row) {
      throw new Error("Workload not found");
    }

    await ctx.runMutation(internal.workloads.mutations.requestDestroy, {
      workloadId: row._id,
    });
    return null;
  },
  returns: v.null(),
});

// Ownership check, then a thin wrapper around requestStop — same pattern as
// requestRemoval above (no operator HTTP call; the row reactively shows
// requested_stop -> stopping -> stopped on its own via listOwned).
export const requestStopAction = action({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      {
        userId: user._id,
        workloadId: args.workloadId,
      }
    );
    if (!row) {
      throw new Error("Workload not found");
    }

    await ctx.runMutation(internal.workloads.mutations.requestStop, {
      workloadId: row._id,
    });
    return null;
  },
  returns: v.null(),
});

// Ownership check, then a thin wrapper around requestResume — the mirror of
// requestStopAction above.
export const requestResumeAction = action({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      {
        userId: user._id,
        workloadId: args.workloadId,
      }
    );
    if (!row) {
      throw new Error("Workload not found");
    }

    await ctx.runMutation(internal.workloads.mutations.requestResume, {
      workloadId: row._id,
    });
    return null;
  },
  returns: v.null(),
});

// Ownership check, then requests a redeploy on the SAME operator the
// workload already lives on (looked up via the existing operatorId-keyed
// getForDeploy — redeploy never re-resolves by tags, since a resource can
// only be redeployed on the cluster it already lives on). Resolves params
// against that operator's catalog exactly like requestWorkload does at
// create time, captures the template's current version for the same
// claim-time compatibility check, and hands off to requestRedeploy.
export const requestRedeployAction = action({
  args: {
    params: v.record(v.string(), v.any()),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      { userId: user._id, workloadId: args.workloadId }
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
        userId: user._id,
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
// catalog.Operation in ai-cloud-operator): auth/ownership, resolving
// file-sourced params (upload targets Convex mints fresh — the mirror of
// requestWorkload's download-direction loop) generically off the catalog's
// own DataSource metadata, proxying to the operator, then recording a
// files row if the operator reports one. None of this is specific to
// backup_state or any other single operation — adding a future operation
// needs no changes here at all. Only meaningful for an `active` workload
// (one with a real name/operatorId) — anything else has no live CR to call
// an operation against.
export const runOperation = action({
  args: {
    operationKey: v.string(),
    params: v.record(v.string(), v.any()),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args): Promise<OperationResult> => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      { userId: user._id, workloadId: args.workloadId }
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

    // Upload targets are minted here, up front, so we know exactly what
    // was prepared if (and only if) the operator's exec actually succeeds
    // — never derived from the operator's response, which only echoes back
    // stdout. Which params need this comes entirely from the operation's
    // own catalog definition — resolveFileParams (shared with
    // requestWorkload's download-direction case) has no operation-specific
    // knowledge at all. There's realistically one upload-direction param
    // per operation today, so the last prepared entry is the one used
    // below if the operator reports a file.
    const resolvedFileParams = await resolveFileParams(
      ctx,
      operation.parameters,
      {
        rawParams: args.params,
        userId: user._id,
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

    // file is a processing directive the operation's own definition emits
    // (see catalog.OperationResult in ai-cloud-operator) — never forwarded
    // to the client, unlike additionalInfo (pure display data, secret/
    // plain only, returned as-is below).
    if (rawResult.file) {
      if (!preparedUpload) {
        throw new Error(
          "operator reported a file but no upload was prepared for this operation"
        );
      }
      // Pulls the object's real size/contentType/lastModified into the r2
      // component's own metadata store — never duplicated onto the files
      // row itself, read back later via r2.getMetadata.
      await r2.syncMetadata(ctx, preparedUpload.r2Key);
      await ctx.runMutation(internal.files.mutations.create, {
        createdAt: Date.now(),
        group: preparedUpload.group,
        label: rawResult.file.label,
        r2Bucket: preparedUpload.r2Bucket,
        r2Key: preparedUpload.r2Key,
        type: rawResult.file.type,
        userId: user._id,
      });
    }

    return { additionalInfo: rawResult.additionalInfo };
  },
  returns: operationResultValidator,
});

// Ownership check, then mints a one-time gateway token via better-auth's
// one-time-token plugin (see convex/auth.ts) rather than a self-verifying
// signed blob, since real single-use enforcement needs shared state only
// Convex holds. The operator exchanges this for a session cookie on first
// use (see ai-cloud-operator's requireGatewayToken) — Convex is never
// called again for the rest of that session, so opening a workload keeps
// working even if Convex is briefly unreachable after the initial
// exchange. Only meaningful for an `active` workload — same "real
// name/namespace required" reasoning as runOperation above.
export const getWorkloadAccessToken = action({
  args: { workloadId: v.id("workloads") },
  handler: async (
    ctx,
    args
  ): Promise<{
    externalUrl: string;
    name: string;
    namespace: string;
    token: string;
  }> => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      {
        userId: user._id,
        workloadId: args.workloadId,
      }
    );
    if (!row) {
      throw new Error("Workload not found");
    }
    if (!row.operatorId || !row.name || !row.namespace) {
      throw new Error("Workload is not active");
    }

    const operator: { externalUrl: string } | null = await ctx.runQuery(
      internal.operators.queries.getExternalUrl,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Workload not found");
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const { token } = await auth.api.generateOneTimeToken({ headers });

    return {
      externalUrl: operator.externalUrl,
      name: row.name,
      namespace: row.namespace,
      token,
    };
  },
  returns: v.object({
    externalUrl: v.string(),
    name: v.string(),
    namespace: v.string(),
    token: v.string(),
  }),
});
