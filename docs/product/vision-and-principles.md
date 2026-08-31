# Vision and principles

## Product thesis

GoToTheArchive is a human-owned, multimodal context and taste platform for broad knowledge work. It gives people one visual place to curate projects, notes, research, inspiration, files, source-linked material, prior decisions, and agent-created work.

People selectively lend the right parts of that archive to agents. Agents create work using the granted material, show what influenced the result, and return the work to a human-controlled Workbench for annotation and approval. Explicit feedback can then produce proposed taste signals that the human accepts, edits, scopes, or rejects.

The platform is not trying to maximize how much an AI knows about a person. It makes context explicit, evidence-backed, task-specific, and controllable.

## Audience

The initial audience is broad knowledge workers: people who produce, evaluate, organize, or collaborate on documents, presentations, research, software, webpages, visual work, and project artifacts.

The platform must remain approachable to someone who does not know what MCP, embeddings, graphs, schemas, or agent capabilities are. Technical mechanisms may be inspectable, but the ordinary interface speaks in human terms.

## Core loop

```text
I curate what represents my work and taste
        ↓
I choose what this agent may use for this task
        ↓
the agent creates using the granted context
        ↓
the work appears in the Workbench with its influences
        ↓
I annotate, approve, reject, or request changes
        ↓
the system proposes evidence-linked taste signals
        ↓
I accept, edit, scope, or reject them
        ↓
future agents retrieve better context
```

## What the product is

- A canonical, human-owned context environment.
- A useful visual archive even when no agent is connected.
- A shared human-agent working system centered on artifacts rather than chat.
- A temporary and visible context boundary for agents.
- An evidence-backed taste system.
- A provenance and review system for agent-created work.
- A collaboration platform for shared projects, regions, artifacts, and annotations.

## What the product is not

- An AI second brain.
- A generic memory store for every agent.
- A giant node graph.
- A generic infinite canvas.
- An enterprise permission console.
- A chat interface with files attached.
- A broad connector marketplace in its first pass.
- A hidden behavioral profiling system.

## Product principles

1. **Humans own canonical context.** Agent outputs and inferences do not silently become truth.
2. **Context is lent, not dumped.** Access is scoped, temporary where appropriate, and minimized for the task.
3. **Taste is grounded in evidence.** Preferences retain links to references, artifacts, feedback, and scope.
4. **Agents propose before assuming.** Inferred preferences and sensitive changes require human review.
5. **Provenance is visible.** People can inspect what was accessed, what influenced a result, and who performed an action.
6. **Human sharing and agent access are separate.** An agent never inherits broader power merely because a person can collaborate.
7. **The same state governs interface and capability.** Human-visible permission state and agent-visible authority cannot drift apart.
8. **Complexity is progressively disclosed.** The human experience stays calm even though the underlying system is sophisticated.
9. **Artifacts are the collaboration unit.** Agent work should be inspectable and reviewable, not trapped in a transcript.
10. **No silent taste rewrite.** Every derived signal is visible, editable, scoped, and reversible.

## Positioning

### One sentence

GoToTheArchive is a human-owned context and taste platform where people curate what represents them, selectively grant agents access, review agent work with visible provenance, and improve future results through explicit feedback.

### Hackathon framing

This is everything an AI could know about me—and I decide exactly what this agent gets. WebMCP turns those decisions into live capabilities, while the Workbench shows what context shaped the agent's work and turns my corrections into inspectable taste.

### Useful phrases

- Your context. On your terms.
- The context firewall between you and your agents.
- Agent work you can see, review, and teach from.

Avoid leading with “personal knowledge graph,” “multimodal RAG,” “AI canvas,” or “memory for every agent.” Those are implementation ingredients or crowded categories, not the product.
