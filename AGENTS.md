# GoToTheArchive agent guide

This repository is the clean planning and implementation workspace for GoToTheArchive.

## Critical repository rule

The existing `webmcp/` directory is an abandoned attempt. Do not inspect it, derive architecture or design from it, copy it, repair it, or treat it as a source of truth unless the user explicitly reverses this instruction.

Do not assume a framework, package manager, deployment configuration, or code architecture from that directory.

## Current phase

The product and design are documented. Application construction has not been authorized yet unless a later user request explicitly asks for it.

When implementation begins:

- Read the relevant focused documents before changing code.
- Preserve the platform scope rather than collapsing it into a narrow demo MVP.
- Keep the ordinary product human-first and the hackathon story WebMCP-forward.
- Treat permission, provenance, sharing, annotation, and taste behavior as real product state—not mock interface theater.

## Documentation map

Start at [`docs/README.md`](docs/README.md).

### Product

- [`docs/product/vision-and-principles.md`](docs/product/vision-and-principles.md) — thesis, audience, principles, positioning.
- [`docs/product/platform-scope.md`](docs/product/platform-scope.md) — current-pass inclusions and boundaries.
- [`docs/product/information-architecture.md`](docs/product/information-architecture.md) — navigation, vocabulary, hierarchy, progressive disclosure.
- [`docs/product/workbench.md`](docs/product/workbench.md) — artifact viewers, versions, annotations, decisions, rendering safety.
- [`docs/product/sharing-and-permissions.md`](docs/product/sharing-and-permissions.md) — human roles, agent grants, inheritance, privacy, audit.
- [`docs/product/taste-learning.md`](docs/product/taste-learning.md) — evidence, proposals, scope, retrieval, privacy.

### Design

- [`docs/design/visual-system.md`](docs/design/visual-system.md) — warm editorial visual and interaction system.
- [`docs/design/core-experiences.md`](docs/design/core-experiences.md) — page-level behavior and state expectations.
- [`docs/design/references/README.md`](docs/design/references/README.md) — saved original-resolution visual references.

### Technical foundation

- [`docs/technical/context-model-and-retrieval.md`](docs/technical/context-model-and-retrieval.md) — entities, edges, authority, processing, retrieval.
- [`docs/technical/webmcp-capability-layer.md`](docs/technical/webmcp-capability-layer.md) — dynamic tools and schemas, enforcement, Agent Lens.
- [`docs/technical/architecture.md`](docs/technical/architecture.md) — Cloudflare-native shape, storage, jobs, connectors, safety.

### Delivery

- [`docs/hackathon/strategy.md`](docs/hackathon/strategy.md) — WebMCP demonstration and submission framing.
- [`docs/roadmap/deferred-and-future.md`](docs/roadmap/deferred-and-future.md) — intentional cuts and extension points.

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

Warm editorial light mode. Use an ivory paper-like foundation, ink typography, warm neutrals, one precise accent, editorial serif/sans contrast, large negative space, asymmetric composition, hairline rules, and media-led color.

The light archive references are the primary visual direction. The Are.na references contribute spatial confidence, restrained chrome, and gallery scale without being copied. Use interior.dev as an interaction-quality and motion reference, not as the visual identity.

Dark mode is deferred.

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

When changing:

- Product scope → update `docs/product/platform-scope.md`.
- Navigation or nouns → update `docs/product/information-architecture.md`.
- Artifact review → update `docs/product/workbench.md`.
- Human or agent access → update `docs/product/sharing-and-permissions.md` and, when relevant, the WebMCP document.
- Taste behavior → update `docs/product/taste-learning.md`.
- Visual direction → update `docs/design/visual-system.md` and Design Context here.
- WebMCP behavior → update `docs/technical/webmcp-capability-layer.md`.
- Storage or services → update `docs/technical/architecture.md`.
- Delivery framing → update `docs/hackathon/strategy.md`.
- Deferred scope → update `docs/roadmap/deferred-and-future.md`.

Add new focused documents only when a concern has enough independent behavior to deserve its own source of truth.
