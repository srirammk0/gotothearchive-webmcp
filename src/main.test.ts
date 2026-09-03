import { expect, test } from "bun:test";

// The demo-entry flow must not reload the page: a reload mid-load derails a
// WebMCP capture. It flips React state to render <App demo /> with the
// freshly-set demo_session cookie instead.
test("main.tsx demo-entry path does not call window.location.reload", async () => {
  const src = await Bun.file(new URL("./main.tsx", import.meta.url)).text();
  expect(src).not.toContain("window.location.reload");
  expect(src).toContain('setPhase(res.ok ? "ready" : "unavailable")');
});
