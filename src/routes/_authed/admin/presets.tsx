import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PresetsPage } from "@/pages/admin-presets";

export const Route = createFileRoute("/_authed/admin/presets")({
  component: PresetsPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    modal: z.enum(["create", "edit"]).optional().catch(undefined),
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    presetId: z.string().optional().catch(undefined),
  }),
});
