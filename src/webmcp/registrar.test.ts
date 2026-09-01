import { test, afterEach } from "bun:test";
import assert from "node:assert";
import { Registrar } from "./registrar";
import type { ToolSpec } from "@shared/contract";

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    globalThis.document = originalDocument;
  }
});

function makeSpec(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "example_tool",
    requires: "read",
    title: "Example tool",
    description: "An example tool.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    why: "Read access is live on: work.",
    ...overrides,
  };
}

function installModelContext() {
  const registrations: {
    tool: {
      name: string;
      description: string;
      title?: string;
      annotations?: ToolSpec["annotations"];
      inputSchema: ToolSpec["inputSchema"];
      execute: (input: unknown, ctx?: { signal?: AbortSignal }) => Promise<unknown>;
    };
    signal: AbortSignal;
  }[] = [];
  const modelContext = {
    registerTool: async (tool: (typeof registrations)[number]["tool"], opts: { signal: AbortSignal }) => {
      registrations.push({ tool, signal: opts.signal });
    },
  };
  globalThis.document = { modelContext } as unknown as Document;
  return registrations;
}

test("re-registers when any material tool field changes", async () => {
  for (const change of [
    { title: "Changed title" },
    { description: "Changed description" },
    { annotations: { readOnlyHint: false } },
    { inputSchema: { type: "object", properties: { query: { type: "string" } } } },
    { why: "Access changed." },
  ]) {
    const registrations = installModelContext();
    const registrar = new Registrar();
    const first = makeSpec();
    await registrar.sync([first], async () => "first");
    const firstSignal = registrations[0].signal;

    await registrar.sync([{ ...first, ...change }], async () => "second");

    assert.equal(registrations.length, 2, "material changes must register a fresh browser tool");
    assert.equal(firstSignal.aborted, true, "the previous registration must be aborted");
  }
});

test("keeps one registration while using the latest spec and executor", async () => {
  const registrations = installModelContext();
  const registrar = new Registrar();
  const first = makeSpec();
  await registrar.sync([first], async (spec) => `old:${spec.requires}`);

  const latest = { ...first, requires: "write" as const };
  await registrar.sync([latest], async (spec) => `new:${spec.requires}`);

  assert.equal(registrations.length, 1);
  const result = await registrations[0].tool.execute({}, { signal: new AbortController().signal });
  assert.equal(result, "new:write");
});

test("forwards the WebMCP execution abort signal and preserves text result shape", async () => {
  const registrations = installModelContext();
  const registrar = new Registrar();
  const expected = new AbortController().signal;
  let received: AbortSignal | undefined;
  await registrar.sync([makeSpec()], async (_spec, _input, signal) => {
    received = signal;
    return JSON.stringify({ ok: true });
  });

  const result = await registrations[0].tool.execute({ query: "x" }, { signal: expected });

  assert.equal(received, expected);
  assert.equal(result, JSON.stringify({ ok: true }));
});

test("aborting a removed registration unregisters it and stale execution reports unknown tool", async () => {
  const registrations = installModelContext();
  const registrar = new Registrar();
  await registrar.sync([makeSpec()], async () => "result");
  const tool = registrations[0].tool;

  await registrar.sync([], async () => "unused");

  assert.equal(registrations[0].signal.aborted, true);
  assert.equal(await tool.execute({}), 'Unknown tool "example_tool". It is not currently registered.');
});
