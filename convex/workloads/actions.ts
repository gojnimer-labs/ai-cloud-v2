import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { authComponent } from "../auth";
import { generateToken, hashToken } from "../operators/crypto";
import { mintDownloadUrl, mintUploadUrl, r2 } from "../storage/r2";

// Mirrors ai-cloud-operator's WorkloadStatus JSON shape — both fields carry
// `omitempty` on the Go side, so they can genuinely be absent (e.g. right
// after creation, before the reconciler fills them in).
interface WorkloadStatus {
  phase?: string;
  readyReplicas?: number;
}
type OperatorForDeploy = { deployToken: string; externalUrl: string } | null;

// Templates whose profileDownloadUrl system parameter this action knows how
// to compute. Kept as an explicit allowlist rather than derived from the
// catalog schema — Convex's own business logic decides which templates get
// which system values, the catalog only tells the frontend what to render.
const BROWSER_TEMPLATE_IDS = new Set(["firefox", "chrome"]);

export const deployWorkload = action({
  args: {
    name: v.string(),
    namespace: v.string(),
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

    // config starts from the user-supplied params, but any system-sourced
    // key (profileDownloadUrl) is always recomputed here and overwrites
    // whatever the client sent — never trust a client value for those.
    const config: Record<string, unknown> = {
      ...args.params,
      profileDownloadUrl: undefined,
    };

    if (
      BROWSER_TEMPLATE_IDS.has(args.templateId) &&
      args.params.restoreProfile === true &&
      typeof args.params.profileName === "string" &&
      args.params.profileName.length > 0
    ) {
      // profileName is a selectOptions row id (see the "profiles_browser"
      // dynamic-select source in ai-cloud-operator's browser.go), not a
      // literal profile name — resolve it back to the exact R2 key the
      // option was seeded with. A stale/deleted option (row gone, malformed
      // id, or data.r2Key missing) is treated as "nothing to restore" rather
      // than failing the whole deploy — params.profileName ultimately comes
      // from client-supplied JSON, so it isn't guaranteed to be a
      // well-formed selectOptions id.
      const option = await ctx
        .runQuery(internal.selectOptions.queries.get, {
          id: args.params.profileName as Id<"selectOptions">,
        })
        .catch(() => null);
      const r2Key =
        option && typeof option.data?.r2Key === "string"
          ? option.data.r2Key
          : null;
      if (r2Key) {
        config.profileDownloadUrl = await mintDownloadUrl(r2Key);
      }
    }

    const res = await fetch(`${operator.externalUrl}/workloads`, {
      body: JSON.stringify({
        config,
        name: args.name,
        namespace: args.namespace,
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
            `${operator.externalUrl}/workloads/${row.namespace}/${row.name}`,
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

    const res = await fetch(
      `${operator.externalUrl}/workloads/${row.namespace}/${row.name}`,
      {
        headers: { Authorization: `Bearer ${operator.deployToken}` },
        method: "DELETE",
      }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Operator delete call failed: ${res.status}`);
    }

    return null;
  },
  returns: v.null(),
});

// The generic invocation path any catalog CustomFunction reuses (see
// catalog.CustomFunction in ai-cloud-operator) — most functions need no
// Convex-side involvement beyond auth/ownership and proxying to the
// operator. backup_state is the one exception so far: it needs a
// system-sourced uploadUrl (only Convex holds R2 credentials) and, on
// success, a new selectOptions row so the backup shows up as a restore
// option — both handled by the small allowlist below, exactly like
// deployWorkload's BROWSER_TEMPLATE_IDS/profileDownloadUrl. Adding a future
// custom function that needs neither of these requires no changes here at
// all; it already works through the generic path.
const BACKUP_STATE_FUNCTION_KEY = "backup_state";

export const runCustomFunction = action({
  args: {
    functionKey: v.string(),
    params: v.record(v.string(), v.any()),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
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

    const params: Record<string, unknown> = { ...args.params };

    // A new backup's R2 key is decided here, up front, so we know exactly
    // what to record if (and only if) the operator's exec actually succeeds
    // — never derived from the operator's response, which only echoes back
    // stdout.
    let newBackupR2Key: string | null = null;
    if (
      BROWSER_TEMPLATE_IDS.has(row.templateId) &&
      args.functionKey === BACKUP_STATE_FUNCTION_KEY
    ) {
      newBackupR2Key = `profiles/${row.templateId}/${user._id}/${Date.now()}.tar.gz`;
      params.uploadUrl = await mintUploadUrl(newBackupR2Key);
    }

    const res = await fetch(
      `${operator.externalUrl}/workloads/${row.namespace}/${row.name}/functions/${args.functionKey}`,
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
    const result: Record<string, unknown> = await res.json();

    if (newBackupR2Key) {
      const label =
        typeof args.params.label === "string" && args.params.label.length > 0
          ? args.params.label
          : `Backup ${new Date().toISOString()}`;
      await ctx.runMutation(internal.selectOptions.mutations.create, {
        createdAt: Date.now(),
        data: { r2Bucket: r2.config.bucket, r2Key: newBackupR2Key },
        label,
        sourceKey: "profiles_browser",
        updatedAt: Date.now(),
        userId: user._id,
      });
    }

    return result;
  },
  returns: v.record(v.string(), v.any()),
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
