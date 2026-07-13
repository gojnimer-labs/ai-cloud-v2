// Mints HMAC-signed, short-lived access tokens for the operator's /gw/*
// reverse-proxy routes. Mirrors ai-cloud-operator/internal/gateway/token.go's
// exact byte layout: base64url(JSON payload) + "." + base64url(HMAC-SHA256
// signature computed over the base64url payload STRING, not the raw JSON).
// The two sides only need to agree on this one wire format.
const TOKEN_TTL_SECONDS = 180;

const PLUS_RE = /\+/g;
const SLASH_RE = /\//g;
const TRAILING_EQUALS_RE = /[=]+$/;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(PLUS_RE, "-")
    .replace(SLASH_RE, "_")
    .replace(TRAILING_EQUALS_RE, "");
}

export interface GatewayTokenPayload {
  name: string;
  namespace: string;
  userId: string;
}

// Runs in Convex's default V8 runtime (Web Crypto, no "use node") — same as
// convex/operators/crypto.ts.
export async function mintGatewayToken(
  secret: string,
  payload: GatewayTokenPayload
): Promise<string> {
  const claims = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(claims))
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));

  return `${payloadB64}.${sigB64}`;
}
