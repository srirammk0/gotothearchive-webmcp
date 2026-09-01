import { expect, test } from "bun:test";
import { SupermemoryMemoryIndex } from "./memory-supermemory";

type Call = { url: string; init: RequestInit };

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call.url, call.init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

test("addText uses the documented v3 JSON shape and superrag task type", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ id: "doc_1", status: "queued", extra: "ignored" }), { status: 200 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "sm_secret", fetchImpl: mock.fetch });
  const result = await index.addText({
    content: "A useful note",
    containerTag: "space_1",
    metadata: { source: "test", pinned: true },
  });

  expect(result).toEqual({ id: "doc_1", status: "queued" });
  const call = mock.calls[0];
  if (!call) throw new Error("expected one fetch call");
  expect(call.url).toBe("https://api.supermemory.ai/v3/documents");
  expect(call.init.headers).toBeInstanceOf(Headers);
  expect(await new Response(call.init.body).json()).toEqual({
    content: "A useful note",
    taskType: "superrag",
    containerTag: "space_1",
    metadata: { source: "test", pinned: true },
  });
  expect((call.init.headers as Headers).get("Authorization")).toBe("Bearer sm_secret");
});

test("addFile sends multipart fields without a content-type override", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ id: "doc_file", status: "queued" }), { status: 200 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: mock.fetch });
  const result = await index.addFile({
    file: new Blob(["hello"], { type: "text/plain" }),
    filename: "note.txt",
    containerTag: "space_1",
    metadata: { source: "upload" },
  });

  const call = mock.calls[0];
  if (!call) throw new Error("expected one fetch call");
  const form = call.init.body as FormData;
  expect(result).toEqual({ id: "doc_file", status: "queued" });
  expect(form.get("containerTag")).toBe("space_1");
  expect(form.get("taskType")).toBe("superrag");
  expect(form.get("metadata")).toBe('{"source":"upload"}');
  expect(form.get("containerTags")).toBeNull();
  expect((form.get("file") as File).name).toBe("note.txt");
  expect((call.init.headers as Headers).get("Content-Type")).toBeNull();
});

test("update, get, and delete use the documented document id routes", async () => {
  const responses = [
    new Response(JSON.stringify({ id: "doc_1", status: "queued" }), { status: 200 }),
    new Response(JSON.stringify({ id: "doc_1", status: "done", title: "Note", metadata: { rank: 2 }, taskType: "superrag" }), { status: 200 }),
    new Response(null, { status: 204 }),
  ];
  const mock = mockFetch(() => responses.shift() ?? new Response(null, { status: 500 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: mock.fetch });

  expect(await index.updateDocument("doc/1", { content: "revised" })).toEqual({ id: "doc_1", status: "queued" });
  expect(await index.getDocument("doc/1")).toMatchObject({
    id: "doc_1",
    title: "Note",
    metadata: { rank: 2 },
    taskType: "superrag",
  });
  expect(await index.deleteDocument("doc/1")).toBe(true);
  expect(mock.calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
    "PATCH https://api.supermemory.ai/v3/documents/doc%2F1",
    "GET https://api.supermemory.ai/v3/documents/doc%2F1",
    "DELETE https://api.supermemory.ai/v3/documents/doc%2F1",
  ]);
});

test("search parses v4 top-level chunk hits with their document identity and metadata", async () => {
  const payload = {
    results: [
      {
        id: "chunk_1",
        chunk: "A matching chunk",
        similarity: 0.91,
        documents: [{ id: "doc_1", title: "Design notes", type: "text", metadata: { source: "test" }, summary: "Notes" }],
      },
    ],
    timing: 12,
    total: 1,
  };
  const mock = mockFetch(() => new Response(JSON.stringify(payload), { status: 200 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: mock.fetch });
  const result = await index.search({ query: "matching", containerTag: "space_1", limit: 5 });

  expect(result).toEqual({
    hits: [{
      id: "chunk_1",
      documentId: "doc_1",
      content: "A matching chunk",
      position: null,
      similarity: 0.91,
      filepath: null,
      document: {
        id: "doc_1",
        createdAt: null,
        updatedAt: null,
        title: "Design notes",
        type: "text",
        metadata: { source: "test" },
        summary: "Notes",
      },
    }],
    timingMs: 12,
    total: 1,
  });
  const body = await new Response(mock.calls[0]?.init.body).json();
  expect(body).toEqual({
    q: "matching",
    containerTag: "space_1",
    searchMode: "documents",
    include: { documents: true },
    limit: 5,
  });
  expect(body.containerTags).toBeUndefined();
});

test("search never uses a chunk id as document identity or parses deprecated nested chunks", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({
    results: [
      {
        id: "chunk_without_document",
        chunk: "Cannot safely attribute this chunk",
        similarity: 0.8,
        documents: [],
      },
      {
        id: "chunk_old_shape",
        chunks: [{ content: "Deprecated shape", position: 2, documentId: "doc_old" }],
        documents: [{ id: "doc_old", title: "Old document" }],
        similarity: 0.7,
      },
    ],
    timing: 4,
    total: 2,
  }), { status: 200 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: mock.fetch });

  expect(await index.search({ query: "attribute" })).toEqual({ hits: [], timingMs: 4, total: 2 });
});

test("malformed, unavailable, and aborted provider calls return null", async () => {
  const malformed = mockFetch(() => new Response(JSON.stringify({ id: "missing-status" }), { status: 200 }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: malformed.fetch });
  expect(await index.addText({ content: "note" })).toBeNull();

  const unavailable = mockFetch(async () => {
    throw new Error("Bearer key should never escape");
  });
  const unavailableIndex = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: unavailable.fetch });
  expect(await unavailableIndex.getDocument("doc")).toBeNull();

  const controller = new AbortController();
  controller.abort();
  expect(await index.search({ query: "note" }, { signal: controller.signal })).toBeNull();

  const malformedGet = mockFetch(() => new Response(JSON.stringify({ id: "doc_without_status" }), { status: 200 }));
  const malformedGetIndex = new SupermemoryMemoryIndex({ apiKey: "key", fetchImpl: malformedGet.fetch });
  expect(await malformedGetIndex.getDocument("doc_without_status")).toBeNull();
});

test("a timeout aborts the injected fetch", async () => {
  let aborted = false;
  const mock = mockFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("aborted"));
    });
  }));
  const index = new SupermemoryMemoryIndex({ apiKey: "key", timeoutMs: 5, fetchImpl: mock.fetch });
  expect(await index.getDocument("slow")).toBeNull();
  expect(aborted).toBe(true);
});

test("a timeout also covers response body JSON parsing", async () => {
  let signal: AbortSignal | undefined;
  const response = new Response("ignored", { status: 200 });
  Object.defineProperty(response, "json", { value: () => new Promise<unknown>(() => undefined) });
  const mock = mockFetch((_url, init) => {
    signal = init.signal;
    return response;
  });
  const index = new SupermemoryMemoryIndex({ apiKey: "key", timeoutMs: 5, fetchImpl: mock.fetch });

  expect(await index.getDocument("slow-body")).toBeNull();
  expect(signal?.aborted).toBe(true);
});
