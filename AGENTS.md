# GoToTheArchive agent guide

This repository is the clean planning and implementation workspace for GoToTheArchive.

## Critical repository rule

The existing `webmcp/` directory is an abandoned attempt. Do not inspect it, derive architecture or design from it, copy it, repair it, or treat it as a source of truth unless the user explicitly reverses this instruction.

Do not assume a framework, package manager, deployment configuration, or code architecture from that directory.

## Current phase

**Implementation is underway**, targeting the OpenAI WebMCP Challenge deadline of
September 3, 2026, 1:00pm PDT.

Before changing code, read [`docs/technical/BUILD-CONTRACT.md`](docs/technical/BUILD-CONTRACT.md).
It is the frozen contract, alongside `shared/contract.ts` and `worker/db/schema.sql`.
No agent may edit those three files unilaterally — report drift instead of working
around it.

Current pass ships **Archive, Workbench, and Taste**, plus the Agent Access panel and
Agent Lens. Sharing and Inbox are deferred to v2; the human-access half of the
permission model is still built, because agent authority is bounded by it.

Standing rules:

- Read the relevant focused documents before changing code.
- Do not relitigate the locked scope. It was decided deliberately, not by attrition.
- Keep the ordinary product human-first and the hackathon story WebMCP-forward.
- Treat permission, provenance, annotation, and taste behavior as real product state—not mock interface theater.

## Documentation map

Start at [`docs/README.md`](docs/README.md). The set is deliberately small:

- [`docs/technical/BUILD-CONTRACT.md`](docs/technical/BUILD-CONTRACT.md) — frozen invariants.
- [`docs/technical/webmcp-capability-layer.md`](docs/technical/webmcp-capability-layer.md) — dynamic tools and schemas, enforcement, Agent Lens.
- [`docs/technical/architecture.md`](docs/technical/architecture.md) — Cloudflare-native shape, storage, jobs, safety.
- [`docs/roadmap/judge-demo-access.md`](docs/roadmap/judge-demo-access.md) — the shared no-account demo and its isolation invariant.
- [`docs/judges.md`](docs/judges.md) — judge-facing orientation.

Product and design intent that used to live under `docs/product/` and
`docs/design/` was removed; the behavior is the code, the invariants are in
BUILD-CONTRACT.md, and the pitch is the Devpost writeup.

## Source-of-truth order

When guidance conflicts:

1. The user's most recent explicit request.
2. This `AGENTS.md`.
3. The focused document for the concern being changed.
4. `docs/README.md`.
5. Earlier product material or planning discussions.

Update the focused document whenever a product decision changes. Keep documents modular; do not consolidate everything into one giant PRD.

## Settled product decisions

- Audience: broad knowledge workers.
- Product: a general platform, not a simple hackathon MVP.
- Primary destinations: Archive, Workbench, Shared, Taste, Inbox.
- Agent Access is a persistent contextual panel, not another destination.
- Agent Lens is an optional technical layer within Agent Access, not a separate agent-facing application.
- Workbench supports PDF, presentation, code, webpage/component, and image artifacts in the first pass.
- Review decisions: Approve, Approve with notes, Request changes, Reject.
- Sharing is included for spaces/regions/projects and individual artifact review.
- Human roles and agent grants are separate permission systems.
- Personal taste is private by default; project/shared taste requires explicit scope.
- Context graphs, continual learning, and taste intelligence mostly operate under the hood.
- WebMCP is visibly foregrounded for the hackathon but does not define the ordinary product aesthetic.
- Voice ingestion, Pinterest-native integration, Chrome extension, public community, broad connectors, visible graph UI, generic chat, arbitrary code execution, and dark mode are deferred.

## Design Context

### Users

Broad knowledge workers who collect context and produce or review documents, presentations, research, software, webpages, visual work, and project artifacts. They may collaborate with people and multiple agent clients. Most should not need to understand MCP, schemas, embeddings, or graph terminology.

Their core jobs are to curate useful context, grant an agent the right temporary access, inspect returned work, collaborate on review, and improve later results through explicit feedback.

### Brand Personality

Personal, cultivated, calm, expressive, trustworthy, and quietly alive. The product should feel like a thoughtful archive and working desk—not a security console, enterprise dashboard, generic AI product, or database admin interface.

### Aesthetic Direction

A calm dark editorial workspace. Warm near-black grounds, ink-on-dark typography, one precise accent (a warm red), small even type, large negative space, asymmetric composition, hairline rules, and media-led colour. The archived material is the loud thing; the interface stays quiet. Not a security console, enterprise dashboard, generic AI product, or database admin tool.

### Design Principles

1. The user's material is the protagonist.
2. Use editorial hierarchy and whitespace instead of dashboard cards.
3. Keep agent power visible in human language; disclose technical detail on demand.
4. Make artifacts—not chat—the center of human-agent collaboration.
5. Preserve provenance, ownership, scope, and reversibility in every important state.
6. Use motion to explain state changes, never to delay work.
7. Make spatial and visual workflows fully accessible through structured equivalents.

## Product invariants

- Human-visible grants and agent-visible capabilities use the same authoritative state.
- Runtime authorization re-checks every agent operation.
- Agent authority cannot exceed the invoking human's access.
- Permissions filter retrieval before ranking; inaccessible data is never a low-ranked candidate.
- Graph relationships do not confer access.
- Agent artifacts and inferences are not canonical human context without approval.
- Accessed context and influential context are distinct provenance records.
- Taste proposals cite evidence and do not become confirmed through silence.
- Shared projects do not expose private global taste.
- Artifact rendering treats content as untrusted and separates viewing from execution.
- Revocation prevents future access but does not claim to erase model memory.

## Writing and UX language

Prefer human-facing terms from the information architecture: Space, Region, Item, Project, Task, Artifact, Annotation, Taste, and Agent Access.

Avoid exposing internal terms such as ContextEdge, authority class, embedding, capability compiler, schema enum, or semantic representation in ordinary UI copy.

Prefer:

- “Can view.”
- “Can suggest changes.”
- “Can edit directly.”
- “For this task.”
- “Used to make this.”
- “Archive noticed a possible preference.”

## Implementation expectations

- Favor a coherent platform slice across all central systems over many shallow integrations.
- Build reusable artifact-viewer and annotation-target adapters.
- Keep canonical originals distinct from derived text, captions, embeddings, and summaries.
- Preserve stable IDs, versioning, attribution, audit events, and undo paths early.
- Treat empty, loading, processing, denied, expired, failed, success, and recovery states as part of each feature.
- Meet WCAG AA at minimum and support keyboard-only artifact review and grant management.
- Avoid generic AI visual patterns: cyan/purple glow, gradient text, glass cards, uniform dashboard grids, and permanent chat chrome.
- Do not add dependencies or infrastructure merely because they were mentioned as future possibilities.

## Documentation maintenance

Keep the doc set small. Update BUILD-CONTRACT.md when an invariant changes,
webmcp-capability-layer.md when the WebMCP behavior changes, architecture.md
when storage or services change, and judge-demo-access.md when the demo's
access model changes. Do not add product-spec documents back.
