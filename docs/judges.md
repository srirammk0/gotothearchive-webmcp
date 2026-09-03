# For the judges

Thanks for taking the time. This page is the whole orientation — one shared
archive, one flow to walk, and the one moment that is the point of the project.

## What you're looking at

Opening the site drops you straight into the demo Archive — no account, no
sign-in. It is a single `kind: 'guest'` Space that **every judge shares**, seeded
with a copy of a real design-reference folder:

- **Inspiration** — eighteen items lifted from the author's own Design region:
  eleven captured images (product and landing-page work, hero concepts, a few
  looser visual references) and seven links to the posts they were collected
  from. Every image carries a real design profile — the palette measured from
  its own pixels at capture time, the typography / layout / mood judged by the
  vision model then and frozen since. Nothing is extracted at boot, so every
  judge sees the identical archive.
- **Work** — two short text items: a creative brief and a page of landing-page
  copy.
- **Personal** — one item, a flat-move checklist. This is the region you never
  grant. It is there so the agent always has something it is genuinely refused.

To be exact about what this is: the Inspiration items are genuine — real rows
from the author's archive, with the profiles the product itself produced, which
is the point (a demo built from hand-written fixtures would prove nothing about
the extraction path). The Work and Personal items are written for the demo. The
author's actual Personal region holds personal documents and none of it is here.

### You are sharing this with the other judges

One archive, several visitors. That is deliberate — it is how two agents can work
the same archive at once, each bounded by its own grant. What it means in
practice:

- **Items are shared.** If another judge adds, moves, or deletes an item, you
  see it. If the archive ever looks empty, reopen your demo link — the next
  entry re-seeds it.
- **Your task, grants, artifacts, and denials are yours.** They are keyed to
  your own session. Your agent's access is exactly what *you* granted *your*
  task; another judge revoking a region on their task does not touch yours.
- **Taste signals are shared** (they belong to the archive, not the task), so a
  signal another judge confirms can show up in your agent's retrieval.

Nothing here touches a real member's data — the demo Archive is completely
separate, exempt from the beta member cap, and metered on its own small quota.

## The flow to walk

1. **Grant.** Give the agent access to **Work** and **Inspiration** for your
   open task. Leave **Personal** alone.
2. **Retrieve.** Ask the agent to pull references for the brief. Watch what
   comes back — Personal items are simply absent from the candidates, not
   ranked low. Permission filters; it does not rank.
3. **Artifact.** Have the agent produce a draft (a landing page / poster
   treatment) grounded in what it retrieved.
4. **Annotate.** Leave a note or two on the draft — "more like the minimal
   hero shots", "lose the photo".
5. **Taste.** A taste signal is derived from your annotations. It is grounded
   only in Inspiration. It stays *proposed* until you act on it — silence is
   never acceptance.
6. **Revoke — the point of the project.** Revoke **Inspiration** on your task.
   Then:
   - the tool surface changes under the agent: capabilities that depended on
     that access are **unregistered**, not left as always-failing shells;
   - a call the agent had queued against the now-revoked access is **refused
     server-side** — the schema it still holds is a stale hint, and the server
     re-checks grant, expiry and revocation on every call;
   - the taste signal that was grounded in Inspiration is no longer applied.

Revocation prevents *future* access. It does not claim the model has forgotten
what it already saw — and nothing in the UI says otherwise.

## If something is off

The demo session lasts 24 hours. If it expires, reload the site for a fresh
one. A reload also re-seeds the shared Archive if another visitor has emptied it.
