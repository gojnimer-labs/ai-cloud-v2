import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";

// r2.getUrl works fine in the default V8 runtime (confirmed by the
// component's own docs, which use it inside a plain `query`) — no
// "use node" needed here.
export const r2 = new R2(components.r2);

const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // 1 hour

// Mints a presigned GET URL for an exact R2 object key. Callers get the key
// from their own source of truth (e.g. a selectOptions row's `data.r2Key` —
// see workloads/actions.ts#deployWorkload) rather than reconstructing it
// from a naming convention here, so upload paths are free to lay objects out
// however they want. The object may not exist (a stale/deleted backup) —
// that's fine, the operator's init container checks the HTTP status and
// starts fresh rather than failing when the URL 404s.
export async function mintDownloadUrl(key: string): Promise<string> {
  return await r2.getUrl(key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

// Mints a presigned PUT URL for an exact R2 object key (the caller picks
// the key up front, e.g. a timestamped path under profiles/<template>/, so
// it knows what to record once the upload succeeds — see
// workloads/actions.ts#runCustomFunction).
export async function mintUploadUrl(key: string): Promise<string> {
  const { url } = await r2.generateUploadUrl(key);
  return url;
}
