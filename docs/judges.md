# For the judges

Thanks for taking the time. This page is the whole orientation — one space,
one flow to walk, and the one moment that is the point of the project.

## What you're looking at

Your demo link drops you into your **own** Space after a normal sign-in. It is
a `kind: 'guest'` Space, seeded with a copy of a designer's archive:

- **Inspiration** — seven images. Four riso-style posters that share a
  signature (warm paper ground, one saturated ink, halftone, hero display
  caps) and three frames of a monochrome apparel identity. Each carries a real
  design profile: the palettes are genuinely measured from the pixels; the
  typography / layout / mood fields were judged once by a model and frozen, so
  every judge sees the same archive. Nothing is extracted at boot.
- **Work** — two short text items: a creative brief and a page of landing-page
  copy.
- **Personal** — one item, a flat-move checklist. This is the region you never
  grant. It is there so the agent always has something it is genuinely refused.

It is seeded demo material, not a real person's archive. It is yours to break —
grant, revoke, annotate, delete, whatever you like. If you want a clean slate,
open your demo link again with `&reset=1` on the end; it re-seeds the Space
from scratch. (Nothing you do touches anyone else's data — every guest Space is
separate, and guests are exempt from the beta member cap and metered on a
smaller, separate quota.)

## The flow to walk

1. **Grant.** Give the agent access to **Work** and **Inspiration** for the
   open task. Leave **Personal** alone.
2. **Retrieve.** Ask the agent to pull references for the brief. Watch what
   comes back — Personal items are simply absent from the candidates, not
   ranked low. Permission filters; it does not rank.
3. **Artifact.** Have the agent produce a draft (a landing page / poster
   treatment) grounded in what it retrieved.
4. **Annotate.** Leave a note or two on the draft — "more like the riso
   posters", "lose the photo".
5. **Taste.** A taste signal is derived from your annotations. It is grounded
   only in Inspiration. It stays *proposed* until you act on it — silence is
   never acceptance.
6. **Revoke — the point of the project.** Revoke **Inspiration**. Then:
   - the tool surface changes under the agent: capabilities that depended on
     that access are **unregistered**, not left as always-failing shells;
   - a call the agent had queued against the now-revoked access is **refused
     server-side** — the schema it still holds is a stale hint, and the server
     re-checks grant, expiry and revocation on every call;
   - the taste signal that was grounded in Inspiration is no longer applied.

Revocation prevents *future* access. It does not claim the model has forgotten
what it already saw — and nothing in the UI says otherwise.

## If something is off

The demo link is time-limited. If it has expired, or the Space won't load, ask
us for a fresh one — it is a one-command regenerate on our side.
