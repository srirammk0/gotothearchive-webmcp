# Retrieval & continual taste — architecture

Status: proposed 2026-08-31. Supersedes the stub in `worker/retrieval.ts`.
Companion to [taste-learning.md](./taste-learning.md).

## 0. What we looked at

**Cloudflare AI Search** (formerly AutoRAG, still open beta Aug 2026). Managed RAG:
data source → chunk → embed (Workers AI) → **Vectorize** index → hybrid search →
optional `@cf/baai/bge-reranker-base` rerank → optional generation. Worker binding
`ai_search_namespaces` with `create()/search()`.

Rejected for our use, three hard reasons:

1. **Data sources are R2 buckets, direct file uploads, or crawled websites — not a
   database.** Our context lives as structured rows in DO SQLite (regions,
   authority classes, edges, notes). We would have to serialise every item to R2
   on every mutation and wait for a sync cycle.
2. **It cannot express our permission model.** Effective authority is
   `human ∩ grant ∩ task`, computed per call, re-checked at every graph hop, with
   a `denials` + `audit_events` row on every refusal. AI Search offers static
   per-query metadata filters. Pushing the crown-jewel security model into a
   managed black box guts the submission thesis ("flip a lock → agent calls fail
   at runtime").
3. **It reintroduces Vectorize** (cut from locked scope) and adds async index lag
   to a live demo, 3 days from the deadline.

What we keep from it: the **pipeline shape** (find candidates several ways → merge
into one ranked list → optionally re-order the top slice).

**Cost rule:** this rebuild must not add a Cloudflare bill. No Workers AI, no
Vectorize, no embeddings in the request path. Everything runs in the Durable
Object's SQLite. "Semantic" here means good full-text matching + the relationship
graph + learned taste, not a vector model.

**pgGraph** (Postgres extension, Rust/pgrx). CSR adjacency compiled from relational
tables; bounded traversal with explicit circuit breakers (depth, frontier, visited,
OOM). Not deployable on Workers. We already have the pattern in `worker/graph.ts`
(`GRAPH_MAX_DEPTH/FANOUT/NODES`). No change needed for demo scale.

**Utopia** (Rust + Postgres + pgvector + Tantivy). This is the model we borrow from:

- Hybrid retrieval = full-text **⊕ vector, fused with RRF** (reciprocal rank
  fusion). No signal-weight tuning.
- **Bitemporal facts**: every fact carries a validity interval + evidence rows; a
  correction closes the old fact and links the new one to it (`supersedes`).
- **Confidence is derived from evidence**, never a literal.
- **Ontology grows from usage**: unknown types are recorded and counted; frequent
  ones are proposed to a human and merged on confirmation.
- **Review queue**: low-confidence derivations are proposed, never applied.
- Tokenise the query with the *same* analyzer used to build the index.

## 1. Current state (what's broken)

| Piece | State |
|---|---|
| FTS candidate gen | **Dead.** `queries.ts` writes `items_fts(rowid=rowidFor(id))` (a 63-bit hash) but `searchItems()` joins `items ON items.rowid = items_fts.rowid` — SQLite's implicit sequential rowid. Never matches. Zero FTS hits, always. |
| `taste_relevance` | Hardcoded `0.5` (`retrieval.ts:67`). Taste has zero effect on retrieval. |
| Taste learning loop | Not wired. Signals come from seed or manual "Add signal". Nothing derives a signal from annotations. `confidence` is a literal. `taste_events` 'applied' is seeded, never emitted by the retrieval path. |
| recency / curation / authority | Work. |
| Permission pre-filter | Works, tested, well-built. **Do not touch.** |

## 2. Target architecture

```
get_context_for_task
        │
        ▼
authorizedRegionIds(task)  ──────────────►  HARD PRE-FILTER  (unchanged)
        │                                   inaccessible items never enter the set
        ▼
candidate generation  (all scoped to allowed regions)
   ├── FTS      : items_fts MATCH,  top K          ── rank list A
   ├── recency  : updated_at desc,  top K          ── rank list B
   └── graph    : traverse(seeds = A∪B, allowedIds) ── rank list C  (ordered by decayed edge weight)
        │
        ▼
merge with reciprocal rank fusion:  fused(item) = Σ_lists 1 / (60 + rank_in_list)
        │                            an item in several lists beats one that only
        │                            topped a single list. No weights to tune.
        ▼
apply priors (multipliers, not lists):
   × authority_weight   static per authority_class (unchanged)
   × curation           human_authored / human_confirmed_preference → 1, else 0.7 (unchanged)
   × (1 + taste_relevance)   see §2.1
        ▼
top N  →  emit taste_events 'applied' for a confirmed signal that materially moved a returned item
       →  why(): which lists it placed in + which signals lifted it + its authority class
```

Nothing here calls out of the Durable Object. FTS, recency, and graph are all
SQLite reads; taste matching is string work in JS. Cost added: zero.

### 2.1 taste_relevance — real, and free

For each returned item, against the confirmed taste signals whose scope fits the
task's space:

```
taste_relevance = max over signals of
    signalConfidence
  · authorityOrderWeight(signal)          // taste-learning.md §Authority order: personal < project
  · overlap(signal, item)

overlap(signal, item) =
    0.5 · (shared dimension tokens between signal.dimensions and item.metadata.dimensions or item.type)
  + 0.5 · (Jaccard of content words: signal.statement  vs  item.title + item.semantic_text + notes)
```

Clamped to `[0, 1.5]`. `0` when no confirmed signal is in scope — taste stays
silent rather than inventing a boost. A signal that pushes an item's
`taste_relevance` past `~0.15` and that item lands in the top N counts as
"applied" and gets a `taste_events` row.

`ponytail: word-overlap match, not a learned similarity; revisit only if a
space's taste set gets big enough that lexical overlap misfires.`

### 2.2 retrieve() stays synchronous

No external calls, so `retrieve()` does not need to become `async`. Its caller
`handleToolCall` is already `async`; leave the call site as-is.

## 3. Continual taste — closing the loop

The loop from `taste-learning.md` §"Continual learning loop", wired end to end.

### 3.1 Derivation (the missing step 5)

New `worker/taste/derive.ts`, `deriveTasteSignals(q, spaceId, now)`, called after
every annotation write and every artifact decision:

1. Read `open` annotations across the space's artifact versions.
2. Group by `(dimension, sentiment)`.
3. A group is a **candidate** when: ≥ 2 supporting annotations, spanning ≥ 1
   artifact, and no `confirmed` signal already contradicts it.
4. Statement text: a template built from the shared dimension, the dominant
   sentiment, and the most common content words across the grouped comments
   (`"For {dimension} on {artifact-kind}, leans {toward/away from} {phrase} —
   from {n} notes on {m} artifacts"`). No model call. Must satisfy the doc's
   proposal-quality rules: names the context, cites the annotations, no universal
   claim from one example. A human edits the wording before confirming anyway.
5. Insert `taste_signals` (`status='proposed'`, `created_by='system'`),
   `taste_evidence` rows linking each annotation, `taste_events` 'proposed'.
6. Never auto-confirm. No acceptance inferred from silence.

### 3.2 Confidence, derived

`confidence = clamp( (sup − 0.5·con) / (sup + con + 2), 0.05, 0.98 )`
where `sup` / `con` = count of supporting / contradicting `taste_evidence`.
Recomputed whenever evidence changes. UI renders it in words
(`< 0.4` tentative, `< 0.7` growing, else well-supported) per the doc.

### 3.3 Bitemporal correction

Add one column: `taste_signals.supersedes TEXT`. When a human edits a signal into a
materially different claim, or the system proposes a replacement: old row →
`status='superseded'`, new row → `supersedes = old.id`, `taste_events` 'superseded'.
Retrieval reads only `confirmed`. The Taste UI walks the `supersedes` chain for the
"how this judgement changed" timeline. The "world time" axis is `taste_events.at`.

### 3.4 Applied path

`get_taste_for_task` already returns confirmed + proposed signals. Add: when
`retrieve()` computes a `taste_multiplier > 1.15` for an item that lands in the
returned top N, emit `taste_events` 'applied' (`actor_type='agent'`,
`agent_session_id`). This is the real "signal shaped this work" record; today only
the seeded rows exist.

## 4. WebMCP integration

Contract changes (`shared/contract.ts`):

- `RetrievalSignals`: keep the shape; `taste_relevance` is now real, add
  `fused_rank_lists: string[]` and `applied_signal_ids: string[]` to `RetrievedItem`.
- `get_context_for_task` result: unchanged shape, better content.
- `get_taste_for_task` result: add derived `confidence` + `confidence_label` +
  `supersedes`.
- New optional tool `explain_retrieval(item_id, query)` → the per-list ranks and
  taste contributions for one item. Read-only, permission-checked like
  `inspect_context_item`. (Cut if time is short — `why()` string covers the demo.)

No new grant levels. No change to `authorize()` / `permissions.ts`.

## 5. UI surfacing (only what the demo needs)

- **Workbench provenance strip**: show the `why()` line per retrieved reference and
  a "taste applied" chip when `applied_signal_ids` is non-empty.
- **Taste destination**: confidence in words; the supersedes timeline; a "proposed
  from your notes" badge on system-derived signals with a link to the annotations.
- **Agent Lens**: 'applied' taste events in the per-agent activity stream (the
  table already exists).

Defer anything else.

## 6. Build tracks

Claude has already landed the shared spine: `shared/contract.ts` (RetrievalSignals
reshaped, `confidenceFrom`/`confidenceLabel`, `RRF_K`, `TasteSignal.supersedes`),
`worker/db/schema.sql` (`items.fts_rowid`, `taste_signals.supersedes`),
`worker/db/queries.ts` (FTS join fixed, evidence counts, `supersedeTasteSignal`,
`confirmedTasteSignals`, `openAnnotationsForSpace`, `setTasteSignalConfidence`).

Remaining, on non-overlapping files, for parallel Sonnet subagents:

| Track | Files (exclusive) | Notes |
|---|---|---|
| **A — retrieval** | `worker/retrieval.ts`, `worker/mcp.ts` | RRF over FTS+recency+graph; real `taste_relevance` (§2.1); `applied_signal_ids` + emit `taste_events` 'applied' in mcp.ts `get_context_for_task`; rewrite `why()`. |
| **B — taste loop** | `worker/taste/derive.ts` (new), `worker/routes.ts` | `deriveTasteSignals()` (§3.1); call it after annotation write and after artifact decision; recompute confidence via `confidenceFrom` whenever evidence changes; `supersedes` on material edit in the PATCH handler. |
| **C — UI** | `src/ui/workbench/ProvenanceStrip.tsx`, `src/routes/Taste.tsx`, `src/ui/AgentAccess.tsx`, `src/ui/viewmodels.ts` | §5. Confidence in words via `confidenceLabel`. |
| **Integration** | Claude: review, wire, typecheck, deploy, verify | — |

## 7. Deploy + verify on Cloudflare

`bun run build && wrangler deploy` → `gotothearchive.<subdomain>.workers.dev`.

Verification against the deployed Worker, guest demo space:

1. A task + grant on one region. `get_context_for_task` with a keyword query →
   returns the matching item ⇒ FTS join fixed (was always empty before).
2. A query that only matches via a graph neighbour of a text hit → that neighbour
   comes back too ⇒ fusion working.
3. Annotate an artifact twice on one dimension → `GET /api/taste` shows a
   new `proposed` signal citing both annotations ⇒ derivation live.
4. Confirm it. Re-run retrieval → the matching item's rank rises,
   `applied_signal_ids` non-empty, a `taste_events` 'applied' row exists ⇒ loop
   closed.
5. Revoke the grant → `get_context_for_task` refuses (named region) / drops the
   items (unscoped) + writes a denial ⇒ permission invariant intact under the new
   pipeline.
