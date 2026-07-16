import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { authComponent } from "../auth";
import {
  fetchCatalogTemplates,
  findOperation,
  findTemplate,
} from "../operators/catalogClient";
import { generateToken, hashToken } from "../operators/crypto";
import { resolveHandlerParams } from "../operators/handlerParams";
import type {
  OperationResult,
  OperatorFunctionResult,
} from "../operators/validators";
import { operationResultValidator } from "../operators/validators";
import { createRow, patchRow, removeRow } from "../rowDirectives/registry";
import type { SelectOptionPayload } from "../selectOptions/validators";

// Mirrors ai-cloud-operator's WorkloadStatus JSON shape — both fields carry
// `omitempty` on the Go side, so they can genuinely be absent (e.g. right
// after creation, before the reconciler fills them in).
interface WorkloadStatus {
  phase?: string;
  readyReplicas?: number;
}
type OperatorForDeploy = { deployToken: string; externalUrl: string } | null;

export const deployWorkload = action({
  args: {
    operatorId: v.id("operators"),
    params: v.record(v.string(), v.any()),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      {
        operatorId: args.operatorId,
      }
    );
    if (!operator) {
      throw new Error("Operator not found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const template = findTemplate(templates, args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // config starts from the user-supplied params; every file-sourced key
    // is always recomputed below and overwrites whatever the client sent —
    // never trust a client value for those. Which params are file-sourced,
    // which direction, and which handler resolves them all come from the
    // catalog itself — resolveHandlerParams (shared with runOperation's
    // upload-direction case) has no template- or param-name-specific
    // knowledge at all.
    const resolvedHandlerParams = await resolveHandlerParams(
      ctx,
      template.parameters,
      {
        rawParams: args.params,
        templateId: args.templateId,
        userId: user._id,
      }
    );

    const config: Record<string, unknown> = { ...args.params };
    for (const entry of resolvedHandlerParams) {
      config[entry.key] = entry.paramValue;
    }

    // name/namespace are gone from this request — the operator derives the
    // workload's name itself from (userId, templateName) and deploys into a
    // namespace fixed per operator instance, so Convex never has to mint or
    // track a Kubernetes-safe identifier.
    const res = await fetch(`${operator.externalUrl}/workloads`, {
      body: JSON.stringify({
        config,
        templateName: args.templateId,
        userId: user._id,
      }),
      headers: {
        Authorization: `Bearer ${operator.deployToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Operator deploy call failed: ${res.status}`);
    }

    // The workloads row is NOT written here — the operator's reconciler
    // reports it back via POST /operators/workloads/upsert once it confirms
    // the Workload CR (see convex/operators/http.ts#upsertWorkload). This
    // keeps a single writer for that table and means the row stays accurate
    // even for workloads created/deleted directly with kubectl.
    return null;
  },
  returns: v.null(),
});

// Non-reactive by necessity (fetch can't be a query) — the UI polls this on
// a client-side interval. Fetches each owned workload's live status directly
// from its operator; nothing is cached/mirrored in Convex.
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
        let operator = operatorCache.get(row.operatorId);
        if (operator === undefined) {
          operator = await ctx.runQuery(
            internal.operators.queries.getForDeploy,
            {
              operatorId: row.operatorId,
            }
          );
          operatorCache.set(row.operatorId, operator ?? null);
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
      _creationTime: v.number(),
      _id: v.id("workloads"),
      createdAt: v.number(),
      name: v.string(),
      namespace: v.string(),
      operatorId: v.id("operators"),
      phase: v.string(),
      readyReplicas: v.number(),
      subdomain: v.optional(v.string()),
      templateId: v.string(),
      userId: v.string(),
    })
  ),
});

