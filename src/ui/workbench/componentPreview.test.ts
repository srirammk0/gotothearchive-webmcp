import { afterEach, expect, test } from "bun:test";
import {
  isComponentPreview,
  markComponentPreview,
  previewSandbox,
  previewSrcDoc,
} from "./componentPreview";

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("static artifacts keep the fully inert preview sandbox", () => {
  const html = "<p>Static brief</p>";
  expect(isComponentPreview(html)).toBe(false);
  expect(previewSandbox(html)).toBe("");
  expect(previewSrcDoc(html)).toBe(html);
});

test("component artifacts get an opaque script sandbox with a restrictive CSP", () => {
  const html = markComponentPreview("<div id=\"root\"></div><script>/* preview */</script>");
  expect(isComponentPreview(html)).toBe(true);
  expect(previewSandbox(html)).toBe("allow-scripts");
  expect(previewSrcDoc(html)).toContain("connect-src 'none'");
  expect(previewSrcDoc(html)).toContain("<body>");
  expect(previewSrcDoc(html)).toContain(html);
});

test("img-src allows this app's real origin (not 'self', which an opaque sandboxed document could never match) so embed_url actually loads", () => {
  (globalThis as { window: unknown }).window = { location: { origin: "https://app.example" } };
  const html = markComponentPreview("<div id=\"root\"></div>");
  const srcDoc = previewSrcDoc(html);
  expect(srcDoc).toContain("img-src data: blob: https://app.example");
});

test("no window (e.g. this test file itself, run outside a browser) degrades to data:/blob: only rather than throwing", () => {
  Reflect.deleteProperty(globalThis, "window");
  const html = markComponentPreview("<div id=\"root\"></div>");
  const srcDoc = previewSrcDoc(html);
  expect(srcDoc).toContain("img-src data: blob:;");
});
