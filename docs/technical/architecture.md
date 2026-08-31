# Architecture

## Recommended foundation

```text
Browser / WebMCP
        ↓
Cloudflare Worker
        ↓
per-user or per-space Durable Object
        ├── SQLite
        │   ├── spaces, regions, projects
        │   ├── items and edges
        │   ├── human shares and agent grants
        │   ├── tasks, artifacts, and versions
        │   ├── annotations and decisions
        │   ├── taste signals and proposals
        │   └── provenance and audit events
        ├── R2
        │   ├── images and screenshots
        │   ├── PDFs and presentations
        │   ├── code packages
        │   └── artifact render assets
        └── Vectorize / Workers AI
            ├── embeddings
            ├── semantic retrieval
            ├── OCR and descriptions
            └── summaries and candidate signals
```

Workers handle application endpoints, WebMCP execution, connector logic, authentication integration, and processing orchestration.

Durable Objects and SQLite hold strongly consistent scope, grants, task state, proposals, review state, graph edges, and audit records.

R2 holds blobs. Vectorize or an equivalent semantic index supports retrieval. Workers AI or replaceable model services may perform derived processing.

## Tenancy boundary

The implementation must define whether the consistency and storage unit is a user, space, or another partition. Shared spaces and projects require deliberate cross-user access without duplicating canonical data or collapsing all user data into one broad authority domain.

Whichever partition is selected, the external model should remain:

- Personal spaces owned by one user.
- Shared spaces with explicit roles.
- Projects that reference permitted objects.
- Agent grants bound to tasks and invoking humans.

## Storage security

```text
WebMCP call
→ authenticate human and identify agent/client
→ resolve current task and grant
→ authorize requested scope and operation
→ resolve context or mutation service
→ access storage/source with server credentials
→ minimize and label result
→ return to agent
```

Agents never receive raw database, R2, connector, or source credentials. Blob URLs must be scoped and time-limited when direct delivery is necessary.

## Locked-region browser boundary

Folder locks are security boundaries, not visual decoration. When an agent lacks access to a region:

- The Worker rejects direct route, API, asset, search, relationship, and preview requests for that region.
- The agent-facing document omits the region's descendants, content, URLs, titles, counts, and prefetch links. A lock indicator may remain without navigable contents.
- Locked descendants are absent from the DOM, accessibility tree, client state, hydration payload, page source, and WebMCP schemas.
- No client-side CSS, disabled button, pointer-events rule, or obscured element is treated as authorization.
- Every WebMCP call and every ordinary HTTP request re-checks the current agent grant and human access.
- Revocation invalidates issued asset URLs and denies stale requests.

If a browser agent shares the exact same fully privileged human session, the application cannot cryptographically distinguish an agent click from a human click. A real guarantee therefore requires an agent-scoped session/capability token and a restricted agent-facing presentation, or browser-level isolation. Cloudflare Browser Isolation can provide an isolated remote browser for active content, but it does not replace application authorization; the Worker remains the final enforcement point.

## Artifact processing

- Store the original artifact where permitted.
- Generate safe, deterministic viewer representations.
- Extract format-aware structure for annotation and retrieval.
- Record hashes, version relationships, source task, and render status.
- Treat artifact content as untrusted.
- Separate display from execution.

Active webpage/component previews require a sandboxed execution boundary with restrictive defaults for network, storage, navigation, downloads, clipboard, and host communication.

## Processing jobs

Long-running work may include:

- PDF extraction and thumbnails.
- Presentation normalization.
- Image OCR and description.
- Semantic indexing.
- Artifact rendering.
- Taste candidate derivation.

Jobs should be idempotent, cancellable where practical, observable, and safe to retry. Canonical item creation should not depend on every derived process succeeding.

## Connector abstraction

Future sources can implement a small interface such as:

```text
SourceConnector
├── list()
├── fetch()
├── normalize()
├── resolve()
├── refresh()
└── revoke()
```

Source-linked records preserve external identifiers, canonical URLs, permitted metadata, refresh status, and provenance.

The first pass should not prioritize a broad connector marketplace. Native capture plus a small number of strategically useful imports is enough to validate the architecture.

## Search and indexing

Maintain separate concerns:

- Canonical relational data in SQLite.
- Explicit relationships as edges.
- Blob content in R2.
- Derived text and metadata for full-text search.
- Optional embeddings in a semantic index.

Every index entry must carry enough stable identity and scope metadata for authorization to be applied before content is returned.

## Real-time state

Permission, proposal, task, annotation, and review changes should update connected clients promptly. The capability compiler must consume the same authoritative state rather than a parallel client-side copy.

Real-time collaboration needs:

- Optimistic low-risk annotations.
- Stable identifiers.
- Conflict detection for edited comments and canonical content.
- Attributed events.
- Resumable clients after reconnect.

## Auditability

Audit events are product data, not debug logs. They should be structured, privacy-aware, queryable by authorized users, and retained according to explicit policy.

Sensitive retrieved content should not be copied wholesale into audit records. Store identifiers, operation, result class, timing, and safe explanatory metadata.

Multi-agent history is a final V1 capability. Store an append-only event ledger for human, agent, and system actions. Bind agent events to an authenticated `agent_session_id`, human, and task; treat provider/client/model declarations as attribution only, never as authorization. Provider metering, spend limits, and quota accounting are outside this V1 slice.

## Portability

The architecture should avoid making human context inseparable from one agent or model provider. Export and deletion are long-term requirements even if the full workflows are deferred.
