import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { authComponent } from "../auth";
import { adminQuery } from "../functions";
import { workloadStatusValidator } from "../schema";
import { matchesTags } from "./tagMatch";
import type { CatalogTemplate } from "./validators";
import { templateValidator } from "./validators";

interface MergedCatalogEntry {
  availableTags: Set<string>;
  operatorCount: number;
  template: CatalogTemplate;
}

const clusterWorkloadValidator = v.object({
  _id: v.id("workloads"),
  // "Config to apply"/"last-applied config" (see convex/schema.ts's doc
  // comment on workloads.config) — surfaced so the Fleet detail panel can
  // pre-fill a redeploy form the same way the owner's own Workloads page
  // does, via convex/workloads/actions.ts#adminRequestRedeploy.
  config: v.optional(v.any()),
  createdAt: v.number(),
  // The human-facing identity, always present; the real k8s name/namespace
  // are optional support-facing details that don't exist yet for a
  // requested/provisioning row (see convex/schema.ts).
  displayName: v.string(),
  // Populated only when status is "failed", or on an "active" row that
  // recovered from a failed redeploy/create report (see
  // workloads/mutations.ts#reportLifecycle) — surfaced to admins for
  // debugging, not shown at all when absent.
  failureReason: v.optional(v.string()),
  name: v.optional(v.string()),
  namespace: v.optional(v.string()),
  status: workloadStatusValidator,
  templateId: v.string(),
  userEmail: v.string(),
});

// Admin-only fleet overview: every cluster (operator) with its workloads,
// owner emails resolved from the Better Auth user table. Bounded rather than
// paginated — this is a fleet overview, not something meant to scroll
// through thousands of rows.
//
// `unclaimedWorkloads` is a separate list, not folded into any operator's
// `workloads`: a freshly `requested` row has no `operatorId` yet (see
// convex/schema.ts) until some operator claims it, so it can't be grouped
// under any real cluster — without this, such rows were simply invisible on
// this page (they only ever showed up on the requesting user's own
// workloads page, which lists by userId, not operatorId).
export const listClusters = adminQuery({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(200);
    const workloads = await ctx.db.query("workloads").take(1000);

    const userIds = [...new Set(workloads.map((workload) => workload.userId))];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    const toRow = (workload: (typeof workloads)[number]) => ({
      _id: workload._id,
      config: workload.config,
      createdAt: workload.createdAt,
      displayName: workload.displayName,
      failureReason: workload.failureReason,
      name: workload.name,
      namespace: workload.namespace,
      status: workload.status,
      templateId: workload.templateId,
      userEmail: emailByUserId.get(workload.userId) ?? workload.userId,
    });

    return {
      clusters: operators.map((operator) => ({
        _id: operator._id,
        claimedAt: operator.claimedAt,
        description: operator.description,
        healthStatus: operator.healthStatus,
        lastHeartbeatAt: operator.lastHeartbeatAt,
        name: operator.name,
        region: operator.region,
        resourceCapacity: operator.resourceCapacity,
        retentionPolicy: operator.retentionPolicy,
        tags: operator.tags ?? [],
        workloads: workloads
          .filter((workload) => workload.operatorId === operator._id)
          .map(toRow),
      })),
      unclaimedWorkloads: workloads
        .filter((workload) => !workload.operatorId)
        .map(toRow),
    };
  },
  returns: v.object({
    clusters: v.array(
      v.object({
        _id: v.id("operators"),
        claimedAt: v.optional(v.number()),
        description: v.optional(v.string()),
        healthStatus: v.union(
          v.literal("pending"),
          v.literal("healthy"),
          v.literal("offline"),
          v.literal("ready_to_destroy")
        ),
        lastHeartbeatAt: v.optional(v.number()),
        name: v.string(),
        region: v.optional(v.string()),
        // Self-reported on heartbeat (see ai-cloud-operator's internal/
        // capacity package) — display-only, for this fleet view. Never
        // gates a claim; see convex/schema.ts's operators.resourceCapacity
        // doc comment for why.
        resourceCapacity: v.optional(
          v.object({
            allocatableMemoryBytes: v.number(),
            allocatableMilliCpu: v.number(),
            reportedAt: v.number(),
            usedMemoryBytes: v.number(),
            usedMilliCpu: v.number(),
          })
        ),
        retentionPolicy: v.union(v.literal("standard"), v.literal("retain")),
        tags: v.array(v.string()),
        workloads: v.array(clusterWorkloadValidator),
      })
    ),
    unclaimedWorkloads: v.array(clusterWorkloadValidator),
  }),
});

