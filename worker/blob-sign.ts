/**
 * Time-limited, single-key signed access to a blob — how an agent can fetch
 * an image on its own (no browser session, no cookie) without this app
 * handing out a bucket credential or a raw R2 URL. handleBlob's own docstring
 * ("the agent never receives a bucket credential or a raw R2 URL — it only
 * ever sees this path") still holds: a signed URL is that same /api/blob
 * path, just carrying an alternate, narrowly-scoped, expiring credential
 * (one key, one expiry) instead of a session cookie.
 *
 * No BLOB_SIGNING_SECRET configured -> signBlobKey returns null and callers
 * omit the URL entirely, same fail-safe shape as everything else here.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, key: string, exp: number): Promise<string> {
  const cryptoKey = await hmacKey(secret);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${key}:${exp}`));
  return toHex(mac);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A fully-qualified, independently-fetchable blob URL good for `ttlMs` (default 15 min). null if unconfigured. */
export async function signedBlobUrl(
  secret: string | undefined,
  origin: string,
  blobPath: string,
  key: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<string | null> {
  if (!secret) return null;
  const exp = Date.now() + ttlMs;
  const sig = await sign(secret, key, exp);
  const url = new URL(blobPath, origin);
  url.searchParams.set("key", key);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Verifies a request's `exp`/`sig` for `key`. false on any missing/expired/wrong signature — never throws. */
export async function verifyBlobSignature(
  secret: string | undefined,
  key: string,
  expParam: string | null,
  sigParam: string | null,
): Promise<boolean> {
  if (!secret || !expParam || !sigParam) return false;
  const exp = Number(expParam);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  try {
    const expected = await sign(secret, key, exp);
    return timingSafeEqual(expected, sigParam);
  } catch {
    return false;
  }
}
