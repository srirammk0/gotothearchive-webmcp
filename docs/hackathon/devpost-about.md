# About GoToTheArchive

## Inspiration

Context is probably the biggest problem with agents today. Every agent is trying to remember more about you, but that memory usually ends up buried in a local database or managed service that you never really see or control.

I think context is only the starting point. What agents should actually be working toward is taste. Taste is the judgment behind what you save, what you reject, and what you keep asking them to change.

That led to the main idea behind GoToTheArchive: your agents should not each own a hidden model of you. You should own the Archive.

## What it does

GoToTheArchive is a human-owned platform for context, artifacts, and Taste.

The Archive is a clean visual space for organizing images, webpages, documents, notes, references, and previous work. It is useful on its own, even when no agent is connected.

When I want an agent to help, Agent Access lets me choose exactly what it can view, contribute to, or edit for that task. WebMCP turns those choices into the agent's real tool surface. If I remove access, the tools and schemas change with it.

The agent can use the context I allowed and return its work to the Workbench as a versioned artifact. I can see what it accessed, which references actually influenced the result, and who created it. From there I can annotate it, approve it, reject it, or ask for another version.

The agent can then inspect that feedback and propose a Taste signal connected to the exact evidence behind it. Nothing silently becomes part of my profile. I can edit the wording, change its scope, reject it, or confirm it for future tasks.

## Why WebMCP matters

WebMCP is not something I added at the end so an agent could click around the site. It is the reason the product can work this way.

The same interface where I organize my Archive also controls what the agent can actually do. GoToTheArchive dynamically registers, removes, and updates WebMCP tools based on my access, the agent's grant, the active task, the open artifact, and whether a grant has expired or been revoked.

Agent Lens exposes this live state for anyone who wants the technical view. It shows the available tools, their scope, and recent activity without turning the rest of the product into a developer console.

The backend still checks every operation. A cached schema or previously valid call cannot bypass a revoked grant. Private material is removed before retrieval, not simply ranked lower.

## How I built it

The frontend is built with React, TypeScript, Vite, Tailwind CSS, and Motion.

The backend runs on Cloudflare Workers. A Durable Object with SQLite stores Archives, regions, tasks, grants, artifacts, annotations, Taste signals, provenance, and audit history. R2 stores original media, and Workers AI helps produce structured visual descriptions where needed.

I built a capability compiler that converts the current application state into WebMCP tools and constrained schemas. Retrieval combines full-text search, recency, explicit context relationships, confirmed Taste, and permission filtering.

The Workbench supports immutable artifact versions, targeted annotations, review decisions, influence records, and sandboxed webpage previews. I also built a shared no-account demo so judges can try the full product without setting anything up.

## Challenges I faced

The hardest part was making permissions real everywhere. The interface, WebMCP tools, retrieval system, context graph, and server authorization all had to agree, including immediately after access was revoked.

Multimodal context was another challenge. Images are a huge part of how people communicate taste, but the current WebMCP tool model is mainly structured around JSON-compatible inputs and outputs. I had to resolve media safely, keep the original source separate, create structured representations for the agent, and preserve where every derived detail came from.

Taste was also easy to get wrong. Automatically generating a profile in the background would recreate the exact problem I was trying to solve. In GoToTheArchive, the server never invents a preference. An agent or human has to propose one from visible evidence, and only the human can confirm it.

## What I learned

I learned that WebMCP can be much more than a better way for agents to operate websites. It can make a web interface the shared control surface between a person and an agent.

I also learned that schemas are useful for communicating authority, but they cannot replace runtime enforcement. Provenance matters just as much as retrieval. People need to know not only what an agent accessed, but what actually shaped the thing it made.

Most importantly, personalization gets much more useful when it stays visible, editable, and reversible.

## What I am proud of

* A complete Archive to agent to Workbench to feedback to Taste loop
* Dynamic WebMCP tools and region-constrained schemas
* Real runtime revocation and permission-first retrieval
* Evidence-backed Taste proposals with human confirmation
* Versioned artifacts with accessed versus influential provenance
* Sandboxed interactive webpage previews
* A public no-account demo
* 173 automated tests covering the core security and collaboration behavior

## Contributing back to WebMCP

Building this exposed a few areas where I think WebMCP can grow, especially for products built around visual and multimodal context.

Right now, developers have to create their own conventions for representing images, files, previews, media provenance, and instructions extracted from media. There are also open questions around how agents should understand when a media URL is temporary, when derived text is untrusted, and how a client should display or return a multimodal artifact.

I plan to contribute what I learned back to WebMCP through reproducible examples, proposed tests, implementation notes, and issues covering:

* Standard patterns for multimodal tool inputs and outputs
* Clear provenance for text or metadata derived from media
* Safe handling of temporary and permission-scoped asset URLs
* Client behavior for previewing or returning visual artifacts
* Dynamic capability updates after access changes
* Revocation behavior when an agent still holds an older schema

The goal is not to make WebMCP transport every raw file itself. The goal is to make multimodal tools predictable and interoperable, so every developer does not have to invent a different representation and every agent client does not have to guess what it received.

## What is next

Next I want to add richer PDF and presentation understanding, broader context connectors, portable Archive exports, and human collaboration through Shared spaces and Inbox.

The bigger goal stays the same: your agent should not own a hidden model of you. You should own the Archive, decide what gets shared, and control what becomes Taste.
