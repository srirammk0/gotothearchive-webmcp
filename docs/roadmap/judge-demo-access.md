# Judge demo access — implementation plan

How a hackathon judge gets into a working Archive without an account, without
touching the owner's real data, and without weakening the permission model the
submission is about.

## Constraints this has to respect

1. **`humanRegions()` gives the owner `write` and everyone else `none`.** There
   is no multi-person Archive. A judge cannot be "shared into" the real space —
   that code path does not exist and must not be faked for the demo.
2. **`BETA_MAX_USERS = 25`.** Judges must not burn beta slots.
3. **Quotas are per human.** A judge exhausting `agent_calls` must not take the
   owner's budget with them.
4. **The schema already has `spaces.kind = 'personal' | 'guest'`.** The guest
   case exists in the contract and is the intended hook. Use it.

## Recommended shape: a seeded guest space per judge

A judge signs in through the normal Clerk flow and lands in their **own** guest
space, pre-seeded with a copy of the demo material. Everything they do is real —
real grants, real retrieval, real revocation, real denials — against data that
is not the owner's.

This is the only option that keeps the demo honest. A read-only screenshot tour
cannot show runtime denial, which is the whole claim.

### Implementation

**1. Seed content lives in the repo, not in the owner's space.**

`worker/db/demo-seed.ts` (new): a small module exporting the demo regions
(`work`, `inspiration`, `personal`) and ~8–10 items — titles, `semantic_text`,
and a **pre-computed `metadata.design`** for each image.

Ship the design profiles as data. Do **not** let a guest space trigger the
vision model on first boot: it would cost a Workers AI call per image per judge,
take ~8s each, and produce a *different* profile for each judge, so no two judges
would see the same demo. Bake the exact profiles that were extracted once.

Blobs: reference a small set of demo images already in R2 under a fixed
`demo/` key prefix, shared read-only by every guest space. `isOwnedBlobKey()` in
[worker/routes.ts](../../worker/routes.ts) currently ties a key to a human — it
needs one extra allowance for the `demo/` prefix, read-only, and nothing else.

**2. Guest space provisioning.**

On bootstrap, if the human has no space and arrived with the demo flag, create
`kind: 'guest'` and apply the seed. Everything downstream (regions, grants,
tasks, retrieval, graph derivation, taste) then works unmodified, because it is
all keyed off `space_id`.

`rebuildSpaceEdges` runs on boot as normal, so a seeded space grows real design
edges from the baked profiles with no AI call.

**3. Entry point.**

`/demo` → sets the flag, then the normal sign-in. Simplest thing that works:
a signed link with an expiry, verified with the existing
[worker/blob-sign.ts](../../worker/blob-sign.ts) HMAC helper rather than a new
mechanism.

**4. Quota and cap.**

- Guest spaces are exempt from `BETA_MAX_USERS`, counted separately.
- Give guests their own smaller `QUOTA` row — enough for a full demo run
  (~40 `agent_calls`, ~5 `artifacts`, 0 `uploads`) and no more.
- `uploads: 0` matters: it removes the R2 write path and the vision-model path
  from the guest surface entirely.

**5. Reset.**

A guest space is disposable. Either give it a short TTL, or a "reset demo"
control that drops and re-seeds. A judge who revokes everything and closes the
task must be able to get back to a working state without asking you.

### Guards

- A guest space must never be able to read another space. This is already true
  via `space_id` scoping — **add a test that asserts it** rather than assuming.
- `demo/` blobs are read-only to guests. A guest must not be able to write to
  that prefix or reference a key outside it.
- Deleting a guest space must not touch `demo/` blobs, which are shared.

### Tests

- a guest space boots with the seeded regions, items and design profiles
- design profiles arrive pre-baked (assert **no** AI binding call on guest boot)
- a guest cannot read the owner's items, at any grant level
- a guest cannot consume the owner's quota
- guest spaces do not count against `BETA_MAX_USERS`

## Fallback if time runs short

A single shared guest space with a published link, reset between judges. Loses
isolation — two judges at once will collide on grants — but preserves the live
revocation demo, which is the part that cannot be faked. Do not fall back further
than this: a video-only submission cannot demonstrate runtime denial, and runtime
denial is the claim.

## What to tell judges

One short page, linked from the submission:

- what the space contains and that it is theirs to break
- the exact flow to walk: grant → retrieve → artifact → annotate → taste →
  **revoke → watch the tool disappear and a stale call get refused**
- that the archive is seeded demo material, not a real person's
