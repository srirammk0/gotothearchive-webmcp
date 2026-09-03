# Core experiences

Shared and Inbox below describe the intended wider platform. They are deferred
from the WebMCP Challenge build; Archive, Workbench, Taste, Agent Access, Agent
Lens, and the underlying human-access boundary ship in the current pass.

## Archive

### Purpose

Capture, browse, organize, search, relate, and revisit the context that represents a person's work and taste.

### Default experience

- Editorial browsing rather than a dashboard.
- Clear space and region location.
- Large, varied media treatment.
- Quick capture for note, link, image, screenshot, or PDF.
- Search and filters available without dominating.
- Source and ownership visible at item level.
- Revisit modules for unfinished, related, or historically meaningful material.

### Avoid

- Infinite freeform canvas as the primary model.
- Visible node spaghetti.
- Uniform cards for every item type.
- Agent chat occupying permanent space.
- Permission controls on every card at all times.

## Workbench

### Purpose

Review agent-created or imported artifacts with versions, provenance, annotations, collaboration, and decisions.

### Default experience

- Artifact first.
- Annotation rail second.
- Anchored review decision controls.
- Influence trail available without competing with the work.
- Version state and task identity always recoverable.
- Agent Access collapsible but close at hand.

See [Workbench](../product/workbench.md).

## Shared

### Purpose

Provide one place for spaces, projects, regions, artifacts, and review activity involving other people.

### Default experience

- Active shared projects and regions.
- Artifacts awaiting collaborative review.
- Recent meaningful collaborator activity.
- Clear human role and owning space.
- Privacy boundaries around personal context and taste.

Shared is not a social feed. Activity is grouped around work and decisions.

## Taste

### Purpose

Let people inspect and shape what the platform believes about their preferences.

### Default experience

- Pending proposals first when action is needed.
- Confirmed signals organized by scope and context.
- Evidence and contradictions one expansion away.
- Plain-language explanations.
- Edit, rescope, reject, merge, supersede, and undo.

Taste should feel like a curated notebook or record, not a score dashboard.

## Inbox

### Purpose

Collect work that needs a human decision.

### Included items

- Agent artifact ready for review.
- Collaborator comment or mention.
- Approval request.
- Revision submitted after changes were requested.
- Invitation requiring acceptance.
- Proposed taste signal.
- Permission or grant issue requiring intervention.

### Rules

Inbox stays intentionally small: a simple list of items requiring action, with grouped artifact review and taste proposals as its main cases. It is not a second activity dashboard or notification center.

- If no action is required, put it in history rather than Inbox.
- Group related events by artifact or project.
- Support batch triage where risk is low.
- Preserve state across interruptions.
- Provide a satisfying, useful empty state rather than metrics.

## Agent Access

### Human view

Agent access is controlled directly on Archive folders and regions through compact lock controls. Clicking a lock cycles through the allowed levels:

```text
🔒 No access → ◷ Can view → ✦ Can suggest changes → ✎ Can edit directly
```

The control shows a short tooltip or accessible label with the current level, task, and expiry. The full grant record remains inspectable from the folder or task details.

The default state uses plain language:

```text
This agent can currently use
✓ Project brief — can view
✓ Brand references — can view
✓ Draft copy — can suggest changes
– Personal notes — no access

For this task · expires when the task ends
```

Changes are applied to actual capability state. The panel confirms success and makes revocation immediately visible.

### Agent Lens

Agent Lens is an optional technical inspection layer within Agent Access, not a
separate application or persona switch. It ships in the challenge build so a
person can verify that WebMCP capabilities change with the same visible grants
that govern the product.

It may reveal:

- Agent/client identity.
- Current task and expiry.
- Registered semantic tools.
- Current region enums and operation schemas.
- Recent retrievals.
- Denied or stale calls.
- Capability changes resulting from user actions.

This makes WebMCP verifiable for technical users and the hackathon without burdening ordinary knowledge workers.

## Task creation

A task starts from selected Archive context, a project, an artifact revision request, or a direct human instruction.

The task setup should progressively disclose:

1. What work is requested.
2. Which regions the agent may use.
3. What the agent may do.
4. Where the result will appear.
5. When access expires.

Suggested defaults should minimize setup while keeping access visible. Never preselect sensitive personal regions simply because they appear relevant.

## Persona considerations

### First-time knowledge worker

Must understand the first useful action without learning graph or agent terminology. Teach by saving one item and reviewing one artifact.

### Power user

Needs global search, keyboard navigation, batch organization, fast capture, recent items, and skippable guidance. Motion cannot delay work.

### Accessibility-dependent user

Must complete Archive organization, grant changes, artifact review, and annotation by keyboard and assistive technology. Spatial annotations need a structured list equivalent.

### Distracted collaborator

Needs persistent drafts, mobile-reachable review actions, concise notification grouping, and clear return state after interruption.

## State design checklist

Every major surface defines:

- Empty.
- Loading or processing.
- Partial success.
- Ready.
- Saving.
- Success.
- Permission denied.
- Expired access.
- Offline or retryable failure.
- Destructive confirmation where relevant.
- Undo or recovery.
