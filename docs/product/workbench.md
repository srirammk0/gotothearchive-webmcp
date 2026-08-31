# Workbench

## Purpose

The Workbench is where agent-created work becomes a shared, inspectable object rather than disappearing into a chat transcript. It supports focused viewing, provenance, targeted feedback, versioning, human collaboration, approval, and the feedback-to-taste loop.

The Workbench is the bridge between the Archive and continual learning:

```text
Archive context → agent task → artifact → human review → proposed taste → future work
```

## Supported artifact types

V1 supports these concrete artifact formats:

- PDF files (`.pdf`).
- Presentation decks (`.pptx`), rendered into a safe slide viewer.
- Code bundles (`.zip`), organized by file with line-addressable annotations.
- Webpage/component bundles (`.zip` or `.html`), rendered in a sandboxed preview.
- Images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`).

Archive accepts real user uploads. Seeded fixtures are not part of the product experience.

The artifact system uses a shared review model with format-specific viewers and target adapters. Voice and video review are deferred.

## Layout

The default desktop composition contains:

1. A large central artifact viewer.
2. A right-side annotation rail.
3. An expandable provenance and influence strip.
4. Nearby version history.
5. Anchored review controls.
6. A collapsible Agent Access panel for the originating task.

The artifact remains visually dominant. Metadata and controls should not shrink it into a dashboard card.

On smaller screens, the viewer remains primary while annotations, provenance, versions, and access become separate sheets or tabs. Critical review actions remain reachable.

## Artifact lifecycle

```text
Draft / processing
        ↓
Ready for review
        ↓
In review
        ↓
Approved | Approved with notes | Changes requested | Rejected
        ↓
optional revised version
```

Every state transition records actor, time, previous state, and optional note. Low-risk actions such as adding a comment can be optimistic. Decisions and version replacement require confirmed persistence.

## Review decisions

### Approve

The artifact is accepted as-is. Positive annotations may support taste proposals.

### Approve with notes

The artifact is accepted, but attached notes remain part of its record and may inform future work.

### Request changes

The artifact is not rejected. A revision task is created from unresolved annotations while preserving the current version.

### Reject

The artifact is unsuitable. Rejection requires an optional or configurable explanation and never deletes the work or its provenance.

## Annotation model

All artifact types share a conceptual annotation:

```text
Annotation
├── artifact_id
├── version_id
├── author
├── target
├── overlay (optional)
├── sentiment: positive | negative | neutral
├── dimension (optional)
├── comment
├── status: open | resolved | superseded
├── created_at
└── updated_at
```

Suggested dimensions include typography, composition, hierarchy, density, color, imagery, motion, tone, structure, clarity, correctness, and interaction. These are aids, not a hard universal taxonomy.

### Format-specific targets

- PDF: page plus normalized rectangle; optional extracted-text anchor.
- Presentation: slide plus element identifier or normalized rectangle.
- Code: stable file path plus line or symbol anchor and commit/version reference.
- Webpage/component: stable element identifier or DOM-independent preview coordinates; optional viewport.
- Image: normalized rectangle or point.
- Entire artifact: no local target.

Annotations support two related interaction modes:

- **Select and comment:** select a precise region, text range, slide element, code line, or whole artifact, then attach a threaded comment.
- **Draw and comment:** draw freehand or shape overlays above the artifact, with color, stroke, and normalized coordinates, then attach a comment to the overlay.

Overlays are review metadata, never edits to the canonical artifact. They render in a separate annotation layer and remain tied to the artifact version that received them.

Targets must survive display scaling. When a target cannot survive a revision, retain it on the original version and offer best-effort mapping rather than silently moving it.

## Versions

Artifacts are immutable at the version level. A revision creates a new version and retains:

- Parent version.
- Generating task or importing user.
- Agent/client identity.
- Context and taste snapshot used.
- Influence records.
- Open and resolved annotations.
- Review decision.
- File/render metadata.

Comparison views may be format-specific later, but the first-pass model must support them.

## Provenance and retrieval disclosure

The Workbench distinguishes:

- **Used these references:** material recorded as influencing the artifact.
- **Accessed for this task:** material retrieved or inspected but not recorded as influential.
- **Unavailable or denied:** attempted context access that current grants prevented, visible in Agent Lens rather than ordinary provenance.

Influence records should link directly back to Archive items and include role or weight when known. Do not imply causal precision the agent did not provide.

## Collaboration

- Annotations identify their human or agent author.
- Collaborators can reply and resolve threads according to human role.
- Review decisions show who made them.
- Concurrent updates produce visible conflict handling rather than silent last-write-wins behavior.
- Review links can expose one artifact without exposing its parent Archive region.

## Safe rendering

Artifact viewers treat content as untrusted.

- PDFs and images render through constrained viewers.
- Presentations are normalized for viewing rather than granted arbitrary host access.
- Code is displayed for review; execution is not assumed.
- Active webpage/component previews run in a sandboxed origin or iframe with restricted capabilities.
- Preview network, storage, clipboard, navigation, and download behavior must be explicit.

The Workbench is a product-level review sandbox, not permission to execute arbitrary agent code on the user's machine.

## Notifications and Inbox

Workbench events create Inbox entries when action is required:

- Artifact ready for review.
- Collaborator mentioned the user.
- Changes requested.
- New revision submitted.
- Approval requested.
- Taste proposal derived from completed review.

Activity that needs no decision belongs in history, not the Inbox.
