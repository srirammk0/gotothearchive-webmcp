import { afterEach, expect, test } from "bun:test";
import { clearRequestCacheForTests } from "../../api/client";
import { resetSharedBootstrapForTests, sharedBootstrap } from "./useSpace";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRequestCacheForTests();
  resetSharedBootstrapForTests();
});

function mockApi() {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(url);
    const path = url.split("?")[0];
    const body =
      path === "/api/bootstrap"
        ? { space: { id: "s1", name: "Space" }, regions: [] }
        : path === "/api/task"
          ? { tasks: [{ id: "t1", title: "T", status: "open" }] }
          : path === "/api/session"
            ? { agent_session_id: "as1" }
            : {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
  return calls;
}

test("concurrent sharedBootstrap() callers trigger exactly one bootstrap", async () => {
  const calls = mockApi();
  const [a, b, c] = await Promise.all([sharedBootstrap(), sharedBootstrap(), sharedBootstrap()]);

  expect(a).toBe(b);
  expect(b).toBe(c);
  expect(calls.filter((u) => u.startsWith("/api/bootstrap"))).toHaveLength(1);
  expect(calls.filter((u) => u.startsWith("/api/task"))).toHaveLength(1);
  expect(calls.filter((u) => u.startsWith("/api/session"))).toHaveLength(1);
});

test("a later caller reuses the resolved bootstrap without a second round trip", async () => {
  const calls = mockApi();
  await sharedBootstrap();
  const before = calls.length;
  await sharedBootstrap();
  expect(calls.length).toBe(before);
});

test("a failed bootstrap clears the memo so the next call retries", async () => {
  let attempt = 0;
  globalThis.fetch = ((url: string) => {
    if (url.startsWith("/api/bootstrap") && attempt++ === 0) {
      return Promise.resolve(new Response("nope", { status: 500 }));
    }
    return mockApiOnce(url);
  }) as typeof fetch;

  await expect(sharedBootstrap()).rejects.toBeInstanceOf(Error);
  clearRequestCacheForTests();
  await expect(sharedBootstrap()).resolves.toMatchObject({ task: { id: "t1" } });
});

function mockApiOnce(url: string) {
  const path = url.split("?")[0];
  const body =
    path === "/api/bootstrap"
      ? { space: { id: "s1", name: "Space" }, regions: [] }
      : path === "/api/task"
        ? { tasks: [{ id: "t1", title: "T", status: "open" }] }
        : path === "/api/session"
          ? { agent_session_id: "as1" }
          : {};
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}
