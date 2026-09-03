# Platform scope

## Current platform

This pass is a coherent general platform, not a narrow demo MVP. It should implement enough of every central system for the pieces to work together without attempting every modality, connector, or collaboration model.

The challenge build has three primary product destinations, one operational
utility, and one persistent contextual control.

| Surface | Primary job |
|---|---|
| Archive | Capture, browse, search, organize, relate, and revisit context |
| Workbench | View agent-created work, inspect versions and influences, annotate, and decide |
| Taste | Review confirmed preferences, evidence, scope, and proposed learnings |
| Stats | Inspect metered model usage and the current vision-processing allowance |
| Agent Access | Contextual panel showing what the current agent may use and do |

Stats is an operational utility rather than a core product destination. Agent
Access is not a fourth destination. It follows the current project, task,
artifact, or region.

Shared and Inbox are deferred to v2. Their behavior remains specified in
`sharing-and-permissions.md` and `information-architecture.md`, and the permission
model they depend on is built in the current pass, but neither ships as a
destination. See **Deferred** below.

## Included capabilities

### Archive and capture

- Native text notes.
- Images and screenshots.
- Links and saved webpages with canonical source metadata.
- X.com posts, including embedded post content, author/source metadata, media previews, and extracted images where permitted.
- PDFs.
- Project and research documents.
- Source-linked external items where available.
- Search, filters, manual organization, and lightweight relationships.
- Revisit and resurfacing experiences that make the archive useful without an agent.

### Organization

- Personal and shared spaces.
- User-defined regions within spaces.
- Optional projects that group relevant regions, items, tasks, and artifacts.
- Items with source, provenance, authority class, semantic representation, and relationships.
- Manual curation remains more authoritative than inference.

### Agents

- Task-specific agent sessions.
- Multi-agent task history with session-bound attribution and honest identity labels.
- None / Read / Propose / Write grants at appropriate region or subregion scope.
- Dynamic semantic WebMCP capabilities derived from current grants and page state.
- Context and taste retrieval constrained by grants.
- Artifact recording with source and influence provenance.
- Runtime denial when access is absent, revoked, expired, or stale.

### Workbench

- PDF, presentation, code, webpage/component, and image artifacts.
- Sandboxed UI previews where rendering active content is necessary.
- Version history and comparison-ready data model.
- Overall and targeted annotations.
- Approve, Approve with notes, Request changes, and Reject decisions.
- Influence references and accessed-context disclosure.
- Feedback that can produce proposed taste signals.

### Sharing foundation

- Human ownership remains a separate authority layer that caps every agent grant.
- The data model preserves space, project, attribution, and role boundaries needed
  by the later collaboration surface.
- The current pass does not ship invitations, collaborative roles, review links,
  or a Shared destination; those are explicitly deferred to v2.

### Taste

- Human-authored preferences.
- Evidence-linked confirmed taste signals.
- Agent-proposed signals grounded in explicit artifact feedback.
- Personal, project, or explicitly shared scope.
- Accept, edit, rescope, reject, and undo.

## Product depth versus breadth

The platform should be broad across its central loop and deep enough that every claim is real:

- The Archive must support meaningful work, not fixtures only.
- Permissions must alter actual agent authority, not decorative UI.
- Workbench viewers and annotations must operate on real artifacts.
- Provenance must come from actual retrieval and artifact records.
- Taste proposals must cite the feedback and artifacts that support them.
- The human-access ceiling must enforce real ownership boundaries even though the
  collaboration UI is deferred.

Breadth outside that loop is deliberately limited.

## Success criteria

The pass is coherent when a person can:

1. Create or import useful context.
2. Organize it into personal or shared regions and projects.
3. Grant an agent task-specific access.
4. Receive a real artifact in the Workbench.
5. Inspect what was accessed and what influenced the artifact.
6. Annotate and make a review decision.
7. Accept or reject a resulting taste proposal.
8. Reuse the confirmed context and taste in a later task.
9. Revoke access and observe real capability loss.

## Deferred

### To v2

- **Shared** destination — collaborative spaces, regions, projects, review links,
  and the Viewer / Commenter / Editor / Owner roles. Specified in
  `sharing-and-permissions.md`; the human-access half of the permission model it
  needs is already built, so only its UI remains.
- **Inbox** destination — pending approvals, mentions, revision requests, triage.

### From this pass

Voice-note ingestion, native Pinterest integration, a Chrome capture extension,
a broad connector marketplace, video/audio Workbench review, a public community
or discovery feed, whole-account sharing, a visible freeform graph, generic
built-in chat as a primary surface, arbitrary execution of reviewed code, fully
autonomous taste inference from passive behavior, and dark mode.

These cuts trim incidental breadth without weakening the central loop.

### Kept extensible

The item-type registry and processing adapters, artifact viewer and annotation
adapters, the source-connector abstraction, the task and agent-identity model,
space/region/project boundaries, context edges and retrieval signals, taste
scopes and the evidence model, the proposal/approval workflow, the policy-driven
capability compiler, and the audit and provenance records.

### Expansion rule

A new capability belongs when it strengthens at least one central loop — curate,
lend safely, create and review, collaborate, learn from feedback — without
obscuring the others. Connector count, modality count, and graph complexity are
not success metrics.
