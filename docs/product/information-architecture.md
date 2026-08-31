# Information architecture

## Primary navigation

```text
Archive · Workbench · Shared · Taste · Inbox
```

Agent Access appears as a persistent contextual panel. Search and capture are global actions.

## Core vocabulary

Use a small human-facing vocabulary even when the underlying model is richer.

### Space

The highest-level ownership boundary. A space is personal or shared.

### Region

A meaningful area inside a space, such as Work, Inspiration, Research, Personal, or a user-defined category. Regions are important permission boundaries.

### Item

Anything saved in the Archive: a note, image, screenshot, link, PDF, document, source-linked object, person, or reference.

### Project

An optional working grouping spanning relevant regions, items, tasks, artifacts, collaborators, and project-specific taste. Projects should not replace the more durable Archive hierarchy.

### Task

A bounded human-agent job with an initiating user, active agent/client, current grants, status, timestamps, retrieved context, and resulting artifacts.

### Artifact

Agent-created or imported work presented in the Workbench. Artifacts have versions, provenance, annotations, decisions, and relationships to tasks and source items.

### Annotation

Feedback attached to an artifact overall or to a precise target within it. It records author, sentiment, optional design/work dimension, comment, status, and target coordinates or identifiers.

### Taste signal

An explicit, evidence-backed preference with a scope and confidence. A proposed signal is not canonical until accepted.

### Grant

Temporary or persistent agent authority over a region or subregion for a task. Human-facing labels are None, Read, Propose, and Write.

Avoid exposing “ContextEdge,” “authority class,” “embedding,” “capability compiler,” or “schema enum” in ordinary product copy.

## Archive structure

```text
Space
├── Region
│   ├── Item
│   ├── Item
│   └── optional nested Region
└── Project (cross-cutting grouping)
    ├── relevant Items
    ├── Tasks
    ├── Artifacts
    └── project Taste
```

The graph may relate any objects under the hood. The primary interface should not require users to navigate a visible graph.

## Progressive disclosure

The default interface should answer only:

- Where am I?
- What is here?
- What needs my attention?
- What can this agent use right now?
- What happened to this work?

Technical and historical detail expands on demand:

- Agent Access → Agent Lens → active tools and denials.
- Artifact influences → accessed context → retrieval details.
- Taste signal → evidence → supporting and contradicting feedback.
- Item → provenance → source, transformations, and relationships.
- Shared project → role details → inherited and explicit permissions.

## Home and return experience

Do not build a metric dashboard. The return surface should be editorial and action-oriented:

- Continue recent work.
- Review pending agent artifacts.
- Respond to collaborator comments.
- Evaluate proposed taste signals.
- Revisit meaningful or unfinished Archive material.
- Resume active shared projects.

## Empty states

Empty states teach through a useful first action:

- Empty Archive: save a link, note, image, or PDF.
- Empty Workbench: start a task using selected context or import work for review.
- Empty Shared: invite a collaborator or share an artifact review.
- Empty Taste: annotate an artifact or write a preference explicitly.
- Empty Inbox: confirm that nothing needs attention and offer a route back to recent work.

## Search

Search spans items, projects, artifacts, people, annotations, and confirmed taste while respecting human permissions and current agent grants. Results state the owning space, source, and relevant relationship rather than presenting a contextless universal list.