// Deliberately excludes heartbeatTokenHash/deployToken — safe for the
// dashboard/CLI to call without ever printing a live credential. Also
// excludes "pending" clusters (admin pre-created, never claimed by a real
// operator) — not functional deploy targets, no value showing them here.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").collect();
    return operators
      .filter(
        (
          operator
        ): operator is typeof operator & {
          healthStatus: "healthy" | "offline" | "ready_to_destroy";
        } => operator.healthStatus !== "pending"
      )
      .map((operator) => ({
        _id: operator._id,
        healthStatus: operator.healthStatus,
        lastHeartbeatAt: operator.lastHeartbeatAt,
        name: operator.name,
      }));
  },
  returns: v.array(
    v.object({
      _id: v.id("operators"),
      healthStatus: v.union(
        v.literal("healthy"),
        v.literal("offline"),
        v.literal("ready_to_destroy")
      ),
      lastHeartbeatAt: v.optional(v.number()),
      name: v.string(),
    })
  ),
});

export const getByHeartbeatTokenHash = internalQuery({
  args: { heartbeatTokenHash: v.string() },
  handler: async (ctx, args) => {
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_heartbeatTokenHash", (q) =>
        q.eq("heartbeatTokenHash", args.heartbeatTokenHash)
      )
      .unique();
    return operator ? { _id: operator._id } : null;
  },
  returns: v.union(v.object({ _id: v.id("operators") }), v.null()),
});

// Returns just the operator's public URL — used by getWorkloadAccessToken,
// which mints a gateway token and never needs the live deployToken. Returns
// null for an unclaimed ("pending") operator, same as a missing row — it has
// no externalUrl yet either way.
export const getExternalUrl = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    return operator?.externalUrl ? { externalUrl: operator.externalUrl } : null;
  },
  returns: v.union(v.object({ externalUrl: v.string() }), v.null()),
});

// Returns only what's needed to call out to the operator's inbound API —
// deployToken is a live credential, so callers should not fetch or log the
// full operator document when this narrower shape will do. Returns null for
// an unclaimed ("pending") operator, which has neither field yet.
export const getForDeploy = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!(operator?.deployToken && operator.externalUrl)) {
      return null;
    }
    return {
      deployToken: operator.deployToken,
      externalUrl: operator.externalUrl,
    };
  },
  returns: v.union(
    v.object({ deployToken: v.string(), externalUrl: v.string() }),
    v.null()
  ),
});

// Resolves ANY operator whose own tags are a superset of `desiredOperatorTags`
// (see tagMatch#matchesTags) AND whose self-reported `catalog` includes the
// exact templateId+templateVersion requested — used only to fetch a catalog
// to resolve create-time params against (workloads/actions.ts#requestWorkload),
// and to honor the specific version the user picked in step 1 of the New
// Workload dialog (that id+version pair comes from listMergedCatalog below).
// The workload isn't actually assigned to this operator, that's still decided
// competitively later via claim(). Prefers a `healthy` candidate but falls
// back to any tag-matching one (offline/ready_to_destroy) rather than
// failing outright — a temporarily-unreachable operator can still resolve a
// catalog even if it can't yet claim anything. Bounded read: a few hundred
// operators is a reasonable ceiling for this table.
export const getRepresentativeForTags = internalQuery({
  args: {
    desiredOperatorTags: v.array(v.string()),
    templateId: v.string(),
    templateVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const operators = await ctx.db.query("operators").take(200);
    const candidates = operators.filter(
      (operator) =>
        operator.deployToken &&
        operator.externalUrl &&
        matchesTags(operator.tags, args.desiredOperatorTags) &&
        (operator.catalog ?? []).some(
          (template) =>
            template.id === args.templateId &&
            template.version === args.templateVersion
        )
    );
    if (candidates.length === 0) {
      return null;
    }
    const chosen =
      candidates.find((operator) => operator.healthStatus === "healthy") ??
      candidates[0];
    return {
      deployToken: chosen.deployToken as string,
      externalUrl: chosen.externalUrl as string,
    };
  },
  returns: v.union(
    v.object({ deployToken: v.string(), externalUrl: v.string() }),
    v.null()
  ),
});

