# GoToTheArchive

Human-owned context, artifacts, and taste — built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/).

**Live:** https://gotothearchive.srirammk-6.workers.dev — opens straight into a
shared, no-account demo archive. Members sign in from the top bar. See
[`docs/judges.md`](docs/judges.md) for what the demo contains.

## The idea

Agents increasingly have access to your context. You rarely have an intuitive way to
control what they may use. GoToTheArchive makes permission and capability the same
thing: when you change what an agent may reach, the tools it can actually call change
with it — immediately, and enforced at the server.

Flip a folder lock from **Can view** to **No access**, and the WebMCP tool the agent
was using is unregistered. Its schema's region list shrinks in Chrome's WebMCP DevTools
panel. A repeated call that succeeded a moment ago is refused, and the refusal is
recorded and shown.

```
effective authority = invoking human's access ∩ explicit agent grant
                    ∩ current task scope ∩ current page state ∩ runtime policy
```

## Surfaces

- **Archive** — capture, organize, relate, and revisit your material.
- **Workbench** — review agent-created artifacts with real provenance: what was *used*,
  what was merely *accessed*, and what was *denied*.
- **Taste** — evidence-backed preference proposals you confirm, edit, or reject. Nothing
  is inferred from silence.
- **Agent Access** — a contextual panel showing, in plain language, what the agent may
  currently use. Agent Lens sits inside it for the technical view.

## Local development

```bash
bun install
cp .env.example .env.local
cp .dev.vars.example .dev.vars
bun run dev
```

Enable WebMCP in Chrome via `chrome://flags/#enable-webmcp-testing`, or open the site in
the ChatGPT desktop app browser, which supports it without a flag.

`.env.local` holds `VITE_CLERK_PUBLISHABLE_KEY` (client). `.dev.vars` holds
`CLERK_SECRET_KEY` and `BLOB_SIGNING_SECRET` (worker) — use a long random value
for the signing secret and never commit it. `BLOB_SIGNING_SECRET` signs
short-lived blob URLs and demo session cookies.

Signed out, the app sends you through `/api/demo-entry` into the shared demo
archive. It is confined to the fixed `kind: "guest"` demo Space and cannot
address a member's personal Space — see
[`docs/roadmap/judge-demo-access.md`](docs/roadmap/judge-demo-access.md). Members
sign in with Clerk from the top bar.

The `SPACE` Durable Object, `BLOBS` R2 bucket, Workers AI, and edge rate-limit
bindings are declared in `wrangler.jsonc`.

## Deployment

The deployment target is Cloudflare Workers. After authenticating Wrangler:

```bash
bunx wrangler r2 bucket create gotothearchive-blobs
bunx wrangler secret put CLERK_SECRET_KEY
bunx wrangler secret put BLOB_SIGNING_SECRET
bun run deploy   # VITE_CLERK_PUBLISHABLE_KEY is read from .env.local at build time
```

The bucket-create command is needed only once. To reproduce the seeded judge
Archive, upload the repository's `demo-assets/` files to the fixed read-only
prefix used by `worker/db/demo-seed.ts`:

```bash
for file in demo-assets/*; do
  bunx wrangler r2 object put "gotothearchive-blobs/demo/$(basename "$file")" \
    --file "$file" --remote
done
```

The demo cookie is `Secure`, so the demo flow needs HTTPS. Before sharing a
deployment, open it signed out and verify Archive, Workbench, Taste, Agent
Access, and Agent Lens all load.

## Checks

```bash
bun run build
bun run lint
bun test
```

## Architecture

Cloudflare Worker + Durable Object with SQLite for strongly-consistent permission, task,
and review state; R2 for canonical originals. Retrieval filters by permission *before*
generating candidates — an inaccessible item is absent, never low-ranked. The context
graph re-checks access at every node, so an accessible edge can never reveal an
inaccessible one.

`docs/` is the source of truth. Start at [`docs/README.md`](docs/README.md); the frozen
implementation contract is [`docs/technical/BUILD-CONTRACT.md`](docs/technical/BUILD-CONTRACT.md).

## License

MIT
