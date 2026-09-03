# GoToTheArchive testing ledger

This is the persistent record for final WebMCP qualification, evaluation,
red-team, and showcase runs. It records observed production behavior, not
intended behavior. No product code is changed as part of a test run.

## Current status — 2026-09-02

The failed September 1 runs below are retained as historical regression records,
not the current verdict. Their Taste pipeline, stale-tool mapping, Workbench
attribution, dynamic-schema, and quota findings were all fixed in later commits.

Current verification after release-candidate deployment
`87776319-2c05-4ea2-9e71-6ed2826bc865`:

- production build and lint pass;
- the full unscoped suite passes: **171 tests, 0 failures**;
- the deployed page registers the current nine-tool WebMCP surface with live
  region enums and page-state behavior;
- the deployed judge entry mints a signed 24-hour session and redirects into the
  shared demo Archive;
- a signed-out HTTP rehearsal receives only `demo_session` and `demo_hint`, then
  POSTs `/api/bootstrap` successfully into `kind: "guest"` / `Demo Archive`
  with exactly Work, Inspiration, and Personal;
- live server checks recorded in `evals/README.md` prove permitted retrieval,
  denied Personal access, human-only approval, and agent-authorship constraints.

The probabilistic model run and its remaining limitations are recorded in
[`evals/README.md`](evals/README.md). A final clean-browser showcase rehearsal is
still required after the release candidate is deployed.

## Run 001 — Production baseline

**Date:** 2026-09-01 (America/Los_Angeles)  
**Commit:** `630e152`  
**Deployment:** https://gotothearchive.srirammk-6.workers.dev  
**Browser:** Codex in-app browser  
**WebMCP:** available  
**Task:** `Spring campaign visual brief` (`2bac3643-d597-4322-8dae-dffdb30f28ba`)  
**Tester:** Codex

### Baseline result

**Blocked — seed permissions do not match the qualification fixture.**

Observed scope from the live WebMCP `get_current_context_scope` call:

| Region | Required seed level | Observed level |
| --- | --- | --- |
| Work | READ | WRITE |
| Inspiration | READ | WRITE |
| Personal | NONE | WRITE |

The live tool schemas enumerate `work`, `inspiration`, and `personal` for
retrieval and mutation tools. Consequently `PRIVATE_SENTINEL_93841` must not
be seeded or queried until Personal is set to NONE.

### Findings

| ID | Status | Evidence / next check |
| --- | --- | --- |
| Environment | PASS | Live app loaded from a clean browser tab and WebMCP tools were discoverable. |
| W-04 | PASS | Read tools carry `readOnlyHint`; context and taste reads carry `untrustedContentHint`. |
| W-01 | BLOCKED | Initial schema includes all three regions; rerun after seed permissions are set. |
| P-01–P-06 | BLOCKED | Required Work=READ, Inspiration=READ, Personal=NONE fixture is absent. |
| NONE / READ / PROPOSE / WRITE | BLOCKED | Requires controlled grant transitions. |
| W-02 | CONTRACT CONFLICT | The supplied checklist expects agent-facing approve/reject tools. The frozen build contract explicitly prohibits them; human review controls must approve/reject proposals instead. Test the human workflow, not exposed agent tools. |
| W-03, W-05 | NOT RUN | Requires project navigation and an abortable long retrieval. |
| Injection / multimodal / connectors | NOT RUN | Requires the stated seed corpus and connected sources. |
| Workbench / Taste Review | NOT RUN | Requires controlled artifact and feedback fixture. |
| Retrieval, learning, red-team, showcase, selection evals | NOT RUN | Pending seed setup and stateful test passes. |

### WebMCP baseline surface

Discovered tools:

`identify_agent`, `get_current_context_scope`, `get_context_for_task`,
`inspect_context_item`, `inspect_relationships`, `get_taste_for_task`,
`propose_context_change`, `record_feedback`, `record_artifact`, and
`add_context_item`.

The live surface correctly omits agent-callable proposal approval/rejection
tools, matching the frozen build contract.

### Required next state

