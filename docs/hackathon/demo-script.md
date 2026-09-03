# GoToTheArchive — WebMCP Challenge demo script

**Target:** 2:45–2:55 · English · narrated screen recording

## 0:00–0:27 — Context is not enough

**[SHOW: Start on the Archive. Move across Work, Inspiration and Personal. Open
one strong visual reference.]**

Context is the biggest constraint on agents today. But it is usually managed by
the agent, buried in a local database or hosted service. You cannot see it
clearly, edit it naturally, or choose exactly what appears in one run.

And context is not the final goal. The deeper layer is taste: the judgment
behind what you save, reject and ask to change.

## 0:27–0:48 — The thesis

**[SHOW: Show the full Archive and one image's design profile.]**

GoToTheArchive is built around one thesis: you and your agents should share a
clean, familiar Archive for your taste—not another hidden memory store.

You curate it, edit it and decide what each agent may borrow. Images, webpages,
PDFs, notes, prior work and feedback become visible evidence of what good means
to you.

**[MENTION, DON'T DEMO: Palettes are measured from real pixels. Other visual
qualities carry model provenance. Context relationships never grant access.]**

## 0:48–1:15 — Why WebMCP is the key

**[SHOW: Agent Access. Work → Can suggest changes. Inspiration → Can view.
Personal → No access. Open Agent Lens.]**

WebMCP brings the agent into the same interface where I manage my Archive.

For this task, it can read Inspiration and create inside Work, while Personal
remains unavailable. Agent Lens shows the semantic tools produced from those
choices, with schemas containing only the regions this agent can reach.

This is not permission theatre. Private material is removed before retrieval,
unavailable capabilities disappear, and every operation is checked again.

**[MENTION, DON'T DEMO: Agent authority cannot exceed the human's access;
grants expire with the task; identity and denials are audited.]**

## 1:15–1:48 — Agent run and Workbench

**[SHOW: Roughly 8× speed recording of Codex reading the brief, inspecting
permitted references, creating the landing page and submitting it. Cut to the
completed artifact in Workbench.]**

Codex uses WebMCP to understand its scope, retrieve the brief, inspect my
references and build a landing page grounded in this Archive.

The result does not disappear into chat. It arrives in the Workbench as a
versioned artifact. I can see what was accessed, which references actually
shaped it and which agent produced it. Then I can annotate, approve, reject or
request another version.

**[MENTION, DON'T DEMO: Previews are sandboxed; versions are immutable;
agent-created work is not canonical until a human approves it.]**

## 1:48–2:15 — Taste, not memory

**[SHOW: Add one strong annotation. Return to Codex and ask it to inspect the
feedback and name the preference it notices. Show `trace_artifact_influences`
and `propose_taste_signal` at roughly 8× speed. Open Taste and show the proposal
with its evidence. Confirm or edit it.]**

That feedback becomes more useful than another memory note. Codex reads it and
proposes a Taste signal connected to the exact annotation, artifact and
references. The server never invents a preference on its own.

It does not silently decide who I am. I can inspect the evidence, edit the
wording, scope it, reject it or confirm it. Future agents can use confirmed
Taste only when I grant access to its grounding context.

**[MENTION, DON'T DEMO: Contradicting evidence is preserved; silence never
confirms a preference; every signal is editable and reversible.]**

## 2:15–2:32 — Revocation

**[SHOW: Revoke Inspiration. Open Agent Lens and show that Inspiration is gone
from the available scope.]**

And I can take access back. Revoking Inspiration changes the agent's WebMCP
capabilities immediately. The Taste remains mine, but an agent without access
to its evidence cannot retrieve it.

Revocation controls future access. It does not pretend the model forgets what
it already saw.

## 2:32–2:55 — Open web and close

**[SHOW: Public GitHub repository for two seconds, then return to the Archive or
a simple title card.]**

Building this exposed open WebMCP questions around multimodal input and output,
provenance, media-derived instructions and revocation. We have open-sourced the
implementation and plan to turn these findings into upstream tests and an
implementation report.

This release proves the complete core loop. Next come richer PDF understanding,
broader connectors, and human collaboration through Shared and Inbox.

Your agents should not each own a hidden model of you. You should own the
Archive, lend what matters, see what shaped the work and control what becomes
part of your Taste. WebMCP makes that possible.
