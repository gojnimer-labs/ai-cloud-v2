import { R2 } from "@convex-dev/r2";
import { components } from "../_generated/api";

// r2.getUrl works fine in the default V8 runtime (confirmed by the
// component's own docs, which use it inside a plain `query`) — no
// "use node" needed here.
export const r2 = new R2(components.r2);

const PROFILE_URL_TTL_SECONDS = 60 * 60; // 1 hour
const SAFE_KEY_SEGMENT_RE = /[^A-Za-z0-9._-]/g;

function sanitizeKeySegment(raw: string): string {
  return raw.replace(SAFE_KEY_SEGMENT_RE, "_");
}

function profileObjectKey(
  userId: string,
  templateId: string,
  profileName: string
): string {
  return `profiles/${sanitizeKeySegment(userId)}/${sanitizeKeySegment(templateId)}/${sanitizeKeySegment(profileName)}.tar.gz`;
}

// Mints a presigned GET URL for a browser-profile backup. The R2 object may
// not exist yet (first-time deploy under a new profile name) — that's fine,
// the operator's init container checks the HTTP status and starts fresh
// rather than failing when the URL 404s.
export async function mintProfileDownloadUrl(
  userId: string,
  templateId: string,
  profileName: string
): Promise<string> {
  const key = profileObjectKey(userId, templateId, profileName);
  return await r2.getUrl(key, { expiresIn: PROFILE_URL_TTL_SECONDS });
}
