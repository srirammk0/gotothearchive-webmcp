import { expect, test } from "bun:test";
import { activeArtifactIdFromPath } from "./WebMcpProvider";

test("extracts the artifact id from a /workbench/<id> path", () => {
  expect(activeArtifactIdFromPath("/workbench/art_123")).toBe("art_123");
  expect(activeArtifactIdFromPath("/workbench/art_123/anything")).toBe("art_123");
});

test("is null off a workbench artifact route", () => {
  for (const p of ["/", "/workbench", "/workbench/", "/taste", "/stats", "/workbenchx/art_1"]) {
    expect(activeArtifactIdFromPath(p)).toBeNull();
  }
});
