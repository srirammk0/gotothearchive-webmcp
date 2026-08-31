/**
 * Resolves the invoking human for a request.
 *
 * For now: a guest human id carried in a signed cookie, minted on first visit.
 * Clerk hook: when CLERK_SECRET_KEY is wired up, verify the session token from
 * the Authorization header/cookie here and return the Clerk user id instead —
 * everything downstream (permissions, grants, sessions) only needs `human_id`.
 */

const COOKIE_NAME = "gta_human";
const GUEST_SECRET = "gotothearchive-guest-cookie"; // ponytail: static demo secret, swap for env-bound key if guest cookies need to resist forgery

export interface ResolvedHuman {
  human_id: string;
  kind: "guest" | "clerk";
}

export function resolveHuman(request: Request): ResolvedHuman {
  // Clerk hook (inactive): if request has a verifiable Clerk session, return
  // { human_id: clerkUserId, kind: "clerk" } here instead of falling through.

  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (match) {
    const verified = verify(decodeURIComponent(match[1]));
    if (verified) return { human_id: verified, kind: "guest" };
  }
  return { human_id: `guest-${crypto.randomUUID()}`, kind: "guest" };
}

/** Mint a Set-Cookie header for a fresh or existing guest id. */
export function guestCookie(humanId: string): string {
  const signed = sign(humanId);
  return `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

function sign(humanId: string): string {
  return `${humanId}.${fnv1a(humanId + GUEST_SECRET)}`;
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const humanId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  return sig === fnv1a(humanId + GUEST_SECRET) ? humanId : null;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
