# Judge demo access — one shared archive

How a hackathon judge gets into a working Archive without an account, and how
several judges land in the **same** archive so each can point their own WebMCP
agent at it at once — without weakening the permission model the submission is
about.

> **This supersedes the earlier "a seeded guest space per judge" plan.** The repo
> owner asked for the shared model explicitly: the showcase is *two agents on one
> archive*, each bounded by its own grant, where judge A revoking a region for
> A's task does not touch judge B's agent. A per-judge space cannot show that.
> The cost — judges share one archive and see each other's edits — is accepted
> and documented (see docs/judges.md).

## Constraints this still respects

1. **`humanRegions()` gives the owner `write` and everyone else `none`.** The one
   relaxation: a `demo-*` identity gets `write` on the regions of a
   `kind: 'guest'` space. It is hard-gated on `kind === 'guest'`, so a
   `kind: 'personal'` space can never grant a non-owner anything.
2. **`BETA_MAX_USERS = 25`.** Demo identities are exempt and counted separately.
3. **Quotas are per human.** Each judge's `demo-<nonce>` meters against its own
   `GUEST_QUOTA` row; one judge exhausting `agent_calls` does not take another's
   budget, nor the owner's.
4. **`spaces.kind = 'personal' | 'guest'`.** The guest case is the intended hook.

## THE INVARIANT THAT MUST NOT BEND

A demo identity must **never** reach a `kind: 'personal'` space at any level.
Isolation between demo and real members stays absolute; only isolation *among*
demo visitors relaxes. Two independent enforcement points, either sufficient on
its own:

- **`spaceIdFor()`** maps every `demo-<nonce>` to the literal `space-demo` and
  nothing else. A demo identity cannot construct `space-<clerkId>`, so it has no
  way to *name* a member's space. (Clerk subject ids are `user_…`, never
  `demo-…`, so the prefixes cannot collide.)
- **`humanRegions()`** grants a non-owner `write` only when
  `space.kind === 'guest'` *and* the caller is a `demo-*` identity. A personal
  space never takes that branch.

`worker/demo-seed.test.ts` asserts this directly: a demo task with a hand-inserted
cross-space grant at `read` / `propose` / `write` still reads nothing from a
personal space.

## The shape that was built

### 1. Demo identity is a signed cookie

- **`signDemoToken(secret, ttl)`** (`worker/blob-sign.ts`) mints
  `{ nonce, exp, value }`. `nonce` is `crypto.randomUUID()`; the HMAC covers the
  nonce and the expiry together (key `demo:<nonce>`, same `sign(secret, key, exp)`
  helper as a blob signature). `value` is `<nonce>.<exp>.<sig>`.
- **`GET /api/demo-entry`** mints one and sets it as
  `demo_session=<value>; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`,
  then `302`s to `/`. TTL 24h — the cookie *is* the session now, not a one-shot
  handoff. It also sets a readable `demo_hint=1` companion (no authority; only
  tells the signed-out React shell to render the app).
- **`resolveHuman()`** (`worker/auth.ts`) falls back to `demo_session` when there
  is no valid Clerk token, returning `{ human_id: "demo-<nonce>" }`. It verifies
  the HMAC + expiry with `verifyDemoToken()` and fails closed on anything missing,
  malformed, expired, or wrongly signed.
- **The demo is the default unauthenticated view.** `src/main.tsx`: a signed-out
  visitor with no `demo_hint` is sent through `/api/demo-entry` once (a `fetch`
  that follows the redirect and picks up the cookies), then the reload renders
  `<App demo />`. A `sessionStorage` guard falls back to a plain Clerk sign-in
  screen if `/api/demo-entry` is unavailable. Members otherwise sign in from the
  rail.
- Pre-minted links: `scripts/demo-link.ts` emits
  `${origin}/api/demo-entry?token=<exp>.<sig>` (signed with `signDemoLink`, keyed
  on `"demo"`, default 14-day TTL). `/api/demo-entry` verifies the token before
  minting a session; an expired token → `403`. The bare `/api/demo-entry` also
  works — it is the open door, and now the default path in.
- **The old client path is gone.** `src/main.tsx` no longer stashes a token in
  `sessionStorage`; `src/api/client.ts` no longer replays `demoBootstrapQuery`
  on bootstrap. The cookie (sent automatically with `credentials: same-origin`)
  supersedes both. The client-side `/demo` route is deleted — with a server-set
  cookie the entry point has to be a server route, and `/api/demo-entry` is one.

### 2. One shared demo space

Fixed id `space-demo` (`DEMO_SPACE_ID` in `worker/db/demo-seed.ts`),
`kind: 'guest'`. Every demo visitor lands in it via `spaceIdFor()`.

`handleBootstrap` seeds it idempotently on first touch — `provisionGuestSpace` if
the space does not exist, or a `purgeSpace` + `applyDemoSeed` recovery if a later
visitor finds it wiped (every judge can delete everything). **No double-seed:**
the whole block is synchronous and a Durable Object runs one request's JS to
completion before the next, so with no `await` between the `getSpace` check and
the write, two judges arriving together cannot both pass `!existing`.

### 3. The permission seam

`humanRegions()` returns `write` for a `demo-*` identity on a `kind: 'guest'`
space's regions — see THE INVARIANT above for how it is gated.

### 4. Everything else is unchanged

Grants stay per-task. Two judges each create their own tasks and grants; the
authority intersection (human ∩ grant ∩ task ∩ page ∩ policy) is untouched.
Judge A revoking a region on A's task revokes only grant rows with
`task_id = A's task` — B's grant on the same region row is a different row and is
untouched. Invariant #11 (approval is never an agent capability) is untouched.

### 5. Reset

No per-judge reset — one judge resetting would wipe every other judge's work.
Recovery is automatic instead: if the shared space is emptied, the next
`/api/demo-entry` → bootstrap re-seeds it.

## Known ceilings

- `/api/demo-entry` is an open door — it is the default way in. Anyone can mint
  a demo session; the edge rate-limiter (`env.API_RL`, per IP) is the only
  throttle. Acceptable for a few-day hackathon window; the signed `?token=`
  links exist for when the open door should be closed.
- `Secure` cookies need HTTPS. The demo flow therefore only works on the
  deployed origin, not plain-http localhost (where real members use Clerk
  sign-in anyway).
- Taste signals are space-scoped, so a signal one judge confirms is visible to
  every judge's retrieval. This is the documented consequence of one shared
  archive, not a hole in the per-task grant model.

## What to tell judges

`docs/judges.md` — one page, honest about the shared archive, with the flow to
walk ending on **revoke → watch the tool disappear and a stale call get refused**.