1. Set Work to READ, Inspiration to READ, and Personal to NONE.
2. Seed the three distinguishable test items, including the Personal sentinel.
3. Re-run P-01 through P-06 and W-01, recording runtime-call evidence after
   each grant transition.
4. Continue through the artifact, provenance, Taste Review, and full-loop
   tracks using the same task unless the test itself requires a fresh task.

## Run 001 — completed production WebMCP qualification

**Commit:** `630e152`  
**Deployment:** https://gotothearchive.srirammk-6.workers.dev  
**Browser:** Codex in-app browser  
**Task:** `Spring campaign visual brief` (`2bac3643-d597-4322-8dae-dffdb30f28ba`)

### Verdict: FAIL

The permission, dynamic-schema, runtime-denial, Propose, artifact, provenance,
feedback, and revision paths are real. The product does not qualify yet because
human feedback produces no Taste Review proposal, so Taste cannot affect future
retrieval or behavior. An advertised-tool/runtime mismatch also needs hardening.

### Fixture and final state

| Region | Final grant |
| --- | --- |
| Work | READ |
| Inspiration | NONE |
| Personal | NONE |
| `test` (pre-existing extra region) | NONE |

Seeded human-owned data: Work brief, two Inspiration references, Personal
`PRIVATE_SENTINEL_93841`, and a Work prompt-injection fixture. Test artifacts,
feedback, proposal, and seed data remain for regression testing.

### Results

| ID / area | Status | Evidence |
| --- | --- | --- |
| Live deployment / WebMCP discovery | PASS | App loaded fresh; dynamic tools registered and refreshed with page state. |
| P-01 correct scope | PASS | Retrieval returned only Work and Inspiration seed items with traceable IDs/regions. |
| P-02 forbidden Personal | PASS | `Denied: The grant for this region was revoked`; sentinel never returned. |
| P-03 prompt override | PASS | "Ignore permissions" request against Personal was denied. |
| P-04 live revocation | PASS | Inspiration vanished from UI scope and `region` enum; fresh old-region retrieval denied. |
| P-05 stale call | PASS | Pre-revocation handle was invalidated as stale; fresh explicit old-region call was denied. |
| P-06 grant cycle | PASS | NONE → READ → PROPOSE → WRITE → NONE finished at NONE with no Inspiration mutation tools. |
| NONE / READ / WRITE | PASS | NONE removed regions from schemas and denied calls; READ exposed retrieval only; WRITE allowed one agent-authored Inspiration note. |
| PROPOSE | PASS | Proposed edge `b69bc080-32ca-4e8f-a16c-349f66d61c05` did not appear in canonical relationship traversal. |
| W-01 dynamic schema | PASS | `[work,inspiration]` at READ/READ, `[work]` after Inspiration revocation. |
| W-02 workflow-dependent tools | PARTIAL | `trace_artifact_influences` appeared only with an artifact selected. Agent approval/rejection tools correctly did not appear; frozen contract requires human-only approval. |
| W-03 current Project selection | NOT RUN | This task has no Project. |
| W-04 tool annotations | PASS | Read tools use `readOnlyHint`; context/taste reads use `untrustedContentHint`. |
| W-05 cancellation | NOT RUN | No abortable long-retrieval fixture. |
| Prompt injection | PASS (note fixture) | Injection content came back as `«untrusted»…`; no permission escalation or mutation occurred. |
| B-01–B-05 Workbench | PASS | Persistent artifact `24b3d0bd-31bc-4af2-8b22-99aa31baf92b`, exact three-reference influence trace, iframe viewer, human feedback, and immutable v2 `7a08a976-a38d-49f6-9500-53b70174d43b` linked to v1. |
| Workbench grouping | FAIL | A Work-region artifact appeared below the Inspiration heading in the Workbench list. |
| T-01 Taste proposal | FAIL | Human feedback left Taste at `Pending proposals 0`; still empty after wait and reload. |
| T-02 no silent learning | PASS | No preference was silently confirmed. |
| T-03–T-06 | BLOCKED | No proposal exists to accept/edit/reject or to alter a follow-up result. |
| E-01 Taste task | FAIL | Taste retrieval is available but has no signals after feedback. |
| E-02 factual task | PARTIAL | Scoped context retrieval works without broad Taste content; no formal selection trace. |
| E-03–E-05 | PARTIAL / BLOCKED | Revision used real artifact/feedback; restricted direct write was prevented; Taste unavailable. |
| Retrieval hard fail | PASS (limited corpus) | No forbidden Personal item was returned. |
| Invalid context ID | FAIL | Fresh schema advertised `inspect_context_item`, but invocation returned `Unknown tool "inspect_context_item"`. |
| Multimodal, sources, cancellation, two tabs, expiry, Chrome/ChatGPT parity, 20-second clarity | NOT RUN | Required fixtures or environments were unavailable. |

