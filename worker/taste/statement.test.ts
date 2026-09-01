import { test, expect } from "bun:test";
import { refineStatement } from "./statement";

const input = {
  dimension: "color",
  direction: "away" as const,
  comments: ["muted palette everywhere", "the palette feels too muted"],
  artifactTitles: ["Homepage"],
};

test("no AI binding -> null, so the caller keeps its deterministic fallback", async () => {
  expect(await refineStatement(undefined, input)).toBeNull();
  expect(await refineStatement({}, input)).toBeNull();
});