// Merges every operator's self-reported catalog (see convex/schema.ts's
// operators.catalog doc comment) into one flat list, keyed by
// `${templateId}@${version}` — the same templateId at two different
// versions across two operators shows up as two distinct entries, each
// carrying which operator tags can actually serve it. Public and reactive
// (unlike today's single-representative-operator, action-based catalog
// fetch — see operators/actions.ts#fetchResolvedCatalog): this is pure DB
// reads, so it's the data layer for a future workload-creation UI that
// lists every version side by side rather than only whichever operator
// happened to be picked as representative. Bounded read, same convention
// as list/getRepresentativeForTags above.
export const listMergedCatalog = query({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(200);
    const byKey = new Map<string, MergedCatalogEntry>();
    for (const operator of operators) {
      const tags = operator.tags ?? [];
      for (const template of operator.catalog ?? []) {
        const key = `${template.id}@${template.version}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.operatorCount += 1;
          for (const tag of tags) {
            existing.availableTags.add(tag);
          }
        } else {
          byKey.set(key, {
            availableTags: new Set(tags),
            operatorCount: 1,
            template,
          });
        }
      }
    }
    return [...byKey.values()].map(
      ({ availableTags, operatorCount, template }) => ({
        ...template,
        availableTags: [...availableTags],
        operatorCount,
      })
    );
  },
  returns: v.array(
    v.object({
      ...templateValidator.fields,
      availableTags: v.array(v.string()),
      operatorCount: v.number(),
    })
  ),
});

// Returns any one operator's self-reported copy of the templateId+
// templateVersion pair — by definition of listMergedCatalog's own dedup key
// (`${id}@${version}`), every operator reporting that key asserts the same
// template shape, so the first match is as good as any other. Used by
// operators/actions.ts#resolveMergedTemplate to resolve dynamic/fileOptions
// parameter options for a user-selected template without picking an
// operator or making a live HTTP call — that resolution is purely against
// Convex's own selectOptions/files tables, scoped by userId, unrelated to
// which operator eventually serves the deploy.
export const getTemplateByIdAndVersion = internalQuery({
  args: { templateId: v.string(), templateVersion: v.string() },
  handler: async (ctx, args) => {
    const operators = await ctx.db.query("operators").take(200);
    for (const operator of operators) {
      const template = (operator.catalog ?? []).find(
        (t) => t.id === args.templateId && t.version === args.templateVersion
      );
      if (template) {
        return template;
      }
    }
    return null;
  },
  returns: v.union(templateValidator, v.null()),
});

// Returns one already-known operator's self-reported copy of a template by
// id (no version filter) — used by call sites that already have a
// workload's fixed operatorId (redeploy, run-operation, admin catalog
// display) and have always trusted whatever version that operator
// currently reports, unlike getTemplateByIdAndVersion's cross-operator
// version-pinned search above.
export const getOperatorCatalogTemplate = internalQuery({
  args: { operatorId: v.id("operators"), templateId: v.string() },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    return (
      (operator?.catalog ?? []).find((t) => t.id === args.templateId) ?? null
    );
  },
  returns: v.union(templateValidator, v.null()),
});

// Every distinct tag any operator has self-registered, regardless of which
// templates it serves — the New Workload dialog's tag multiselect draws
// from this (not listMergedCatalog's per-entry availableTags) so users can
// browse the full registered vocabulary rather than only tags already tied
// to their current template selection. Bounded read, same convention as
// list/getRepresentativeForTags above.
export const listAllTags = query({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(200);
    const tags = new Set<string>();
    for (const operator of operators) {
      for (const tag of operator.tags ?? []) {
        tags.add(tag);
      }
    }
    return [...tags].toSorted();
  },
  returns: v.array(v.string()),
});
