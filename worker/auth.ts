/**
 * Resolves the invoking human for a request.
 *
 * Clerk is the only identity. A request without a verifiable session token has
 * no human behind it, so it gets nothing — every downstream authority check
 * (spaces, permissions, grants, sessions) is anchored to `human_id`, and an
 * anonymous caller would be an unbounded one.
 */
import { verifyToken } from "@clerk/backend";

export interface ResolvedHuman {
  human_id: string;
}

export async function resolveHuman(request: Request, env: Env): Promise<ResolvedHuman | null> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  // Fall back to Clerk's `__session` cookie so browser-initiated subresource
  // loads (<img>, <iframe> for blobs) authenticate too — those can't carry an
  // Authorization header. The cookie is SameSite=Lax, so it's safe against
  // cross-site POSTs; every blob key is still confined to the caller's space.
  const cookie = request.headers.get("Cookie")?.match(/(?:^|;\s*)__session=([^;]+)/)?.[1];
  const token = bearer ?? (cookie ? decodeURIComponent(cookie) : null);
  if (!token) return null;
  try {
    const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return claims.sub ? { human_id: claims.sub } : null;
  } catch {
    return null; // expired, forged, or issued by another instance
  }
}
