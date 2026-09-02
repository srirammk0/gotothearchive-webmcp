import { test } from "bun:test";
import assert from "node:assert";
import { compile } from "./compiler";
import type { CapabilityInput } from "@shared/contract";

const noPageState = { hasPendingProposals: false, activeArtifactId: null };
const task = { id: "t1", title: "Task", expires_at: null };

function findTool(specs: ReturnType<typeof compile>, name: string) {
  return specs.find((s) => s.name === name);
}

test("region is a plain string field, not a per-tool enum of every accessible slug", () => {
  // The enum used to repeat the full accessible-region list in every one of
  // ~7 tools' inputSchema — real, duplicated tokens sent to the calling
  // model on every capability refresh, scaling with region count × tool
  // count. Region names are still validated server-side either way (see
  // authorize() in worker/permissions.ts); the schema now just points at
  // get_current_context_scope instead of re-enumerating.
  const input: CapabilityInput = {
    humanRegions: [
      { slug: "work", level: "write" },
      { slug: "inspiration", level: "write" },
    ],
    grants: [
      { slug: "work", level: "read" },
      { slug: "inspiration", level: "read" },
    ],
    task,
    pageState: noPageState,
  };
  const tool = findTool(compile(input), "get_context_for_task");
  const region = tool!.inputSchema.properties.region as { type: string; enum?: string[] };
  assert.equal(region.type, "string");
  assert.equal(region.enum, undefined);
});

test("revoking a region is still reflected — in the tool's registration reason, not its schema", () => {
  const before: CapabilityInput = {
    humanRegions: [
      { slug: "work", level: "write" },
      { slug: "inspiration", level: "write" },
    ],
    grants: [
      { slug: "work", level: "read" },
      { slug: "inspiration", level: "read" },
    ],
    task,
    pageState: noPageState,
  };
  const after: CapabilityInput = { ...before, grants: [{ slug: "work", level: "read" }] };

  const beforeTool = findTool(compile(before), "get_context_for_task");
  const afterTool = findTool(compile(after), "get_context_for_task");
  assert.ok(beforeTool!.why.includes("work"));
  assert.ok(beforeTool!.why.includes("inspiration"));
  assert.ok(afterTool!.why.includes("work"));
  assert.ok(!afterTool!.why.includes("inspiration"));
});

test("revoking the last granted region removes the tool entirely", () => {
  const input: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "write" }],
    grants: [],
    task,
    pageState: noPageState,
  };
  assert.equal(findTool(compile(input), "get_context_for_task"), undefined);
});

test("min(human, grant) caps effective level — write grant with only read human access yields read", () => {
  const input: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "read" }],
    grants: [{ slug: "work", level: "write" }],
    task,
    pageState: noPageState,
  };
  const specs = compile(input);
  assert.ok(findTool(specs, "get_context_for_task"), "read-level tool should exist");
  assert.equal(
    findTool(specs, "record_artifact"),
    undefined,
    "propose-level tool must not exist when human access caps at read",
  );
});

test("record_artifact is gated at propose, not write", () => {
  const proposeOnly: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "propose" }],
    grants: [{ slug: "work", level: "propose" }],
    task,
    pageState: noPageState,
  };
  const spec = findTool(compile(proposeOnly), "record_artifact");
  assert.ok(spec, "an agent that may suggest changes can submit an artifact for review");
  assert.equal(spec.requires, "propose");

  // Submitting an artifact must never imply authority to approve it.
  assert.equal(
    findTool(compile(proposeOnly), "approve_proposed_changes"),
    undefined,
    "propose must not confer self-approval",
  );
});

test("propose-only tools absent at read", () => {
  const input: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "read" }],
    grants: [{ slug: "work", level: "read" }],
    task,
    pageState: noPageState,
  };
  const specs = compile(input);
  assert.equal(findTool(specs, "propose_context_change"), undefined);
  assert.equal(findTool(specs, "record_feedback"), undefined);
});

