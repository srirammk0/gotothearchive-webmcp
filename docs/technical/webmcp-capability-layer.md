# WebMCP capability layer

## Role in the product

WebMCP is the live semantic bridge between human-visible state and agent authority. It is central to the hackathon demonstration and a durable platform mechanism, but it is not the product's ordinary visual identity.

The key invariant is:

> Human-facing permission state and agent-facing capability state are two views of the same live application state.

## Capability compiler

```text
human share and ownership state
        +
current Agent Grant
        +
task and page/workflow state
        ↓
capability compiler
        ↓
registered WebMCP tools and schemas
        ↓
runtime authorization
        ↓
context, proposal, artifact, and feedback services
```

The compiler decides:

- Which semantic tools exist.
- Which regions and operations appear in schemas.
- Whether mutation tools are absent, proposal-only, or writable.
- Which project- or artifact-specific operations appear.
- Whether pending proposals expose approval and rejection operations.
- What the Agent Lens reports.

## Dynamic registration

Tools are registered, unregistered, or re-registered when:

- A human changes an agent grant.
- A grant expires or is revoked.
- The user changes the active task, project, artifact, or workflow state.
- Human sharing changes the invoking user's effective access.
- A proposal enters or leaves a pending state.
- A task completes.

Example region schema before revocation:

```json
{ "region": ["work", "inspiration"] }
```

After Inspiration is revoked:

```json
{ "region": ["work"] }
```

If no meaningful operation remains, unregister the tool rather than presenting an always-failing shell.

## Runtime enforcement

The schema communicates authority; runtime code enforces it.

Every call re-checks:

- Current authenticated user.
- Agent/client identity.
- Active task.
- Current, unexpired grant.
- Invoking user's human access.
- Requested region, item, and operation.
- Workflow-specific constraints.

Cached schemas and previously valid calls do not bypass the current check. Revocation must make stale calls fail immediately.

## Semantic tool surface

Illustrative tools:

- `get_current_context_scope`
- `get_context_for_task`
- `get_taste_for_task`
- `inspect_context_item`
- `inspect_relationships`
- `trace_artifact_influences`
- `record_artifact`
- `record_feedback`
- `propose_context_change`
- `approve_proposed_changes`
- `reject_proposed_changes`

The exact surface may evolve. Prefer tools that express product meaning over UI mechanics.

Avoid tools such as:

- `click_card`
- `open_modal`
- `move_card_left`
- `close_sidebar`

## Agent identity and multi-agent history

Cloudflare-authenticated sessions establish the human and session boundary; they do not automatically prove whether the caller is ChatGPT, Claude, Claude Desktop, Cursor, or another client.

When a WebMCP connection begins, create an `agent_session_id` bound to the authenticated human and active task. A client may declare provider, client, and model for attribution:

```json
{
  "agent": {
    "provider": "anthropic",
    "client": "claude-desktop",
    "model": "claude-sonnet"
  },
  "task_id": "task_123"
}
```

Declared identity is useful but spoofable. It never authorizes access. Authorization binds to authenticated session, human access, task, and explicit grant. If no reliable identity exists, record `Unknown agent`.

Every agent operation contributes to an append-only history ledger with:

```text
event_id
actor_type: human | agent | system
actor_label
provider / client / model (optional attribution)
agent_session_id
human_id
task_id
tool_name
operation
context_items_accessed
artifact_id / version (optional)
timestamp
```

History can show human grants, agent retrievals, artifact creation, collaborator annotations, and actions by different agent sessions without pretending provider identity is verified.

Human-facing labels:

- **Verified client** — authenticated token or session.
- **Declared agent** — self-reported provider/client.
- **Model used** — provider/model associated with the route or operation.
- **Unknown agent** — no reliable identity.

## Read, Propose, and Write

### Read

Exposes scoped retrieval and inspection only.

### Propose

Adds proposal submission. Canonical state remains unchanged until an authorized human accepts the proposal.

### Write

Adds direct mutations only within explicit scope. High-risk or shared actions may still require confirmation according to product policy.

The capability compiler should prefer proposal tools over exposing a write tool that will merely fail.

## State-dependent tools

Examples:

- Opening a project may expose project-specific context and artifact operations.
- Opening a Workbench artifact may expose feedback and influence-tracing operations.
- Pending proposals may expose approval and rejection operations.
- Completing a task removes task-only retrieval or write operations.

State-dependent tools must not make authority mysterious. Agent Access explains why a capability appeared or disappeared.

## Tool annotations and untrusted content

- Mark genuinely read-only tools with appropriate read-only annotations.
- Mark externally sourced or user-provided content as untrusted where supported.
- Do not mark a tool read-only if it records analytics, task history, feedback, or any other mutation.
- Tool descriptions should state scope and side effects plainly.

## Cancellation and long-running work

Search, source resolution, artifact processing, and other long-running operations should honor cancellation signals where supported.

Cancellation should:

- Stop unnecessary external and compute work.
- Avoid partially committing canonical state.
- Mark incomplete processing visibly.
- Preserve safe resumability where useful.

## Agent Lens

Agent Lens is the inspectable UI for this layer. It may show:

- Registered tools.
- Region and operation schemas.
- Capability changes over time.
- Recent retrieval and denial events.
- Current task and expiry.
- Human-readable reasons for each capability.

The hackathon can show schema-level detail. Ordinary users see the plain-language Agent Access view by default.

## Security rules

- Never expose raw R2, database, connector, or source credentials to an agent.
- Never trust UI state without server-side authorization.
- Never allow graph traversal to escape scope.
- Never allow a shared artifact link to inherit Archive permissions.
- Never claim revocation makes a model forget previously received data.
- Never describe WebMCP as transporting arbitrary multimodal blobs when the application is actually resolving and representing them.

## Verification scenarios

At minimum, test:

- None → Read registers retrieval capabilities.
- Read → Propose replaces or augments the surface correctly.
- Propose → Write exposes only allowed mutation verbs.
- Any grant → None removes capability and denies stale calls.
- Grant expiry behaves like revocation.
- Human role reduction constrains an existing agent grant.
- Switching projects removes project-specific tools.
- Private related nodes remain invisible during traversal.
- Proposal-state tools appear and disappear with proposal lifecycle.
- Cancellation leaves no unintended canonical mutation.
