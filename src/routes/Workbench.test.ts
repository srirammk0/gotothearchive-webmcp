import { expect, test } from "bun:test";
import { splitVersionChips } from "./Workbench";

function versions(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}` }));
}

test("3 or fewer versions all stay visible, nothing hidden", () => {
  const { visible, hidden, hiddenActive } = splitVersionChips(versions(3), "v2");
  expect(visible.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
  expect(hidden).toEqual([]);
  expect(hiddenActive).toBe(false);
});

test("past 3, only the most recent 3 stay visible; the rest collapse, oldest first", () => {
  const { visible, hidden } = splitVersionChips(versions(8), "v8");
  expect(visible.map((v) => v.id)).toEqual(["v6", "v7", "v8"]);
  expect(hidden.map((v) => v.id)).toEqual(["v1", "v2", "v3", "v4", "v5"]);
});

test("hiddenActive is true when the selected version got collapsed", () => {
  const { hiddenActive } = splitVersionChips(versions(8), "v2");
  expect(hiddenActive).toBe(true);
});

test("hiddenActive is false when the selected version is still visible", () => {
  const { hiddenActive } = splitVersionChips(versions(8), "v8");
  expect(hiddenActive).toBe(false);
});

test("exactly 4 versions hides exactly the oldest one", () => {
  const { visible, hidden } = splitVersionChips(versions(4), "v4");
  expect(hidden.map((v) => v.id)).toEqual(["v1"]);
  expect(visible.map((v) => v.id)).toEqual(["v2", "v3", "v4"]);
});
