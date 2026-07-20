import type { DataModel } from "../_generated/dataModel";
import { requireAdminUser } from "../auth";
import { r2 } from "./r2";

// Exposes generateUploadUrl/syncMetadata as real, browser-callable Convex
// functions (see @convex-dev/r2's clientApi) for the preset thumbnail
// uploader — the first client-driven upload flow in this app; every other
// R2 usage (browser profile backups) is server-to-server, minted inside an
// action and handed to the operator, never a Convex function the browser
// calls directly (see storage/r2.ts's mintUploadUrl). checkUpload gates
// generateUploadUrl admin-only via the same requireAdminUser check used
// everywhere else — only admins manage presets, so only admins should be
// able to mint an upload target here.
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireAdminUser(ctx);
  },
});
