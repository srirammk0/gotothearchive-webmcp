# Implementation plan — 2026-09-02

Four features. Written to be implemented directly; each one names the files, the
guards that must hold, and what "done" means.

Judge demo access is deliberately **not** here — see
[judge-demo-access.md](./judge-demo-access.md).

Definition of done for every item (BUILD-CONTRACT.md): `bun run build`,
`bun run lint`, and `bun test` — the whole suite, no path argument — all clean.

---

## F1 — Region-scoped taste revocation

**The most important of the four.** Do this one first.

### Why

Revoking a folder currently takes away the folder's *items* but leaves the
*taste those items taught*. Taste is a distillation of the material, so a signal
derived from Inspiration is Inspiration's content in compressed form. Surfacing
it after Inspiration is revoked leaks exactly what the revocation was meant to
withhold.

Today `get_taste_for_task` gates only on `authorizedRegionIds(...).size === 0` —
if the agent can read *any* region it receives *every* signal in the space.

This is also the strongest demo beat available: revoke the folder, and the taste
it taught goes with it.

### The rule

A taste signal's **grounding regions** are the regions of the archive items
behind its supporting evidence.

> A signal is available to a task only when **every** one of its grounding
> regions is currently readable by that task.

Strict (`every`, not `some`) on purpose: a signal partly taught by a revoked
folder is still partly that folder's content. It is also the legible rule — "the
folder went, so its taste went" — where `some` produces a confusing partial
state. A signal with **no** grounding regions at all (nothing resolvable) is
treated as ungrounded and stays available; it was not taught by any folder.

### Deriving grounding regions

Evidence already points at the material. For each row in
`q.listTasteEvidence(signalId)`:

- `item_id` → `q.getItem(id)` → `item.region_id`
- `annotation_id` → `q.getAnnotation(id)` → `.version_id` →
  `q.listInfluences(versionId)` → each `item_id` → `q.getItem(...)` →
  `item.region_id`

Add one helper, used by both call sites below:

```ts
// worker/taste/scope.ts  (new file)
/** Regions of the archive material behind a signal's supporting evidence. */
export function groundingRegionIds(q: Queries, signalId: Id): Set<string>

/** every() grounding region readable ⇒ the signal may reach this task. */
export function signalIsInScope(q: Queries, signalId: Id, readable: Set<string>): boolean
```

`ponytail:` walks evidence per signal on each call. Evidence is capped at 8 rows
per signal and signals per space are bounded (~18), so this is tens of indexed
reads. If it ever gets hot, denormalize into a `taste_signal_regions` table
maintained on evidence insert.

### Both call sites must filter, or this is theatre

1. **`get_taste_for_task`** — [worker/mcp.ts](../../worker/mcp.ts). Filter the
   `signals` list. Existing behaviour to keep: `grounded_in` is already
   permission-filtered, and only `confirmed` signals carry it.

2. **`retrieve()`** — [worker/retrieval.ts](../../worker/retrieval.ts). The
   `confirmed` array feeding `tasteRelevanceFor()` must get the same filter.
   **Without this, a revoked signal keeps silently boosting search results and
   still emits `taste_events` 'applied'** — the UI would say the taste is gone
   while it carries on shaping what the agent sees. `retrieve()` already computes
   `authorizedRegionIds`; reuse it.

### What must NOT be filtered

**The human's own Taste page.** `/api/taste` and
[src/routes/Taste.tsx](../../src/routes/Taste.tsx) keep showing every signal.

Revocation constrains the **agent**, not the person. A person who revokes a
folder has not forgotten their own preferences, and hiding their taste from them
would be a bug that reads as data loss. Only the agent-facing surfaces
(`get_taste_for_task`, and the retrieval boost) narrow.

### Confirmed vs proposed

Same rule for both. A human confirming a signal ratifies the *claim*, but the
claim is still a compression of the folder's material, and the demo promise is
that revoking a folder withdraws its influence. Do not special-case `confirmed`.

### Tests — `worker/taste/scope.test.ts` (new)

- signal grounded only in `inspiration` → present with the grant, absent once
  revoked
- signal grounded in `work` + `inspiration` → absent when either is revoked
  (pins `every`, not `some`)
- signal with no resolvable grounding → stays available
- **the retrieval path agrees with the tool path**: after revocation the same
  signal no longer appears in any returned item's `applied_signal_ids`, and no
  `taste_events` 'applied' row is written
