import { afterEach, expect, test } from "bun:test";
import { clearRequestCacheForTests, createTask, listTasks } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRequestCacheForTests();
});

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return calls;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("a GET within the TTL is served from cache, no second network call", async () => {
  const calls = mockFetch(() => jsonResponse({ tasks: [] }));
  await listTasks();
  await listTasks();
  expect(calls.length).toBe(1);
});

test("concurrent identical GETs dedupe to one in-flight request", async () => {
  const calls = mockFetch(() => jsonResponse({ tasks: [] }));
  await Promise.all([listTasks(), listTasks(), listTasks()]);
  expect(calls.length).toBe(1);
});

test("a successful mutation clears the cache so the next GET refetches", async () => {
  const calls = mockFetch((_url, init) =>
    init.method === "POST" ? jsonResponse({ task: { id: "t1" } }) : jsonResponse({ tasks: [] }),
  );
  await listTasks();
  await createTask("New task");
  await listTasks();
  expect(calls.length).toBe(3);
});

test("a failed GET is not cached — the next call retries the network", async () => {
  let n = 0;
  mockFetch(() => {
    n++;
    return n === 1 ? new Response(null, { status: 500 }) : jsonResponse({ tasks: [] });
  });
  await expect(listTasks()).rejects.toThrow();
  await listTasks();
  expect(n).toBe(2);
});
