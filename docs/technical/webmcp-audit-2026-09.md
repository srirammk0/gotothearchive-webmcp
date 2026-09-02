# WebMCP audit — 2026-09-01

Run alongside the Supermemory retrieval-augmentation work. Scope: the whole
browser capability layer (`src/webmcp/*`) plus the worker MCP paths
(`worker/mcp.ts`, `worker/routes.ts` MCP handlers), against the real
DO-SQLite + Supermemory-augmented backend.

**Result: no code defects found in the WebMCP layer. No fixes applied.**

## What was checked

| Area | Finding |
|---|---|
| `compiler.ts` — `task: null` | `compile()` never reads `input.task` / `input.scope`. When the task is not live, `handleCapabilities` sends `task: null` and `liveGrants` returns `[]`, so `effectiveRegions` collapses every region to `none` and only `identify_agent` compiles. Correct — a dead task leaves the agent no surface. |
| `compiler.ts` — project scope | The compiler lists every *readable* region in each tool's `enum`, not the project-scoped subset. This is deliberate: the compiler is a hint surface, and the worker (`retrieve()` → `authorizedItemIds`, `get_current_context_scope` → `projectRegionIds`) enforces project scope on every call. An agent naming an in-region-but-out-of-project region gets an `OUT_OF_PROJECT_SCOPE` denial that is written to the ledger — honest, not silent. |
| `registrar.ts` — `sameMaterialSpec` | A `why`-only change re-registers the browser tool (abort + `registerTool`). `why` is not part of the `registerTool` payload, so this is a small internal churn, not a browser-visible one. `lens.recordCapabilityChange` diffs by **name**, so a tool that stays present produces no spurious timeline event. Acceptable. |
| `registrar.ts` — executor swap | After a non-material update, `entry.spec` / `entry.execute` are refreshed and the live `execute` closure reads `current.spec` / `current.execute` from the map. A stale closure cannot call an unregistered tool (guarded → "not currently registered" string). Correct. |
| `transport.ts` — auth | Now sends `authHeader()` (Bearer) + `credentials: "same-origin"`. The committed version relied on the implicit same-origin `__session` cookie (`resolveHuman` accepts it), so this is a robustness upgrade (works cross-origin too), not a closed hole. Abort mapping and `isUnknownTool` (404 / `UNKNOWN_REGION`) → "not currently registered" are sound. Denials still routed to `recordDenial` → Lens. |
| `useCapabilities.ts` | Auth header on the capabilities fetch; `{ ok, capabilities }` envelope unwrapped correctly; a fetch failure sets `error` rather than compiling an empty state (which would fake "agent lost access"); `taskId: null` clears the surface. |
| `session.ts` | Session id is server-minted; client cannot name its own session. `authHeader()` present. Declared identity is attribution-only. |
| `worker/mcp.ts` | Every tool re-resolves session → task → human and gates on `taskIsLive`. Cross-space guards (`item.space_id !== task.space_id`) on every item lookup. `OUT_OF_PROJECT_SCOPE` denials written for `read_full_item`, `trace_artifact_influences`, `record_artifact` claimed influences, and `link_context_items`. |
| New Supermemory surface | `get_context_for_task` returns only `{ id, region, title, why }` to the agent — `RetrievalSignals` (incl. the new `ranks.semantic`) is never sent over the wire. `why` gains "a semantic match" / "a top semantic match" when list D contributed. Every returned item still gets one `accesses` row (batched `insertAccesses` in `retrieve()`), including Supermemory-only hits that survive the permission filter — audit trail stays complete. |

## Out of scope (noted, not fixed)

The annotation **taste-dimension** path: the manual `DimensionTags` UI was removed
from `ArtifactViewer` / `AnnotationRail`, and the server-side replacement
`worker/taste/classifier.ts` is not wired into `handleAnnotations` or
`deriveTasteSignals`. Net effect: human annotations are created with
`dimensions: []`, and `deriveTasteSignals` groups by dimension, so no taste
signals are derived from human feedback. This is a pre-existing regression in the
projects changeset, unrelated to WebMCP, and was not in this plan's scope.
