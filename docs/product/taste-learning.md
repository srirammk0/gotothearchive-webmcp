# Taste learning

## Definition

Taste is not a preference string or opaque profile. It is an evidence-backed relationship between references, contexts, artifacts, feedback, and human-confirmed signals.

```text
REFERENCE
    ↓ influenced
ARTIFACT VERSION
    ↓ received
ANNOTATION / DECISION
    ↓ supports or contradicts
TASTE SIGNAL
```

## Evidence sources

- Images and screenshots.
- Websites and interface references.
- PDFs and presentations.
- Typography, layout, visual, and product examples.
- Notes explaining why something works or fails.
- Prior accepted and rejected artifacts.
- Targeted Workbench annotations.
- Explicitly written preferences.

The first pass intentionally excludes voice ingestion and large taste-source integrations such as native Pinterest sync.

## Taste signal model

```text
TasteSignal
├── id
├── owner
├── statement
├── dimensions
├── scope: personal | project | shared
├── context qualifiers
├── status: proposed | confirmed | rejected | superseded
├── confidence
├── evidence links
├── contradicting evidence links
├── created_by
├── approved_by
├── created_at
└── updated_at
```

Example:

```text
Statement: Prefers dense editorial typography for product landing pages.
Scope: Project / GoToTheArchive
Confidence: High
Evidence: 3 positive typography annotations across 2 approved artifacts
Contradiction: 1 note preferring more breathing room in long-form documentation
```

## Continual learning loop

1. An agent retrieves task-relevant context and confirmed taste within its grant.
2. The agent creates an artifact and records influencing references.
3. The human reviews the artifact in the Workbench.
4. Annotations identify what worked, failed, or needs revision.
5. The system derives candidate signals with supporting evidence.
6. The human accepts, edits, rescopes, or rejects each candidate.
7. Confirmed signals become eligible for later retrieval.

No acceptance is inferred from silence. No profile is silently rewritten.

## Proposal quality rules

A proposed signal should:

- Be understandable without technical language.
- Name the context in which the preference applies.
- Cite the exact artifacts and annotations that support it.
- Surface meaningful contradictory evidence.
- Avoid universal claims from one example.
- Distinguish visual preference from correctness or task requirements.
- Allow direct editing before confirmation.

Poor proposal:

> Likes minimal design.

Better proposal:

> For research presentations, prefers restrained layouts with one dominant visual rather than evenly weighted card grids.

## Feedback dimensions

Suggested dimensions provide annotation shortcuts without forcing a universal taxonomy:

- Typography.
- Composition.
- Layout density.
- Color.
- Imagery.
- Motion.
- Material and texture.
- Visual hierarchy.
- Tone and voice.
- Language.
- Pacing.
- Interaction style.
- Structure and clarity.

Users and projects may introduce their own dimensions.

## Retrieval

Taste retrieval is task- and scope-sensitive. It should prefer:

- Confirmed over proposed signals.
- Human-authored over inferred statements.
- Project-specific over global signals when the task belongs to that project.
- Evidence with relevant artifact type and task context.
- Recent evidence when taste has genuinely changed.
- Repeated patterns over isolated feedback.

Negative and contradictory evidence is useful. Retrieval should not reduce taste to only positive exemplars.

## Taste interface

The Taste destination contains:

- Pending proposals.
- Confirmed personal signals.
- Project and shared signals.
- Evidence and contradiction views.
- Recently changed or superseded signals.
- Controls to edit, rescope, reject, merge, or undo.

The interface should read like a curated record, not an analytics dashboard. Confidence may be explained in words rather than presented as false-precision percentages.

## Privacy

- Personal taste is private by default.
- Project participation does not expose global personal taste.
- Shared signals require an explicit sharing action or shared authorship.
- Private evidence must not leak through public provenance.
- Deleting or restricting evidence triggers a review of derived signals and their explanations.

## Authority order

When signals conflict, use this conceptual order:

1. Explicit current human instruction for the task.
2. Confirmed project taste.
3. Confirmed personal taste.
4. Human-authored context and notes.
5. Repeated artifact feedback.
6. Proposed signals.
7. Low-confidence machine inference.

The system may rank context differently for a particular task, but it must not hide which authority class shaped the result.
