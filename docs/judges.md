# For the judges

Thanks for taking the time. This page is the whole orientation — one space,
one flow to walk, and the one moment that is the point of the project.

## What you're looking at

Your demo link drops you into your **own** Space after a normal sign-in. It is
a `kind: 'guest'` Space, seeded with a copy of a real design-reference folder:

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

It is yours to break — grant, revoke, annotate, delete, whatever you like. If
you want a clean slate, open your demo link again with `&reset=1` on the end; it
re-seeds the Space from scratch. (Nothing you do touches anyone else's data —
every guest Space is separate, and guests are exempt from the beta member cap
and metered on a smaller, separate quota.)

## The flow to walk

1. **Grant.** Give the agent access to **Work** and **Inspiration** for the
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
