/**
 * Resolves the invoking human for a request.
 *
 * Clerk is the identity for real members. A request without a verifiable Clerk
 * session token has no member behind it — every downstream authority check
 * (spaces, permissions, grants, sessions) is anchored to `human_id`, and an
 * anonymous caller would be an unbounded one.
 *
 * The one exception is judge demo access (docs/roadmap/judge-demo-access.md): a
 * signed `demo_session` cookie resolves to a `demo-<nonce>` identity that is
 * confined to the single shared kind:'guest' space and nothing else.
 */
import { verifyToken } from "@clerk/backend";
import { verifyDemoToken } from "./blob-sign";

export interface ResolvedHuman {
  human_id: string;
}

export async function resolveHuman(request: Request, env: Env): Promise<ResolvedHuman | null> {
  const cookieHeader = request.headers.get("Cookie");
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  // Fall back to Clerk's `__session` cookie so browser-initiated subresource
  // loads (<img>, <iframe> for blobs) authenticate too — those can't carry an
  // Authorization header. The cookie is SameSite=Lax, so it's safe against
  // cross-site POSTs; every blob key is still confined to the caller's space.
  const clerkCookie = cookieHeader?.match(/(?:^|;\s*)__session=([^;]+)/)?.[1];
  const token = bearer ?? (clerkCookie ? decodeURIComponent(clerkCookie) : null);
  if (token) {
    try {
      const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
      // `demo-` is the reserved prefix for demo identities, and spaceIdFor()
      // routes it to the shared public demo space. A Clerk subject is `user_…`,
      // so this cannot fire today — but if one ever did collide, that member's
      // archive would silently become the demo's. Refuse instead: fail closed
      // costs a login, guessing wrong costs someone their privacy.
      if (claims.sub && !claims.sub.startsWith("demo-")) return { human_id: claims.sub };
    } catch {
      // expired, forged, or issued by another instance — fall through to the
      // demo cookie below (a real member simply won't have one).
    }
  }

  // Judge demo access (docs/roadmap/judge-demo-access.md). No Clerk identity, so
  // fall back to the signed `demo_session` cookie set by /api/demo-entry. It
  // resolves to `demo-<nonce>` — an identity that, by construction of
  // spaceIdFor(), can reach nothing but the one shared kind:'guest' space, never
  // a member's kind:'personal' space. Fails closed: a missing, expired, or
  // tampered cookie yields null.
  const demoCookie = cookieHeader?.match(/(?:^|;\s*)demo_session=([^;]+)/)?.[1];
  const nonce = await verifyDemoToken(
    env.BLOB_SIGNING_SECRET,
    demoCookie ? decodeURIComponent(demoCookie) : null,
  );
  return nonce ? { human_id: `demo-${nonce}` } : null;
}
