# About GoToTheArchive

## Inspiration

Context is probably the biggest problem with agents right now, and almost every product treats it as something the agent should quietly accumulate on its own. You end up with a per-agent memory store you cannot see into, cannot correct, and definitely cannot use to decide what a specific agent gets for a specific task. I think context is only the surface of the real problem anyway. Underneath it is taste, meaning the judgment behind what you save, what you throw out, and what you keep sending back for another pass, and an agent that is actually useful to you has to be working from that rather than from a summary of your last ten prompts.

That is where GoToTheArchive started. Your agents should not each own a private model of you. You own the Archive, and the same interface where you organize it is the one that decides, task by task, what any agent is allowed to touch.

## What it does

The Archive is a plain visual workspace for your images, links, documents, notes, and prior work, and it is genuinely useful on its own with no agent connected. When you do want help, you open Agent Access and pick, per region, whether an agent can view, contribute to, or edit that part of the Archive for the current task. WebMCP takes those grants and compiles them straight into the agent's tool surface. Which tools appear on `document.modelContext`, and which regions are enumerable inside each tool's input schema, is exactly what you have granted at that moment. Narrow a grant and the tools re-register with tighter schemas. Revoke one and the affected tools are removed, not left as shells that fail on call, and the server rejects any request built against the schema the agent was still holding.

The agent works from the context you allowed and returns its result to the Workbench as an immutable, versioned artifact. You see what it retrieved, which references actually shaped the output, who produced it, and what was denied along the way. You annotate a version, mark a region on it, approve it, request changes, or reject it. If the artifact is a component it runs live in the Workbench in an isolated iframe, so you can click through what the agent built rather than looking at a screenshot of it.

From your feedback the agent can then propose a taste signal, tied to the exact annotations behind it, and nothing enters your profile until you confirm it. You edit the wording, rescope it from personal to a project, reject it, or accept it, and a confirmed signal starts steering retrieval on the next task.

## How I built it

The build restarted more than once early on. Every time I laid out the full scope an agent would decide it was too ambitious and talk me into dropping something that turned out to be load-bearing, and I would end up rebuilding it a session later. The scope was fine. The restarts were the problem. Once I locked the surface to Archive, Workbench, and Taste and stopped reopening that decision, it moved.

It runs on Cloudflare Workers with a single Durable Object holding the SQLite database for every Archive, region, task, grant, artifact, annotation, taste signal, provenance record, and audit event. One object is a real ceiling, but it also means that several people and their agents hitting the same Archive concurrently stay consistent by construction, with no coordination code, which is what makes the shared demo safe. R2 stores original media, and Workers AI produces the structured visual descriptions where they earn their keep.

The core piece is a capability compiler, a pure function that turns the current application state, meaning your access, the agent's grant, the active task, the open artifact, and any expiry or revocation, into the exact set of WebMCP tools and region-constrained schemas that should be registered right now. Retrieval is deliberately not a managed search service. A hosted index hides the permission model in something I do not control and lags on write, and that lag breaks the entire premise of flipping a lock and having the next call fail immediately. So retrieval runs directly on the database. It resolves the authorized set first, then fuses full-text search, recency, and the context graph and multiplies through authority, curation, and confirmed-taste priors. Something you cannot see is absent from the candidate list, never present with a low score.

Provenance is kept as three record types that never get collapsed into one. Influence means a reference shaped the result, access means it was retrieved for the task, and denial means it was unavailable, and only the first two show up in ordinary provenance. Taste corrections are bitemporal. A materially changed signal is not overwritten. The old row is superseded and the new one points back at it, so the Taste page can show how a judgement moved over time.

The part I got most wrong was taste itself. I built it server-side first, with a classifier that bucketed your annotations by dimension and a template that wrote the preference sentence from the most common words in the grouped notes. The output was things like "Leans away from the current typography on posters", which is vague and is exactly the kind of background inference this project exists to remove. So I deleted the whole path. A taste signal now exists only because an agent read your feedback and named the pattern with cited evidence through `propose_taste_signal`, or because you wrote it yourself, and the server's only remaining job there is to keep the evidence and confidence honest when you later edit a note.

Partway through I ran the deployed site through an external WebMCP audit and fixed what it flagged, most of it around when tools register on first paint and where instruction-shaped text was leaking into tool descriptions instead of staying declarative. It tightened the surface noticeably.

## Challenges I ran into

The hardest was making permission real in every layer at once. The interface, the compiled tool surface, retrieval, the context graph, and server authorization all had to agree, including in the second immediately after a revoke, and any one of them lagging would have made the whole claim a demo trick.

Multimodal context was the next one. Images are how people actually communicate taste, but WebMCP is shaped around JSON-compatible inputs and outputs. I had to resolve media through short-lived signed URLs, keep the canonical original separate from every derived caption and palette, give the agent a structured representation it can reason over, and record the provenance of every derived field so a wrong value is visible rather than mysterious. Component artifacts added their own problem, since running agent-authored HTML meant an opaque-origin sandbox with a locked-down content security policy that still had to permit real fonts and the CDN scripts a component genuinely needs.

And revocation had to go deeper than hiding items. A taste signal is a compressed version of the material behind it, so if a folder taught a preference, revoking that folder has to withdraw the preference from what the agent retrieves, not just the folder's contents.

## What I learned

WebMCP can be much more than a cleaner way for an agent to operate a website. It can make the page itself the shared control surface between a person and an agent, where the action that organizes your work is the same action that sets the agent's boundary, and that framing changes what a web app is for in a multi-agent world. I also learned that a schema is good for communicating authority and useless for enforcing it, so every operation has to be re-checked at runtime, and that provenance matters as much as retrieval, because people need to know what shaped a result and not only what the agent opened.

## Contributing back to WebMCP

Building this made it clear that WebMCP has real gaps for anything visual or multimodal, and right now every developer is inventing their own conventions for representing images, files, previews, and instructions extracted from media, while every client is left guessing what it received. I want to write up what I ran into as reproducible examples, proposed conformance tests, implementation notes, and issues against the spec, covering standard patterns for multimodal tool inputs and outputs, explicit provenance for text and metadata derived from media, safe handling of temporary and permission-scoped asset URLs, expected client behavior for previewing or returning a visual artifact, dynamic capability updates after an access change, and revocation semantics for the case where an agent still holds an older schema. The goal is not for WebMCP to transport raw files itself. It is for multimodal tools to be predictable enough that the representation stops being something each team reinvents.

## What is next

Richer PDF and presentation understanding, more context connectors, portable Archive exports, and real human collaboration through Shared spaces and an Inbox. The goal does not change. Your agent should not own a hidden model of you. You own the Archive, you decide what gets shared, and you control what becomes taste.
