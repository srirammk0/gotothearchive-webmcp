import { expect, test } from "bun:test";
import {
  isComponentPreview,
  markComponentPreview,
  previewSandbox,
  previewSrcDoc,
} from "./componentPreview";

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
