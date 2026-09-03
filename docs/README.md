# Documentation

GoToTheArchive is a human-owned platform for context, artifacts, and taste. You
curate the material, lend the relevant parts to an agent for one task, review
what it produces with visible provenance, and turn feedback into taste you
control.

- **[For judges](judges.md)** — what the demo contains and the flow to walk.
- **[Judge demo access](roadmap/judge-demo-access.md)** — how the shared,
  no-account demo works and why a demo identity can never reach a real archive.
- **[Build contract](technical/BUILD-CONTRACT.md)** — the invariants the whole
  build compiles against, alongside `shared/contract.ts` and
  `worker/db/schema.sql`.
- **[WebMCP capability layer](technical/webmcp-capability-layer.md)** — how app
  state compiles into dynamic tools and region-constrained schemas, and how
  revocation is enforced.
- **[Architecture](technical/architecture.md)** — the Cloudflare-native shape:
  Durable Object + SQLite, R2, retrieval, jobs, safety.

When guidance conflicts: the user's most recent explicit request, then
[`AGENTS.md`](../AGENTS.md), then these documents, then the code.
