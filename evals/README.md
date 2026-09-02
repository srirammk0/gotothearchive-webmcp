# WebMCP evals

Two layers, matching the split in the [Chrome WebMCP evals guidance](https://developer.chrome.com/docs/ai/webmcp/evals): deterministic tests of the tools themselves, and probabilistic tests of whether a model drives them correctly.

## 1. Surface test (deterministic, no model)

`surface.test.ts` pins the agent-visible tool surface for a given permission state. It runs in the normal suite:

```bash
bun test evals/surface.test.ts
```

It asserts the invariant the whole product rests on — the tool surface is exactly
`min(human access, live grant) ∩ task ∩ page state`:

- a `read` grant exposes the six read tools and none of the propose tools
- `get_context_for_task`'s `region` enum contains exactly the granted, human-reachable regions
- revoking a region drops it from the enum on the next `compile()`
- a grant can never exceed the invoking human's own access
- `trace_artifact_influences` appears only while an artifact is open
- `approve_proposed_changes` / `reject_proposed_changes` are never compiled, at any level
- every tool carries the Chrome WebMCP annotations (`readOnlyHint`, `untrustedContentHint`) and stays within the name/description character budgets

The server re-checks every one of these on every call (`worker/mcp.ts`, `worker/permissions.ts`); the surface test only proves the *hint* surface agrees with the enforcement.

## 2. Model evals (probabilistic, live session)

`cases.json` is a set of `{ messages, expectedCall }` fixtures in the format the
Chrome WebMCP Evals CLI consumes. Each case names the tool call a correctly
behaving agent should make against the tools this site registers.

To run them you need a WebMCP-capable agent pointed at a live session:

1. `bun run dev`, sign in, create a task, grant **Work** and **Inspiration** at `read`, open one artifact in the Workbench.
2. Point the [WebMCP Evals CLI](https://github.com/GoogleChromeLabs/webmcp-tools) at the page and feed it `cases.json`.

The negative cases (`no self-approval`, `revoked region is not retrievable`)
have an empty `expectedCall`: the correct behaviour is to *not* call a tool and
to tell the user why. The `revoked region` case must be run with **Personal** at
`none`.
