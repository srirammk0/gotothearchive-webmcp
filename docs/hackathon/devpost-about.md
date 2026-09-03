# About GoToTheArchive

## Inspiration

Context is probably the biggest problem with agents today. Every agent wants to remember more about you, but that memory ends up buried in a local database or a hosted service you never really see or control.

I think context is only the starting point. The thing agents should actually be working toward is taste: the judgment behind what you save, what you reject, and what you keep asking them to change.

That led to the main idea behind GoToTheArchive. Your agents should not each own a hidden model of you. You should own the Archive, and decide what any agent gets to see, one task at a time.

## What it does

GoToTheArchive is a human-owned platform for context, artifacts, and Taste.

The Archive is a clean visual space for images, webpages, documents, notes, references, and previous work. It is useful on its own, even when no agent is connected.

When I want an agent to help, Agent Access lets me choose exactly what it can view, contribute to, or edit for that task. WebMCP turns those choices into the agent's real tool surface. The tools it can call, and the regions inside each tool's schema, are exactly what I have granted right now. If I remove access, they change with it, and the change is enforced on the server, not just drawn in the interface.

The agent works from the context I allowed and returns its result to the Workbench as a versioned artifact. I can see what it accessed, which references actually influenced the result, and who made it. From there I annotate it, approve it, reject it, or ask for another version. Component artifacts run live in the Workbench so I can actually click through what the agent built.

The agent can then read that feedback and propose a Taste signal, tied to the exact annotations behind it. Nothing silently becomes part of my profile. I edit the wording, change the scope, reject it, or confirm it for future tasks.

## Why WebMCP matters here

WebMCP is not something I bolted on at the end so an agent could click around the site. It is the reason the product can work this way.

The same interface where I organize my Archive is the one that controls what the agent can do. GoToTheArchive registers, updates, and removes WebMCP tools based on my access, the agent's grant, the active task, the open artifact, and whether a grant has expired or been revoked. Agent Lens shows this live state for anyone who wants the technical view, without turning the rest of the product into a developer console.

Revocation goes deeper than hiding items. A Taste signal is a compressed version of the material behind it, so if a folder taught a preference, revoking that folder also takes the preference out of what the agent retrieves. The backend re-checks every operation, so a cached schema or a call that was valid a second ago cannot get through a revoked grant. Private material is removed before retrieval, never ranked lower.

The demo makes the point in one screen. It is a single shared Archive that every visitor lands in with no account. Two people can point two different agents at it at the same time. Each agent's authority is its own. If one person revokes a folder for their task, the other person's agent loses nothing.

## How I built it

The frontend is React, TypeScript, Vite, Tailwind, and Motion.

The backend runs on Cloudflare Workers. A single Durable Object with SQLite holds Archives, regions, tasks, grants, artifacts, annotations, Taste signals, provenance, and audit history. Because it is one object, concurrent writes from several people and their agents are consistent by construction. R2 stores original media. Workers AI produces structured visual descriptions where they help.

I built a capability compiler that turns the current application state into WebMCP tools and region-constrained schemas. Retrieval combines full-text search, recency, explicit context relationships, confirmed Taste, and permission filtering, in that order, with permission first.

The Workbench handles immutable artifact versions, targeted annotations, review decisions, influence records, and sandboxed previews. The no-account demo is seeded from a real reference folder, with palettes measured from the actual pixels and visual descriptions carrying their model provenance, so it is real product state and not fixtures.

## Challenges I ran into

The hardest part was making permissions real everywhere. The interface, the WebMCP tools, retrieval, the context graph, and server authorization all had to agree, including in the moment right after access is revoked.

Multimodal context was the next one. Images are a huge part of how people communicate taste, but the WebMCP tool model is mostly built around JSON-shaped inputs and outputs. I had to resolve media safely, keep the original source separate from anything derived, give the agent a structured representation, and record where every derived detail came from.

Taste was the one I got wrong first. I actually built server-side taste derivation before anything else. It grouped my annotations by topic and wrote the preference sentence itself, from a template. The output was things like "Leans away from the current typography on posters." Vague, and exactly the background guessing I built this project to avoid. So I deleted it. Now a Taste signal exists only because an agent read my feedback and named the pattern with evidence, or because I wrote it by hand. The server's only job is to keep that evidence honest when I edit a note.

## What I learned

WebMCP can be much more than a cleaner way for agents to operate websites. It can make a web interface the shared control surface between a person and an agent, where the same action that organizes your work also sets the boundary.

Schemas are good at communicating authority but they cannot replace runtime enforcement. Provenance matters as much as retrieval: people need to know not just what an agent read, but what actually shaped the thing it made.

I also ran the project through an external WebMCP audit and fixed what it found, mostly around when tools register on load and how tool descriptions are written. It made the surface noticeably tighter.

And personalization gets far more useful when it stays visible, editable, and reversible.

## What I am proud of

* A complete Archive to agent to Workbench to feedback to Taste loop
* Dynamic WebMCP tools and region-constrained schemas
* Real runtime revocation and permission-first retrieval
* Revocation that also withdraws the Taste a revoked folder taught
* Taste that only comes from an agent or a human proposing it, never the server
* Versioned artifacts with accessed-versus-influential provenance
* Sandboxed component previews you can actually interact with
* A shared no-account demo where several agents can work the same Archive at once
* 173 automated tests covering the core security and collaboration behavior

## Contributing back to WebMCP

Building this showed me a few places where WebMCP could grow for products built around visual and multimodal context. Today every developer invents their own conventions for representing images, files, previews, media provenance, and instructions pulled out of media, and every client has to guess what it received.

I want to write up what I learned as reproducible examples and issues, covering multimodal tool inputs and outputs, provenance for text derived from media, safe handling of temporary and permission-scoped asset URLs, and how a client should behave when an agent still holds an older schema after access changed. The goal is not for WebMCP to transport raw files. It is for multimodal tools to be predictable enough that everyone is not reinventing the representation.

## What is next

Richer PDF and presentation understanding, more context connectors, portable Archive exports, and human collaboration through Shared spaces and an Inbox.

The bigger goal does not change. Your agent should not own a hidden model of you. You own the Archive, you decide what gets shared, and you control what becomes Taste.
