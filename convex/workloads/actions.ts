import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { authComponent } from "../auth";
import { mintGatewayToken } from "../gateway/token";
import { mintProfileDownloadUrl } from "../storage/r2";

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
    const config: Record<string, unknown> = { ...args.params };
    config.profileDownloadUrl = undefined;

    if (
      BROWSER_TEMPLATE_IDS.has(args.templateId) &&
      args.params.restoreProfile === true &&
      typeof args.params.profileName === "string" &&
      args.params.profileName.length > 0
    ) {
      config.profileDownloadUrl = await mintProfileDownloadUrl(
        user._id,
        args.templateId,
        args.params.profileName
      );
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

    await ctx.runMutation(internal.workloads.mutations.record, {
      name: args.name,
      namespace: args.namespace,
      operatorId: args.operatorId,
      templateId: args.templateId,
      userId: user._id,
    });
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

// Ownership check + HMAC mint. Never calls the operator — verification is
// entirely local on the operator side, so opening a workload keeps working
// even if the operator is briefly unreachable.
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

    const secret = process.env.GATEWAY_SIGNING_SECRET;
    if (!secret) {
      throw new Error("GATEWAY_SIGNING_SECRET not configured");
    }

    const token = await mintGatewayToken(secret, {
      name: row.name,
      namespace: row.namespace,
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
