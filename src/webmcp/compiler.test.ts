import { test } from "bun:test";
import assert from "node:assert";
import { compile } from "./compiler";
import type { CapabilityInput } from "@shared/contract";

const noPageState = { hasPendingProposals: false, activeArtifactId: null };
const task = { id: "t1", title: "Task", expires_at: null };

function findTool(specs: ReturnType<typeof compile>, name: string) {
  return specs.find((s) => s.name === name);
}

/** The accessible-region enum a tool's `region` field currently advertises. */
function enumOf(tool: ReturnType<typeof findTool>): string[] {
  return (tool!.inputSchema.properties.region as { enum?: string[] }).enum!.toSorted();
}

test("each region field is an enum of exactly the accessible slugs", () => {
  // This is the central WebMCP claim, not a nicety: the SCHEMA narrows when a
  // grant does. The server re-checks every call anyway (authorize() in
  // worker/permissions.ts), but without the enum the agent has to guess a slug,
  // and a wrong guess costs a denial round-trip far larger than the enum.
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
  assert.deepEqual(region.enum!.toSorted(), ["inspiration", "work"]);
});

test("revoking a region drops it from the schema enum and the registration reason", () => {
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
  assert.deepEqual(enumOf(beforeTool), ["inspiration", "work"]);
  assert.deepEqual(enumOf(afterTool), ["work"]);
  assert.ok(beforeTool!.why.includes("inspiration"));
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

test("trace_artifact_influences exists only while an artifact is open", () => {
  // Invariant #8: unregister rather than present an always-failing shell. With
  // nothing open there is no artifact for it to trace.
  const base: CapabilityInput = {
    humanRegions: [{ slug: "work", level: "read" }],
    grants: [{ slug: "work", level: "read" }],
    task,
    pageState: noPageState,
  };
  assert.equal(findTool(compile(base), "trace_artifact_influences"), undefined);

  const withArtifact: CapabilityInput = {
    ...base,
    pageState: { hasPendingProposals: false, activeArtifactId: "art1" },
  };
  const found = findTool(compile(withArtifact), "trace_artifact_influences");
  assert.ok(found);
  assert.ok(found.why.includes("art1"));
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
    "get_taste_for_task",
    "trace_artifact_influences",
  ];
  for (const name of readOnly) {
    assert.equal(findTool(specs, name)!.annotations?.readOnlyHint, true, `${name} readOnlyHint`);
  }

  const untrusted = [
    "get_context_for_task",
    "inspect_context_item",
    "trace_artifact_influences",
    "get_taste_for_task",
  ];
  for (const name of untrusted) {
    assert.equal(findTool(specs, name)!.annotations?.untrustedContentHint, true, `${name} untrustedContentHint`);
  }

  for (const name of ["record_artifact", "propose_taste_signal"]) {
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
  assert.ok(props("propose_taste_signal").statement);
  assert.ok(props("propose_taste_signal").annotation_ids);
  assert.ok(props("record_artifact").content_html);
  assert.ok(props("record_artifact").used_item_ids);
});

test("the three cut tools are never compiled, at any level", () => {
  for (const level of ["read", "propose", "write"] as const) {
    const specs = compile({
      humanRegions: [{ slug: "work", level: "write" }],
      grants: [{ slug: "work", level }],
      task,
      pageState: { hasPendingProposals: false, activeArtifactId: "art1" },
    });
    for (const gone of ["inspect_relationships", "record_feedback", "propose_context_change"]) {
      assert.equal(findTool(specs, gone), undefined, gone + " must not be compiled at " + level);
    }
  }
});
