import { R2 } from "@convex-dev/r2";

import { components } from "../_generated/api";

// r2.getUrl works fine in the default V8 runtime (confirmed by the
// component's own docs, which use it inside a plain `query`) — no
// "use node" needed here.
export const r2 = new R2(components.r2);

// 1 hour
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

// Mints a presigned GET URL for an exact R2 object key. Callers get the key
// from their own source of truth (e.g. a files row's `r2Key` — see
// resolveFileUrl below) rather than reconstructing it from a naming
// convention here, so upload paths are free to lay objects out however
// they want. The object may not exist (a stale/deleted backup) — that's
// fine, the operator's init container checks the HTTP status and starts
// fresh rather than failing when the URL 404s.
export const mintDownloadUrl = async (key: string): Promise<string> =>
  await r2.getUrl(key, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });

// Mints a presigned PUT URL for an exact R2 object key (the caller picks
// the key up front, e.g. a timestamped path under files/<group>/, so it
// knows what to record once the upload succeeds — see prepareFileUpload
// below).
export const mintUploadUrl = async (key: string): Promise<string> => {
  const { url } = await r2.generateUploadUrl(key);
  return url;
};

// Turns a files-table row back into a usable download URL — the one real
// R2-backed case, called directly rather than through a handler registry
// (see operators/fileParams.ts#resolveFileParams).
export const resolveFileUrl = async (file: {
  r2Key: string;
}): Promise<string> => await mintDownloadUrl(file.r2Key);

// Mints a fresh upload target for a new file before calling the operator —
// the key naming convention (which group/user/timestamp) lives here, next
// to the only code that constructs R2 keys. Called directly from
// operators/fileParams.ts#resolveFileParams; the caller records a files
// row (see workloads/actions.ts#runOperation) using the returned
// r2Bucket/r2Key once the operator confirms the upload succeeded.
export const prepareFileUpload = async (
  group: string,
  userId: string
): Promise<{ paramValue: string; r2Bucket: string; r2Key: string }> => {
  const r2Key = `files/${group}/${userId}/${Date.now()}.tar.gz`;
  return {
    paramValue: await mintUploadUrl(r2Key),
    r2Bucket: r2.config.bucket,
    r2Key,
  };
};
