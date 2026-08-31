# Sharing and permissions

## Two independent permission systems

GoToTheArchive separates human collaboration from agent authority.

### Human sharing

Persistent access granted to another person.

| Role | Browse | Comment | Edit content | Manage people |
|---|---:|---:|---:|---:|
| Viewer | Yes | No | No | No |
| Commenter | Yes | Yes | No | No |
| Editor | Yes | Yes | Yes | No |
| Owner | Yes | Yes | Yes | Yes |

### Agent grants

Task-specific authority granted to an agent/client.

| Grant | Retrieve | Inspect relationships | Suggest changes | Direct mutation |
|---|---:|---:|---:|---:|
| None | No | No | No | No |
| Read | Yes | Yes, within scope | No | No |
| Propose | Yes | Yes, within scope | Yes | No |
| Write | Yes | Yes, within scope | Yes | Yes, within scope |

An agent's effective authority is always the intersection of:

```text
invoking human's access
∩ explicit agent grant
∩ current task scope
∩ current page/workflow state
∩ current runtime policy
```

No interface state, cached schema, or stale call may expand that intersection.

## Shareable objects

The first pass supports sharing:

- Spaces.
- Regions.
- Projects.
- Individual Workbench artifacts.
- Artifact review links.

Whole-account sharing and a public community network are not part of this pass.

## Inheritance

- Space roles may flow to contained regions unless overridden by a more restrictive rule.
- Project access covers objects explicitly placed in the project, not every item connected through the graph.
- Artifact review links expose the artifact and approved review context only.
- Relationships never automatically grant access to the target object.
- Search and retrieval omit inaccessible objects rather than leaking their names or counts.

Permission explanations should answer “Why can this person or agent access this?” with the relevant inheritance chain.

## Agent grant lifecycle

Every agent grant records:

- Human grantor.
- Agent/client identity.
- Task.
- Target regions or subregions.
- Operation level.
- Creation and expiry time.
- Revocation state and actor.
- Optional reason.

Grants may be task-bound, time-bound, or explicitly persistent. Task-bound is the recommended default.

When a grant changes:

1. The visible Agent Access state updates.
2. The capability compiler updates registered tools and schemas.
3. Runtime authorization uses the new state immediately.
4. Stale calls are denied.
5. The audit history records the change.

Revocation prevents future access. It does not claim that an external model has forgotten data already received.

## Shared taste boundaries

Taste has explicit scope:

- **Personal:** visible only to its owner unless explicitly shared.
- **Project:** applicable inside a project; visibility follows explicit project policy.
- **Shared:** deliberately created or promoted for a team or shared space.

Inviting someone to a project does not expose the owner's personal global taste. Personal evidence can influence an artifact without becoming readable to collaborators unless the owner chooses to cite or share it.

When private evidence influences a shared artifact, the provenance UI must avoid leaking the private item's title, thumbnail, content, or location. The user should be warned before producing a shared artifact whose explanation would require private evidence.

## Review links

Review links are intentionally narrow:

- Limited to one artifact or review package.
- Configurable expiration.
- Viewer or Commenter behavior only.
- Optional identity requirement.
- Revocable.
- No navigation into parent regions or unrelated artifacts.
- Downloads disabled unless explicitly allowed.

## Agent identity

Every agent action records a stable client/agent identity in addition to the initiating human. One active agent per task is the default mental model.

## Audit and undo

Record:

- Invitations, role changes, and removals.
- Grant creation, escalation, expiry, and revocation.
- Agent retrieval and denied calls at an appropriate privacy-preserving level.
- Artifact creation and version changes.
- Review decisions.
- Taste proposal acceptance, edits, scope changes, and reversals.

Undo should create a new auditable state rather than erasing history.

## Human-facing language

Prefer:

- “Can view” instead of “read scope.”
- “Can suggest changes” instead of “propose capability.”
- “Can edit directly” instead of “write authority.”
- “For this task” and an explicit expiration.
- “This agent can currently use…”

Technical details remain available through Agent Lens.