- `/api/taste` still returns the signal after revocation (the human keeps it)

### Done when

Revoking a region in Agent Access removes the signals that region taught from
`get_taste_for_task` **and** stops them influencing `retrieve()`, while the
Taste page is unchanged.

---

## F2 — Wire `hasPendingProposals`

### Why

[worker/routes.ts](../../worker/routes.ts) `handleCapabilities` hardcodes
`hasPendingProposals: false`. The compiler branch that tells the agent its
submission is awaiting a person is dead code, and
`webmcp-capability-layer.md`'s verification scenario "proposal-state tools
appear and disappear with proposal lifecycle" is currently unbacked.

### Change

In `handleCapabilities`, compute it for the task's space. Pending means any of:

- a `taste_signals` row with `status = 'proposed'`
- an `edges` row with `approval_state = 'proposed'`
- an `artifact_versions` row in `ready_for_review` belonging to this task

Add one query rather than three round-trips:

```ts
// worker/db/queries.ts
/** Anything awaiting a human decision in this space. */
hasPendingProposals(spaceId: string, taskId: string): boolean
```

### Guard

This changes a **description string only**. It must not gate a tool.
`approve_proposed_changes` / `reject_proposed_changes` stay uncompiled and
server-refused (invariant #11) — the comment block in
[compiler.ts](../../src/webmcp/compiler.ts) explains why; leave it in place.

### Tests

- `evals/surface.test.ts`: with a pending proposal, `get_current_context_scope`'s
  description contains "awaiting human review"; without one, it does not
- neither state changes the set of compiled tool **names**

### Done when

Submitting a proposal changes what the agent is told on the next capability
refresh, and changes nothing about what it can do.

---

## F3 — Workers AI in the quota model

### Why

[worker/quota.ts](../../worker/quota.ts) still opens with "the whole deployment
costs $0". That predates the vision model. `@cf/meta/llama-3.2-11b-vision-instruct`
runs on every image capture and in the backfill loop, is the only real Workers AI
spend, and appears in no counter.

`BACKFILL_BATCH = 4` bounds it per alarm but nothing bounds it per month.

### Change

1. Add a `vision_calls` metric to `QUOTA`. Size it against the free Neuron
   allowance — **measure one real call's Neuron cost in the Cloudflare dashboard
   first and put the number in the header comment.** Do not guess it.
2. Consume it in both callers of `extractDesignProfile`:
   - the capture path in `handleItems` POST
   - `backfillSpaceDesign` in [worker/design.ts](../../worker/design.ts)
3. Over budget → skip extraction, leave the item without a profile. This path is
   already best-effort, so it degrades correctly with no new branch.
4. Correct the header comment. It currently states something untrue.

### Guard

A quota refusal must never fail a capture. The person's item still saves; it just
has no design profile yet.

### Tests

- extraction is skipped, and the item still created, when over budget
- a successful extraction increments the counter exactly once

---

## F4 — Run the model evals

### Why

[evals/cases.json](../../evals/cases.json) holds 8 cases and has never been
executed against a live session. Two are negative (`no self-approval`,
`revoked region is not retrievable`) where the correct behaviour is to call
nothing and explain. Shipping evals a judge can run and fail is worse than not
shipping them.

### Steps

1. `bun run dev`, sign in, create a task, grant **Work** and **Inspiration** at
   `read`, open one artifact in the Workbench.
2. Point the [WebMCP Evals CLI](https://github.com/GoogleChromeLabs/webmcp-tools)
   at the page, feed it `cases.json`.
3. Run `revoked region is not retrievable` separately with **Personal** at
   `none`, as the README already says.
4. Record pass/fail per case in `evals/README.md` with the date and model used.

### Then fix the cases, not the product

Three of the eight predate this pass and reference a surface that changed:

- anything expecting `inspect_relationships` — folded into
  `inspect_context_item`, which now returns `related[]`
- anything expecting `record_feedback` or `propose_context_change` — both removed
- add a case for `withdraw_artifact` and one for `remove_context_item` refusing a
  human-authored item

A case that fails because the tool surface deliberately changed is a stale case.
A case that fails because the agent picked the wrong tool is a real finding —
report it, don't quietly delete it.

### Done when

`evals/README.md` records a dated run of all 8 (plus the 2 new) cases with an
explicit result for each.

---

## Suggested order

F1 → F2 → F3 → F4. F1 is the demo beat and touches retrieval; do it while that
code is fresh. F4 last so it runs against the finished surface.
