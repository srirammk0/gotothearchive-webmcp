# GoToTheArchive

Human-owned context, artifacts, and taste — built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/).

**Live:** https://gotothearchive.srirammk-6.workers.dev

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
bun run dev
```

Enable WebMCP in Chrome via `chrome://flags/#enable-webmcp-testing`, or open the site in
the ChatGPT desktop app browser, which supports it without a flag.

Add `VITE_CLERK_PUBLISHABLE_KEY` to `.env.local` for sign-in. Without it the app runs in
guest mode, which is also how the public demo works.

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
