# GoToTheArchive documentation

GoToTheArchive is a human-owned context and taste platform. People curate the material that represents their work and preferences, selectively lend it to agents, review the resulting work, and turn explicit feedback into inspectable improvements.

This directory is the product source of truth. The documents are intentionally split by concern so future work can change one area without turning a single PRD into an unmaintainable catch-all.

## Product

- [Vision and principles](product/vision-and-principles.md) — the product thesis, audience, positioning, and non-negotiable principles.
- [Platform scope](product/platform-scope.md) — what the current platform includes, what each surface owns, and the boundaries of this pass.
- [Information architecture](product/information-architecture.md) — navigation, core vocabulary, object hierarchy, and progressive disclosure.
- [Workbench](product/workbench.md) — agent-created artifacts, native viewers, versions, review, approval, and annotations.
- [Sharing and permissions](product/sharing-and-permissions.md) — human collaboration, agent grants, intersections, expiry, and private taste boundaries.
- [Taste learning](product/taste-learning.md) — evidence-backed preferences, feedback, provenance, scope, and the continual learning loop.

## Design

- [Visual system](design/visual-system.md) — warm editorial direction, typography, color, composition, motion, and reference usage.
- [Core experiences](design/core-experiences.md) — Archive, Workbench, Shared, Taste, Inbox, Agent Access, and Agent Lens behavior.

## Technical foundation

- [Context model and retrieval](technical/context-model-and-retrieval.md) — entities, relationships, authority classes, multimodal processing, and retrieval.
- [WebMCP capability layer](technical/webmcp-capability-layer.md) — dynamic tools and schemas, runtime authorization, annotations, and cancellation.
- [Architecture](technical/architecture.md) — Cloudflare-native services, storage boundaries, connector abstraction, and safety.

## Delivery

- [Hackathon strategy](hackathon/strategy.md) — WebMCP framing, demonstration story, rubric alignment, and failure modes.
- [Deferred and future work](roadmap/deferred-and-future.md) — intentionally cut capabilities and extension points.

## Visual references

Original-resolution visual references and their provenance live in [`design/references`](design/references/README.md).

## Source-of-truth order

When documents disagree, use this order:

1. The user's most recent explicit decision.
2. Root [`AGENTS.md`](../AGENTS.md).
3. The focused document for the relevant concern.
4. This index.
5. Earlier planning material.

The abandoned `webmcp/` implementation is not a product or design reference and must not be inspected or replicated.
