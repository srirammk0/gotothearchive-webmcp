import { test } from "bun:test";
import assert from "node:assert";
import { compile } from "./compiler";
import type { CapabilityInput } from "@shared/contract";

const noPageState = { hasPendingProposals: false, activeArtifactId: null };
const task = { id: "t1", title: "Task", expires_at: null };

function findTool(specs: ReturnType<typeof compile>, name: string) {
  return specs.find((s) => s.name === name);
}

test("revoking a region removes that slug from the enum", () => {
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
  assert.ok(beforeTool);
  assert.deepEqual(beforeTool!.inputSchema.properties.region, { type: "string", enum: ["work", "inspiration"] });
  assert.deepEqual(afterTool!.inputSchema.properties.region, { type: "string", enum: ["work"] });
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

test("trace_artifact_influences appears only when an artifact is active", () => {
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
  assert.ok(findTool(compile(withArtifact), "trace_artifact_influences"));
});