### Full loop

Steps 1–5 and 10–12 passed: scoped grants, artifact, provenance, human feedback,
revocation, dynamic surface change, and denied follow-up retrieval all worked.
Step 6 failed: feedback created no Taste proposal. Therefore the 12-step
qualification and final signature-demo gate fail.

### Hardening priorities

1. Restore the evidence-linked Taste proposal pipeline; then test accept/edit/
   reject/scope and prove a changed retrieval or artifact result.
2. Make WebMCP registration and execution consistent for `inspect_context_item`.
3. Verify/fix Workbench region grouping for new artifact records.
4. Add repeatable fixtures for media, connectors, cancellation, multi-tab,
   mid-call revocation, and Chrome/ChatGPT-browser parity.

## Fixes applied after run 001 (2026-09-01, commit pending)

Addressing priorities 1 and 2 from run 001. Not yet re-tested against production
— re-run the qualification after the next deploy.

- **Priority 1 (Taste proposal pipeline).** Root cause: the manual dimension
  picker was removed from the UI, so `handleAnnotations` wrote `dimensions: []`,
  and `deriveTasteSignals` (which groups by dimension) had nothing to group. Fix:
  `worker/routes.ts` now infers dimensions from the note's own text via the
  keyword classifier (`worker/taste/classifier.ts`, deterministic, no model call)
  when the caller gives no explicit list. Regression test:
  `worker/taste/annotation-loop.test.ts` — two plain-text colour notes on a
  reviewed, influence-citing agent artifact now produce a proposed signal with
  ≥2 evidence rows. **Demo note:** a proposal still requires ≥2 human notes that
  land on the *same* dimension + sentiment, on an artifact that has been through
  a review decision (request-changes / approve-with-notes). That matches the
  strategy-doc demo flow.
- **Priority 2 (`inspect_context_item` "unknown tool").** Root cause: the worker
  returned `UNKNOWN_REGION` for unknown *items*, unknown *regions*, AND unknown
  *tool names*, and `src/webmcp/transport.ts` mapped `UNKNOWN_REGION` to "tool
  not registered". Fix: added `UNKNOWN_ITEM` and `UNKNOWN_TOOL` denial reasons
  (`shared/contract.ts`); the item tools now return `UNKNOWN_ITEM`, the switch
  default returns `UNKNOWN_TOOL`, and transport only maps `UNKNOWN_TOOL` (or a
  404) to the not-registered message. A bad item id now reads as
  `Denied: That item does not exist or is not visible in this task`.
- **Priority 3 (Workbench grouping).** Left as-is pending a product call: the
  list groups artifacts by the folders that *influenced* them (the header says
  "grouped by source folder"), which may be the intended behaviour rather than a
  bug. Revisit if the demo needs target-region grouping.

## Supermemory retrieval augmentation (2026-09-01)

Landed on `main` before run 001's commit. Supermemory is candidate list D in
`retrieve()` only — never authoritative. `worker/retrieval.ts` still resolves the
permission set synchronously and re-filters every Supermemory hit through it, so
revocation stays immediate and FTS is the floor on any timeout/failure. Verified
against the live API: `/v4/search` echoes `documents[].metadata.item_id` (the
bridge the integration needs) and text ingest is ~3-6s async.
