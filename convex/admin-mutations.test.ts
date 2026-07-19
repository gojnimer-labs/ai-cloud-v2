/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedWorkload = async (
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    status:
      | "requested"
      | "provisioning"
      | "active"
      | "requested_destroy"
      | "destroying"
      | "requested_redeploy"
      | "redeploying"
      | "requested_stop"
      | "stopping"
      | "stopped"
      | "requested_resume"
      | "resuming"
      | "failed"
      | "destroyed";
    userId: string;
  }> = {}
): Promise<Id<"workloads">> =>
  await t.run((ctx) =>
    ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: `wl-${Math.random().toString(36).slice(2, 8)}`,
      status: overrides.status ?? "active",
      templateId: "nginx",
      userId: overrides.userId ?? "user_123",
    })
  );

test("createCluster rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.admin.mutations.createCluster, {
      name: "test-cluster",
      retentionPolicy: "standard",
    })
  ).rejects.toThrow("Admin access required");
});

// --- stopAllWorkloadsForUser / resumeAllWorkloadsForUser -------------------
//
// The public mutations are admin-gated via requireAdminUser, which reads
// role off the Better Auth component — standing up a full admin-authenticated
// identity in convex-test is its own rabbit hole unrelated to this feature,
// so (mirroring createCluster's rejection-only coverage above) the bulk
// filtering logic itself is tested directly against the internal mutations
// the public wrappers delegate to.

test("stopAllWorkloadsForUser rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.admin.mutations.stopAllWorkloadsForUser, {
      userId: "user_a",
    })
  ).rejects.toThrow("Admin access required");
});

test("resumeAllWorkloadsForUser rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.admin.mutations.resumeAllWorkloadsForUser, {
      userId: "user_a",
    })
  ).rejects.toThrow("Admin access required");
});

// adminGetWorkloadAccessToken moved here from admin/actions.ts (was an
// adminAction) with zero prior test coverage — same rejection-only pattern
// as the rest of this file.
test("adminGetWorkloadAccessToken rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const workloadId = await seedWorkload(t, { status: "active" });
  await expect(
    t.mutation(api.admin.mutations.adminGetWorkloadAccessToken, {
      workloadId,
    })
  ).rejects.toThrow("Admin access required");
});

test("stopAllWorkloadsForUserInternal: stops only the target user's active rows", async () => {
  const t = convexTest(schema, modules);
  const targetActive1 = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const targetActive2 = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const targetStopped = await seedWorkload(t, {
    status: "stopped",
    userId: "user_a",
  });
  const otherActive = await seedWorkload(t, {
    status: "active",
    userId: "user_b",
  });

  await t.mutation(internal.admin.mutations.stopAllWorkloadsForUserInternal, {
    userId: "user_a",
  });

  const rows = await t.run((ctx) => ctx.db.query("workloads").collect());
  const byId = new Map(rows.map((row) => [row._id, row]));
  expect(byId.get(targetActive1)?.status).toBe("requested_stop");
  expect(byId.get(targetActive2)?.status).toBe("requested_stop");
  // A user's own already-stopped row is untouched — only active rows flip.
  expect(byId.get(targetStopped)?.status).toBe("stopped");
  // A different user's active row is never touched.
  expect(byId.get(otherActive)?.status).toBe("active");
});

test("resumeAllWorkloadsForUserInternal: resumes only the target user's stopped rows", async () => {
  const t = convexTest(schema, modules);
  const targetStopped1 = await seedWorkload(t, {
    status: "stopped",
    userId: "user_a",
  });
  const targetActive = await seedWorkload(t, {
    status: "active",
    userId: "user_a",
  });
  const otherStopped = await seedWorkload(t, {
    status: "stopped",
    userId: "user_b",
  });

  await t.mutation(internal.admin.mutations.resumeAllWorkloadsForUserInternal, {
    userId: "user_a",
  });

  const rows = await t.run((ctx) => ctx.db.query("workloads").collect());
  const byId = new Map(rows.map((row) => [row._id, row]));
  expect(byId.get(targetStopped1)?.status).toBe("requested_resume");
  // A user's own active row is untouched — only stopped rows flip.
  expect(byId.get(targetActive)?.status).toBe("active");
  // A different user's stopped row is never touched.
  expect(byId.get(otherStopped)?.status).toBe("stopped");
});