test("approval is never an agent capability, even at write with proposals pending", () => {
  const withPending: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "write" }],
    grants: [{ slug: "work", level: "write" }],
    task,
    pageState: { hasPendingProposals: true, activeArtifactId: null },
  };
  const specs = compile(withPending);
  assert.equal(findTool(specs, "approve_proposed_changes"), undefined);
  assert.equal(findTool(specs, "reject_proposed_changes"), undefined);

  // The agent is still told a proposal is pending, so it does not retry or
  // assume its submission failed — it just cannot act on it.
  const scope = findTool(specs, "get_current_context_scope");
  assert.ok(scope);
  assert.ok(
    scope.description.includes("awaiting human review"),
    "pending state must be reported to the agent even though no tool acts on it",
  );
});

test("trace_artifact_influences is available at read tier regardless of page state, but notes an active artifact when there is one", () => {
  const base: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "read" }],
    grants: [{ slug: "work", level: "read" }],
    task,
    pageState: noPageState,
  };
  const withoutArtifact = findTool(compile(base), "trace_artifact_influences");
  assert.ok(withoutArtifact, "must be callable by artifact_id/version_id even with nothing open");
  assert.ok(!withoutArtifact!.why.includes("An artifact is open"));

  const withArtifact: CapabilityInput = {
    ...base,
    pageState: { hasPendingProposals: false, activeArtifactId: "art1" },
  };
  const found = findTool(compile(withArtifact), "trace_artifact_influences");
  assert.ok(found);
  assert.ok(found!.why.includes("art1"));
});

test("Chrome WebMCP annotations: readOnlyHint / untrustedContentHint per tool", () => {
  const input: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "propose" }],
    grants: [{ slug: "work", level: "propose" }],
    task,
    pageState: { hasPendingProposals: false, activeArtifactId: "art1" },
  };
  const specs = compile(input);

  const readOnly = [
    "get_current_context_scope",
    "get_context_for_task",
    "inspect_context_item",
    "inspect_relationships",
    "get_taste_for_task",
    "trace_artifact_influences",
  ];
  for (const name of readOnly) {
    assert.equal(findTool(specs, name)!.annotations?.readOnlyHint, true, `${name} readOnlyHint`);
  }

  const untrusted = [
    "get_context_for_task",
    "inspect_context_item",
    "inspect_relationships",
    "trace_artifact_influences",
    "get_taste_for_task",
  ];
  for (const name of untrusted) {
    assert.equal(findTool(specs, name)!.annotations?.untrustedContentHint, true, `${name} untrustedContentHint`);
  }

  for (const name of ["record_feedback", "record_artifact", "propose_context_change"]) {
    assert.notEqual(findTool(specs, name)!.annotations?.readOnlyHint, true, `${name} must not be readOnly`);
  }

  for (const spec of specs) {
    assert.ok(spec.description.length <= 500, `${spec.name} description <= 500`);
    assert.ok(spec.name.length <= 30, `${spec.name} name <= 30`);
  }

  assert.equal(findTool(specs, "approve_proposed_changes"), undefined);
  assert.equal(findTool(specs, "reject_proposed_changes"), undefined);
});

test("registered schemas expose every input their runtime handler needs", () => {
  const input: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "propose" }],
    grants: [{ slug: "work", level: "propose" }],
    task,
    pageState: { hasPendingProposals: false, activeArtifactId: "art1" },
  };
  const specs = compile(input);
  const props = (name: string) => findTool(specs, name)!.inputSchema.properties;

  assert.ok(props("get_context_for_task").query);
  assert.ok(props("get_context_for_task").limit);
  assert.ok(props("trace_artifact_influences").version_id);
  assert.ok(props("trace_artifact_influences").artifact_id);
  assert.ok(props("record_feedback").version_id);
  assert.ok(props("record_feedback").comment);
  assert.ok(props("propose_context_change").from_item_id);
  assert.ok(props("propose_context_change").to_item_id);
});
