/**
 * Deterministic WebMCP eval: the tool SURFACE.
 *
 * The Chrome WebMCP evals guidance splits testing in two
 * (developer.chrome.com/docs/ai/webmcp/evals): probabilistic "does the model
 * pick the right tool" evals (cases.json, needs a model + live session) and
 * deterministic tests of the tools themselves. This file is the deterministic
 * half — it pins what `compile()` exposes for a given permission state, with no
 * model in the loop, so CI catches a capability-boundary regression immediately.
 *
 * The invariant under test: the agent-visible tool surface is exactly
 * min(human access, live grant) ∩ task ∩ page state — nothing broader.
 */
import { test, expect } from "bun:test";
import type { CapabilityInput, GrantLevel } from "@shared/contract";
import { compile } from "../src/webmcp/compiler";

const reg = (slug: string, level: GrantLevel): { slug: string; level: GrantLevel } => ({ slug, level });

function input(over: Partial<CapabilityInput> = {}): CapabilityInput {
  return {
    humanRegions: [reg("work", "write"), reg("inspiration", "write"), reg("personal", "write")],
    grants: [reg("work", "read"), reg("inspiration", "read")],
    task: { id: "t1", title: "Redesign the pricing page", expires_at: null },
    pageState: { hasPendingProposals: false, activeArtifactId: null },
    ...over,
  };
}

const names = (i: CapabilityInput) => compile(i).map((t) => t.name);
const tool = (i: CapabilityInput, name: string) => compile(i).find((t) => t.name === name);
const regionEnum = (i: CapabilityInput, name: string) =>
  (tool(i, name)?.inputSchema.properties as { region?: { enum?: string[] } } | undefined)?.region?.enum;

test("read grant exposes the read tools, not the propose tools", () => {
  const n = names(input());
  expect(n).toContain("get_current_context_scope");
  expect(n).toContain("get_context_for_task");
  expect(n).toContain("inspect_context_item");
  expect(n).toContain("inspect_relationships");
  expect(n).toContain("get_taste_for_task");
  expect(n).not.toContain("record_artifact");
  expect(n).not.toContain("record_feedback");
  expect(n).not.toContain("propose_context_change");
});

test("region enum is exactly the granted, human-reachable regions", () => {
  expect(regionEnum(input(), "get_context_for_task")?.toSorted()).toEqual(["inspiration", "work"]);
});

test("revoking a region removes it from the enum immediately", () => {
  const revoked = input({ grants: [reg("work", "read")] });
  expect(regionEnum(revoked, "get_context_for_task")).toEqual(["work"]);
});

test("a grant can never exceed the invoking human's own access", () => {
  // Human only has read on inspiration; a stray write grant must not lift it.
  const capped = input({
    humanRegions: [reg("work", "write"), reg("inspiration", "read")],
    grants: [reg("work", "propose"), reg("inspiration", "write")],
  });
  expect(regionEnum(capped, "record_artifact")?.toSorted()).toEqual(["work"]);
});

test("propose grant exposes the propose tools scoped to propose-level regions", () => {
  const p = input({ grants: [reg("work", "propose"), reg("inspiration", "read")] });
  const n = names(p);
  expect(n).toContain("record_artifact");
  expect(n).toContain("record_feedback");
  expect(n).toContain("propose_context_change");
  expect(regionEnum(p, "record_artifact")).toEqual(["work"]);
});

test("trace_artifact_influences is page-state gated", () => {
  expect(names(input())).not.toContain("trace_artifact_influences");
  expect(names(input({ pageState: { hasPendingProposals: false, activeArtifactId: "art_1" } }))).toContain(
    "trace_artifact_influences",
  );
});

test("no grant on any region → only identify_agent", () => {
  expect(names(input({ grants: [] }))).toEqual(["identify_agent"]);
});

test("approval tools are never compiled, at any level", () => {
  for (const level of ["read", "propose", "write"] as GrantLevel[]) {
    const n = names(input({ grants: [reg("work", level), reg("inspiration", level)] }));
    expect(n).not.toContain("approve_proposed_changes");
    expect(n).not.toContain("reject_proposed_changes");
  }
});

test("Chrome WebMCP annotations + budgets are set correctly", () => {
  const specs = compile(input({ pageState: { hasPendingProposals: false, activeArtifactId: "art_1" } }));
  const readOnly = new Set([
    "get_current_context_scope",
    "get_context_for_task",
    "inspect_context_item",
    "inspect_relationships",
    "get_taste_for_task",
    "trace_artifact_influences",
  ]);
  const untrusted = new Set([
    "get_context_for_task",
    "inspect_context_item",
    "inspect_relationships",
    "trace_artifact_influences",
    "get_taste_for_task",
  ]);
  for (const s of specs) {
    expect(s.name.length).toBeLessThanOrEqual(30);
    expect(s.description.length).toBeLessThanOrEqual(500);
    if (readOnly.has(s.name)) expect(s.annotations?.readOnlyHint).toBe(true);
    else expect(s.annotations?.readOnlyHint).not.toBe(true);
    if (untrusted.has(s.name)) expect(s.annotations?.untrustedContentHint).toBe(true);
  }
});
