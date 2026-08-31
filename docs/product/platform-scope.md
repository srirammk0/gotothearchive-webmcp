# Platform scope

## Current platform

This pass is a coherent general platform, not a narrow demo MVP. It should implement enough of every central system for the pieces to work together without attempting every modality, connector, or collaboration model.

The platform has five primary destinations and one persistent contextual control.

| Surface | Primary job |
|---|---|
| Archive | Capture, browse, search, organize, relate, and revisit context |
| Workbench | View agent-created work, inspect versions and influences, annotate, and decide |
| Shared | Work with regions, projects, artifacts, and reviews involving other people |
| Taste | Review confirmed preferences, evidence, scope, and proposed learnings |
| Inbox | Process pending work, comments, approvals, revision requests, and taste proposals |
| Agent Access | Contextual panel showing what the current agent may use and do |

Agent Access is not a sixth destination. It follows the current project, task, artifact, or region.

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

### Sharing

- Invite people to spaces, regions, and projects.
- Viewer / Commenter / Editor / Owner human roles.
- Share individual Workbench artifacts by invitation or review link.
- Collaborative annotations and attributed decisions.
- Private global taste by default.
- Explicitly shared project taste where the owner chooses.

### Taste

- Human-authored preferences.
- Evidence-linked confirmed taste signals.
- Proposed signals derived from explicit artifact feedback.
- Personal, project, or explicitly shared scope.
- Accept, edit, rescope, reject, and undo.

## Product depth versus breadth

The platform should be broad across its central loop and deep enough that every claim is real:

- The Archive must support meaningful work, not fixtures only.
- Permissions must alter actual agent authority, not decorative UI.
- Workbench viewers and annotations must operate on real artifacts.
- Provenance must come from actual retrieval and artifact records.
- Taste proposals must cite the feedback and artifacts that support them.
- Sharing must enforce real human access boundaries.

Breadth outside that loop is deliberately limited. See [deferred and future work](../roadmap/deferred-and-future.md).

## Success criteria

The pass is coherent when a person can:

1. Create or import useful context.
2. Organize it into personal or shared regions and projects.
3. Grant an agent task-specific access.
4. Receive a real artifact in the Workbench.
5. Inspect what was accessed and what influenced the artifact.
6. Annotate and make a review decision.
7. Collaborate with another person on that review.
8. Accept or reject a resulting taste proposal.
9. Reuse the confirmed context and taste in a later task.
10. Revoke access and observe real capability loss.
