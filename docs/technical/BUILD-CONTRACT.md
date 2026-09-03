# Build contract — frozen

This document, `shared/contract.ts`, and `worker/db/schema.sql` are the frozen contract for the WebMCP Challenge build. Every track compiles against them.

**No track may edit the contract.** If something appears wrong or missing, stop and report the drift to the integrating agent. Do not work around it locally, do not add a parallel type, do not widen a type to `any`.

## Why this exists

This build has been restarted several times. The restarts, not the scope, were the problem. A frozen contract means three tracks can run in parallel without converging on incompatible assumptions, and means a lost session can be resumed from disk rather than from memory.

## Track ownership

| Track | Owns | Must never touch |
|---|---|---|
| **A — Worker / data** | `worker/**` | `src/**` |
| **B — WebMCP client layer** | `src/webmcp/**` | `worker/**`, `src/ui/**`, `src/routes/**` |
| **C — UI / design** | `src/ui/**`, `src/routes/**` | `worker/**`, `src/webmcp/**` |

The integrating agent owns `shared/**`, `index.html`, `main.tsx`, all config files, and every merge.

Both tracks import shared types as `import type { ... } from "@shared/contract"`.

## Invariants that are not negotiable

These come from `docs/technical/webmcp-capability-layer.md` and the frozen contract. Violating one breaks the submission's central claim.

1. **Effective authority is an intersection.**
   `human access ∩ agent grant ∩ task scope ∩ page state ∩ runtime policy`.
   No cached schema, stale call, or interface state may widen it.

2. **The server is the authority.** The client-side tool schema is a hint for the agent. Every `execute()` re-checks grant, expiry and revocation server-side. A call that was legal one second ago and illegal now must fail now.

3. **Permission filters, it does not rank.** Inaccessible items are absent from retrieval candidates, never present with a low score.

4. **The graph does not leak.** Access is re-checked at every node of a traversal. An accessible edge must not reveal an inaccessible node — its title, its existence, or its count.

5. **Three provenance types stay separate.** `influences` ("used these references"), `accesses` ("accessed for this task"), `denials` ("unavailable or denied", Agent Lens only). Never merge them.

6. **Artifacts are immutable per version.** A revision is a new row with a `parent_version_id`, never an edit.

7. **No acceptance is inferred from silence.** A proposed taste signal stays proposed until a human acts on it.

8. **Prefer unregistering over an always-failing shell.** If no meaningful operation remains for a tool, remove it.

9. **Declared agent identity never authorizes.** It is attribution only, and it is spoofable.

10. **Revocation prevents future access.** It does not claim a model has forgotten what it already received. Never write copy that says otherwise.

11. **Approval is never an agent capability.** `approve_proposed_changes` and
    `reject_proposed_changes` are never compiled into the tool surface at any grant
    level, and the server refuses them by name. Both enforcement points agree on
    purpose.

    Acceptance is the moment a proposal becomes canonical human context. If an agent
    could call it, `propose` would collapse into `write` with an extra step. We cannot
    distinguish "the person asked the agent to approve this" from "the agent decided to
    approve this" across the WebMCP boundary, so we do not offer the capability. Approval
    happens through the human review controls, which post to `/api/decisions`.

    Do not "fix" this by adding the tools back. It is deliberate, and it is tested.

## WebMCP API notes (verified against Chrome docs, Aug 2026)

- The object is **`document.modelContext`**. `navigator.modelContext` is deprecated as of Chrome 150; feature-detect and prefer `document`.
- `registerTool({ name, description, inputSchema, execute }, { signal })` — `execute` returns a **string**.
- Unregister by aborting the `AbortController` whose signal was passed at registration.
- `document.modelContext.addEventListener("toolchange", ...)` fires on tool list changes.
- `getTools()` / `executeTool(tool, jsonString)` are used by Agent Lens to inspect and to drive the deterministic demo take.
- Local testing: `chrome://flags/#enable-webmcp-testing`, or the ChatGPT desktop app browser, which works without a flag.

## Language rules for UI copy

Use: Space, Region, Item, Project, Task, Artifact, Annotation, Taste, Agent Access. Use "Can view" / "Can suggest changes" / "Can edit directly" / "For this task".

Never surface in ordinary UI: ContextEdge, authority class, embedding, capability compiler, schema enum, semantic representation. Those words belong in Agent Lens at most.

## Definition of done for any track

`bun run build`, `bun run lint` AND `bun test` all clean before handing work back.
No `any`, no `@ts-expect-error`, no TODO stubs in a path the demo walks through.

`bun test` is not optional and must be run with no path argument. A change that
ran `bun test src worker` reported 120 pass / 0 fail while silently leaving six
red assertions in `evals/` — including the one pinning the region-enum schema,
the central WebMCP claim. Scoping the suite hid a regression in the product's
own thesis for two days. Run the whole suite.
