# Submission checklist

The product build passes `bun run build`, `bun run lint`, and `bun test`
(173 tests). What remains before submitting is external.

## Must close

- **Demo video.** Public, under three minutes, with audio. Show the real product
  and say why the interaction needs WebMCP specifically.
- **Devpost entry.** Complete the submission form with the live app URL, public
  repository, public YouTube URL, a WebMCP-focused description, implementation
  notes, and concise judge testing instructions.
- **Media rights.** Confirm every image in `demo-assets/` can be redistributed
  publicly. A linked source post is not redistribution permission; replace
  anything uncertain.

The repository is public, works while signed out, and GitHub detects its MIT
license.

## Should close

- Move Clerk to a production instance and key (the demo path does not need Clerk,
  but the member sign-in path logs the development-instance warning otherwise).
- Run the full showcase once from a clean browser: open the demo, grant Work and
  Inspiration with Personal left at none, retrieve, record an artifact, annotate,
  have the agent inspect that feedback and call `propose_taste_signal`, review
  the proposal, revoke Inspiration, and show the tool scope changing.
- Check the Devpost copy against the real tool surface. Do not claim shipped
  human sharing, embeddings, PDF visual extraction, model forgetting after
  revocation, or arbitrary bytes travelling over WebMCP.

## Release check

```bash
bun run build && bun run lint && bun test && git diff --check
```

Then: production root returns 200; `/api/demo-entry` establishes demo mode and
lands in the archive; Archive, Workbench, Taste, Stats, Agent Access and Agent
Lens load; no horizontal overflow at 390px; keyboard focus is visible and stays
inside dialogs; the public repo and video URLs work while signed out.
