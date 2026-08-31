# WebMCP hackathon strategy

## Product story versus technical story

GoToTheArchive is a general human-owned context, Workbench, collaboration, and taste platform.

For the WebMCP challenge, foreground the live capability mechanism:

> The person changes what an agent may use in the interface, and WebMCP immediately changes what the agent can actually do.

Taste learning, provenance, artifact review, and the context graph demonstrate why that capability boundary matters. They should not be pitched as unrelated features or exposed as infrastructure diagrams before the human problem is clear.

## Signature interaction

1. A shared or personal Archive contains work, inspiration, and private material.
2. The human starts a task and grants the agent Work and Inspiration access while Personal remains unavailable.
3. Agent Access shows the current human-readable boundary.
4. Agent Lens optionally shows the corresponding registered tools and schemas.
5. The agent retrieves permitted context and creates a real artifact.
6. The artifact appears in the Workbench with accessed and influential references.
7. The human revokes Inspiration from its folder lock.
8. The capability disappears and a stale or repeated retrieval is denied at runtime.

Annotation, revision, and continual taste workflows remain full V1 product work, but Agent Lens is shown only after those core experiences are stable.

This flow is a demonstration path through the general platform, not the definition of the entire product.

## Three-minute submission story

### 0:00–0:20 — Hook

“Agents are getting more context about us, but we have almost no intuitive control over what they know or why they make things the way they do.”

Show the Archive and the current Agent Access boundary.

### 0:20–1:00 — Context and creation

Start a task using selected Work and Inspiration regions. Show the agent retrieving only the granted material and returning an artifact to the Workbench.

### 1:00–1:35 — Inspect and review

Show exact influences, add targeted positive and negative annotations, and request or present a revision.

### 1:35–1:55 — Taste learning

Show one strong proposed taste signal tied to the annotations. Confirm or edit it.

### 1:55–2:30 — Live permission change

Revoke Inspiration. Show Agent Access and Agent Lens change, then demonstrate actual runtime denial.

### 2:30–2:50 — Technical reveal

Briefly explain dynamic WebMCP registration and schemas, runtime enforcement, context graph retrieval, artifact provenance, and the Workbench feedback loop.

### 2:50–3:00 — Close

“Your agents should not each build a hidden model of you. You should own your context, decide what they receive, and be able to teach them from the work they return.”

## Rubric alignment

### WebMCP leverage

- Semantic tools rather than DOM actions.
- Dynamic registration and unregistration.
- Dynamic schemas reflecting permitted regions.
- Read, Propose, and Write distinctions.
- State-dependent and proposal-state tools.
- Accurate annotations.
- Cancellation for long-running operations.
- Runtime authorization matching the live UI.
- Shared human-agent state on the page.

### Execution

- Real artifacts and viewers.
- Reliable permission transitions.
- Clear status and error states.
- Warm editorial visual system.
- Purposeful interaction motion.
- No fake provenance or decorative capability indicators.

### Impact

- Human control over agent context.
- Less indiscriminate context exposure.
- Inspectable personalization.
- Artifact-centered collaboration.
- Feedback that improves later tasks without hidden profile mutation.

### Creativity and ambition

Memory, canvases, and graphs are not novel by themselves. The distinctive combination is:

```text
human-owned context
+ live capability boundary
+ artifact Workbench
+ visible influences
+ explicit continual taste learning
```

## What not to emphasize

- Upload forms.
- Long connector setup.
- Database choice.
- Graph animations.
- Generic chat.
- Broad future roadmap.
- Claims that revocation makes models forget.

## Failure modes

### Pretty library only

If the Archive dominates, the result resembles an inspiration or personal library product.

### WebMCP theater

If the interface changes but the tool surface or runtime does not, the central claim fails.

### Generic memory pitch

“One memory for every agent” enters a crowded category and hides human ownership and evidence-backed taste.

### Workbench without provenance

Artifact review alone is useful but does not explain why context ownership matters.

### Vague learning

Taste improvement must be tied to exact artifacts, references, annotations, and human confirmation.

### Technical overload

Agent Lens supports the reveal. It must not turn the ordinary product into a developer console.

### Unsupported claims

Do not claim WebMCP directly transports arbitrary multimodal blobs, all MCP tools are static, no competitor has permissions, or the agent never receives data. Describe the implemented boundaries precisely.
