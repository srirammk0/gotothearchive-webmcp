# WebMCP + retrieval audit — 2026-09-02

Supersedes the 2026-09-01 audit, which concluded "no code defects found in the
WebMCP layer". That was wrong by the time it was written: the regressions below
landed hours earlier and its own verification command could not see them.

## What was actually broken

| Area | Finding | State |
|---|---|---|
| `compiler.ts` region enums | Commit `d4d788e` ("leaner tool schemas") removed `region: { enum: slugs }` from all 7 tools, to save ~250 tokens. That enum IS the rubric claim "dynamic schemas reflecting permitted regions", and it is how an agent learns which slugs are legal — without it, it guesses, and a wrong guess costs a denial round-trip far larger than the enum. | **Fixed** |
| `trace_artifact_influences` | Same commit un-gated it from `pageState.activeArtifactId`, leaving an always-failing shell when nothing is open (violates invariant #8). | **Fixed** |
| `evals/surface.test.ts` | Six red assertions, unnoticed because the definition of done was `build` + `lint` and the commit ran `bun test src worker`, which excludes `evals/`. `compiler.test.ts` had additionally been rewritten to *assert* the regression. | **Fixed**; `bun test` is now a script and part of the definition of done |
| `get_context_for_task` | Returned `{id, region, title, why}` — no text at all. The agent got titles and had to make a second call per row to read anything. It didn't, so it designed from titles. | **Fixed**: rows carry an excerpt and the design profile; `MAX_TEXT` 240 → 600 |
| Supermemory | An 800ms blocking network call inside `retrieve()`, ~1,700 LOC of adapter/outbox/drain, a table, an alarm branch, two routes and a UI dot — for one of four candidate lists, with the permission filter applied *after* external hits returned. | **Removed** |
| Taste loop | `derive.ts` required two annotations sharing a (dimension, sentiment); the dimension classifier ran keyword-only and returned `[]` on no match, so those annotations joined no group and were dropped forever. Net: no signal could ever be derived. | **Fixed**: threshold 1, catch-all dimension |
| `propose_taste_signal` | Returned `EXCEEDS_HUMAN` ("the invoking person does not have this access themselves") for malformed input, and stored agent proposals as `created_by: "system"`. | **Fixed**: `MISSING_INPUT` / `NO_USABLE_EVIDENCE`, and `created_by: "agent"` |
| `record_feedback` | Wrote annotations authored `agent:<session>`, which taste derivation excludes at two boundaries. Wrote rows nothing read, and polluted the human's feedback rail. | **Removed** |

## Tool surface: 12 → 9

Cut: `inspect_relationships` (folded into `inspect_context_item` as `related[]` —
an agent that has just looked something up does not know to then ask what it
connects to, so it is handed over unprompted), `record_feedback` (above),
`propose_context_change` (never called, not in the demo path).

Unchanged: `approve_proposed_changes` / `reject_proposed_changes` are still never
compiled and still refused by name (invariant #11).

## Design extraction

An archive of design references was storing a title and one prose caption
sentence per image, which is why agent output did not resemble the archive.
Images now carry a structured `DesignProfile` in `metadata.design`.

Split by provenance, and the split is load-bearing:

- **Colour is measured**, never estimated. `src/ui/archive/palette.ts` quantizes
  the real pixels in the browser (the Worker has no image decoder). Verified
  against the actual archive: it returns `#F5EBDE` / `#E4753F` / `#2149AC` for
  the cream-ultramarine-orange poster, exactly right.
  Asked for the same image's colours, the vision model answered `#2ECC40` green.
  Model colour estimates are therefore refused outright rather than stored —
  they would poison hue-bucket graph edges and the palette an agent builds from.
- **Everything else is judged** by `@cf/meta/llama-3.2-11b-vision-instruct`
  against closed vocabularies, and `coerceDesign()` validates every field so an
  invented word can never reach storage.

### Measured reliability of the model half

Run against the real archive, not assumed:

- Good: `typography.note` ("high-contrast condensed caps"), `case`, `texture`.
- Adjacent-but-wrong: `classification` (said `transitional_serif` for a Didone,
  `slab_serif` on another run of the same image).
- Unreliable: `layout.composition` and `imagery.treatment` — it answers
  `type_only` / `none` on images that plainly contain photographs.

Roughly one call in three returns brace-less `"key": value` lines instead of
JSON. The content is as good as a well-formed reply, so those are parsed rather
than discarded (`parseKeyValueLines`).

Two vision calls per image became one: `worker/vision.ts` (prose captioning) was
deleted, and `designSummary()` folds the profile back into `semantic_text` so FTS
still reaches an item by words like "halftone" or "condensed serif".

## Known gaps, deliberately not closed

- **Local embeddings.** `RetrievalSignals.ranks.semantic` is present and always
  `null`. FTS + graph + the design summary carry retrieval today. The scaffolding
  is in place for a `bge-small` column and in-JS cosine over the
  already-permission-filtered candidate set — no Vectorize needed at this scale.
- **PDF design extraction.** Two 36-page PDFs in the archive stay text-only;
  rasterizing pages in a Worker is not a small change.
- **Composition and imagery accuracy.** See above. The values are stored and
  labelled as a model reading; the panel in the UI shows the person what the
  agent was told, so a wrong value is visible rather than mysterious.
- **`pageState.hasPendingProposals`** is still hardcoded `false` in
  `handleCapabilities`, so that compiler branch is dead.
- **Sharing.** `humanRegions()` grants the owner `write` and everyone else
  `none`. There is no multi-person Archive; do not pitch one.
- **Workers AI cost.** The vision model is the only real Workers AI expense and
  is not represented in `QUOTA`. Bounded per alarm (`BACKFILL_BATCH = 4`) but not
  per month. Measure against the free neuron allowance before opening the beta.
