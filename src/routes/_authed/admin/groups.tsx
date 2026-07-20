import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GroupsPage } from "@/pages/admin-groups";

export const Route = createFileRoute("/_authed/admin/groups")({
  component: GroupsPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    groupId: z.string().optional().catch(undefined),
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    modal: z.enum(["create", "edit"]).optional().catch(undefined),
  }),
});