// Ownership check, then asks the operator to delete the backing Workload
// CR. The `workloads` row itself is NOT removed here — same single-writer
// reasoning as deployWorkload: the operator's reconciler reports the removal
// back via POST /operators/workloads/remove once it observes the CR is
// actually gone (see convex/operators/http.ts#removeWorkload).
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

    const operator: OperatorForDeploy = await ctx.runQuery(
      internal.operators.queries.getForDeploy,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Operator not found");
    }

    const res = await fetch(`${operator.externalUrl}/workloads/${row.name}`, {
      headers: { Authorization: `Bearer ${operator.deployToken}` },
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Operator delete call failed: ${res.status}`);
    }

    return null;
  },
  returns: v.null(),
});

// The generic invocation path any catalog Operation reuses (see
// catalog.Operation in ai-cloud-operator): auth/ownership, resolving
// file-sourced params (upload targets Convex mints fresh — the mirror of
// deployWorkload's download-direction loop) generically off the catalog's
// own DataSource metadata, proxying to the operator, then processing
// whatever insert_row/update_row/remove_row directives come back against
// the generic row-directive registry (see rowDirectives/registry.ts). None
// of this is specific to backup_state or any other single operation —
// adding a future operation needs no changes here at all.
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
    // stdout. Which params need this, and which handler mints them, comes
    // entirely from the operation's own catalog definition — resolveHandlerParams
    // (shared with deployWorkload's download-direction case) has no
    // operation-specific knowledge at all. `prepared` is only set for
    // upload-direction params (see handlerParams.ts), keyed by handler name so
    // the insert_row directive-processing loop below can find the matching
    // prepared payload without either side needing to know param keys.
    const resolvedHandlerParams = await resolveHandlerParams(
      ctx,
      operation.parameters,
      {
        rawParams: args.params,
        templateId: row.templateId,
        userId: user._id,
      }
    );

    const params: Record<string, unknown> = { ...args.params };
    const preparedByHandler = new Map<string, SelectOptionPayload>();
    for (const entry of resolvedHandlerParams) {
      params[entry.key] = entry.paramValue;
      if (entry.prepared) {
        preparedByHandler.set(entry.prepared.handler, entry.prepared.payload);
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

    // insert_row/update_row/remove_row are processing directives the
    // operation's own definition emits (see catalog.AdditionalInfo*Row in
    // ai-cloud-operator), dispatched by table through the generic
    // row-directive registry (see rowDirectives/registry.ts) — this action
    // has no knowledge of selectOptions or any other specific table, only
    // of the generic directive shape. Directives are stripped out, never
    // forwarded to the client; secret/plain entries pass through unchanged
    // into what actually gets returned. Each entry is independent (a
    // distinct new/target row), so they're processed concurrently rather
    // than one ctx.runMutation await at a time.
    const rowDirectiveContext = {
      resolvePrepared: (handler: string) => preparedByHandler.get(handler),
      userId: user._id,
    };
    const processed = await Promise.all(
      rawResult.additionalInfo.map(async (info) => {
        switch (info.type) {
          case "insert_row": {
            await createRow(
              ctx,
              info.value.table,
              info.value.fields,
              rowDirectiveContext
            );
            return null;
          }
          case "update_row": {
            await patchRow(
              ctx,
              info.value.table,
              info.value.rowId,
              info.value.fields,
              rowDirectiveContext
            );
            return null;
          }
          case "remove_row": {
            await removeRow(
              ctx,
              info.value.table,
              info.value.rowId,
              rowDirectiveContext
            );
            return null;
          }
          default: {
            return info;
          }
        }
      })
    );

    return {
      additionalInfo: processed.filter(
        (info): info is Exclude<typeof info, null> => info !== null
      ),
    };
  },
  returns: operationResultValidator,
});

// Ownership check, then mints a one-time gateway token: a random string
// Convex tracks (see gateway/mutations.ts#create) rather than a
// self-verifying signed blob, since real single-use enforcement needs
// shared state only Convex holds. The operator exchanges this for a
// session cookie on first use (see ai-cloud-operator's
// requireGatewayToken) — Convex is never called again for the rest of
// that session, so opening a workload keeps working even if Convex is
// briefly unreachable after the initial exchange.
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

    const operator: { externalUrl: string } | null = await ctx.runQuery(
      internal.operators.queries.getExternalUrl,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Workload not found");
    }

    const token = generateToken();
    await ctx.runMutation(internal.gateway.mutations.create, {
      name: row.name,
      namespace: row.namespace,
      tokenHash: await hashToken(token),
      userId: user._id,
    });

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
