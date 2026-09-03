# Documentation

GoToTheArchive is a human-owned context and taste platform. People curate the
material that represents their work and preferences, lend the relevant parts to
an agent for one task, review what the agent produces with visible provenance,
and turn explicit feedback into inspectable taste.

The docs are split by concern so one area can change without turning into a
single unmaintainable PRD.

## Product

- [Vision and principles](product/vision-and-principles.md) — thesis, audience, the core loop, principles, positioning.
- [Platform scope](product/platform-scope.md) — what ships this pass, what each surface owns, what is deferred.
- [Information architecture](product/information-architecture.md) — navigation, vocabulary, object hierarchy.
- [Workbench](product/workbench.md) — artifacts, viewers, versions, review, annotations.
- [Sharing and permissions](product/sharing-and-permissions.md) — human access, agent grants, the authority intersection, privacy.
- [Taste learning](product/taste-learning.md) — evidence, proposals, scope, retrieval.

## Design

- [Core experiences](design/core-experiences.md) — page-level behavior and state.
- [Visual references](design/references/README.md) — saved reference images.

## Technical

- [Build contract](technical/BUILD-CONTRACT.md) — the frozen invariants every track compiles against.
- [Context model and retrieval](technical/context-model-and-retrieval.md) — entities, edges, authority, retrieval.
- [WebMCP capability layer](technical/webmcp-capability-layer.md) — the capability compiler, runtime authorization, Agent Lens.
- [Architecture](technical/architecture.md) — the Cloudflare-native shape, storage, jobs, safety.

## Delivery

- [Hackathon strategy](hackathon/strategy.md) — WebMCP framing and the demonstration story.
- [Judge demo access](roadmap/judge-demo-access.md) — how the shared no-account demo works.
- [For judges](judges.md) — the one-page orientation judges receive.
- [Submission checklist](submission.md) — the external gates before submitting.

## Source-of-truth order

When documents disagree: the user's most recent explicit decision, then
[`AGENTS.md`](../AGENTS.md), then the focused document for the concern, then this
index, then earlier planning material.

The abandoned `webmcp/` directory is not a reference. Do not inspect or copy it.
