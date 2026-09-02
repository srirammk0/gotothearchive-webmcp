import { test, expect } from "bun:test";
import type { ContextItem, DesignProfile } from "@shared/contract";
import { deriveEdgesForItem, rebuildSpaceEdges } from "./graph-build";

function item(p: Partial<ContextItem> & { id: string }): ContextItem {
  return {
    space_id: "s1",
    region_id: "r1",
    owner_id: "u1",
    type: "note",
    title: "",
    source_url: null,
    content_ref: null,
    semantic_text: null,
    metadata: {},
    authority_class: "human_authored",
    created_by: "u1",
    created_at: 1000,
    updated_at: 1000,
    ...p,
  } as ContextItem;
}

function design(overrides: Partial<DesignProfile> = {}): DesignProfile {
  return {
    palette: [{ hex: "#F5E9D8", pct: 60, role: "ground" }],
    palette_source: "measured",
    typography: { classification: "didone_serif", case: "uppercase", scale: "hero", note: "" },
    layout: { composition: "poster_split", density: "balanced", alignment: "center" },
    texture: ["halftone"],
    shape: { corner_radius: "sharp", stroke: "none" },
    imagery: { treatment: "none" },
    mood: ["editorial"],
    extracted_by: "test",
    extracted_at: 1000,
    ...overrides,
  };
}

interface Inserted {
  from_id: string;
  to_id: string;
  relationship: string;
  weight: number;
  approval_state: string;
  created_by: string;
}

function stubQ(items: ContextItem[]) {
  const edges: Inserted[] = [];
  return {
    edges,
    // deno-lint-ignore no-explicit-any
    listItemsBySpace: (spaceId: string) => items.filter((i) => i.space_id === spaceId),
    edgeExists: (a: string, b: string, rel: string) =>
      edges.some(
        (e) =>
          e.relationship === rel &&
          ((e.from_id === a && e.to_id === b) || (e.from_id === b && e.to_id === a)),
      ),
    insertEdge: (e: Inserted) => {
      edges.push(e);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("rule 1: same source domain -> approved related_to 0.6", () => {
  const a = item({ id: "a", source_url: "https://www.example.com/one" });
  const b = item({ id: "b", source_url: "https://example.com/two" });
  const c = item({ id: "c", source_url: "https://other.com/x", region_id: "r2", created_at: 9_000_000 });
  const b2 = { ...b, region_id: "r2", created_at: 9_000_000 };
  const q = stubQ([a, b2, c]);
  const n = deriveEdgesForItem(q, a, 5000);
  expect(n).toBe(1);
  expect(q.edges[0]).toMatchObject({
    from_id: "a",
    to_id: "b",
    relationship: "related_to",
    weight: 0.6,
    approval_state: "approved",
    created_by: "system",
  });
});

test("rule 3: shared salient words -> proposed related_to, capped weight 0.5", () => {
  const shared = "typography editorial grotesk baseline modular";
  const a = item({ id: "a", title: "grid", semantic_text: shared });
  const b = item({ id: "b", title: "grid", semantic_text: shared });
  const c = item({ id: "c", title: "cats", semantic_text: "unrelated feline nonsense words", region_id: "r2", created_at: 9_000_000 });
  const q = stubQ([a, b, c]);
  deriveEdgesForItem(q, a, 5000);
  const e = q.edges.find((x: Inserted) => x.to_id === "b");
  expect(e).toBeTruthy();
  expect(e.relationship).toBe("related_to");
  expect(e.approval_state).toBe("proposed");
  expect(e.weight).toBeLessThanOrEqual(0.5);
  expect(q.edges.find((x: Inserted) => x.to_id === "c")).toBeUndefined();
});

test("rule 2: tweet -> children (image=derived_from, link=mentions), both call orders", () => {
  // distinct regions so rule 4 (same-region proximity) does not also fire between them
  const tweet = item({ id: "t", type: "link", region_id: "rt", metadata: { extracted: { images: [], links: [], author: "x" } } });
  const img = item({ id: "img", type: "image", region_id: "ri", metadata: { derived_from_item_id: "t" } });
  const link = item({ id: "lnk", type: "link", region_id: "rl", metadata: { derived_from_item_id: "t" } });

  // called for the tweet
  const q1 = stubQ([tweet, img, link]);
  deriveEdgesForItem(q1, tweet, 5000);
  expect(q1.edges.find((e: Inserted) => e.to_id === "img")?.relationship).toBe("derived_from");
  expect(q1.edges.find((e: Inserted) => e.to_id === "lnk")?.relationship).toBe("mentions");
  expect(q1.edges.every((e: Inserted) => e.weight === 1 && e.approval_state === "approved")).toBe(true);

  // called for a child, parent already present
  const q2 = stubQ([tweet, img, link]);
  deriveEdgesForItem(q2, img, 5000);
  expect(q2.edges).toHaveLength(1);
  expect(q2.edges[0]).toMatchObject({ from_id: "t", to_id: "img", relationship: "derived_from" });
});

test("co-capture alone does not link: connections need shared content or source", () => {
  // Same region, seconds apart, but nothing in common in the text.
  const a = item({ id: "a", title: "Quarterly travel receipts", semantic_text: "hotel and flight totals", created_at: 1_000_000 });
  const near = item({ id: "near", title: "Colour palette reference", semantic_text: "terracotta and sienna swatches", created_at: 1_000_000 + 30_000 });
  const q = stubQ([a, near]);
  deriveEdgesForItem(q, a, 5000);
  expect(q.edges).toHaveLength(0);

  // Shared salient words -> a proposed related_to edge, grounded in the text.
  const b = item({ id: "b", title: "Terracotta palette swatches", semantic_text: "warm sienna clay tones", created_at: 2_000_000 });
  const q2 = stubQ([near, b]);
  deriveEdgesForItem(q2, b, 5000);
  const e = q2.edges.find((x: Inserted) => x.to_id === "near");
  expect(e).toMatchObject({ relationship: "related_to", approval_state: "proposed" });
});

test("idempotent: re-running derive / rebuild inserts nothing new", () => {
  const a = item({ id: "a", source_url: "https://example.com/one" });
  const b = item({ id: "b", source_url: "https://example.com/two" });
  const q = stubQ([a, b]);
  const first = rebuildSpaceEdges(q, "s1", 5000);
  const before = q.edges.length;
  const second = rebuildSpaceEdges(q, "s1", 6000);
  expect(second).toBe(0);
  expect(q.edges.length).toBe(before);
  expect(first).toBeGreaterThan(0);
});

test("rule 4a/4b: shared ground hue + type classification+scale -> approved related_to", () => {
  const a = item({ id: "a", type: "image", metadata: { design: design() } });
  const b = item({
    id: "b",
    type: "image",
    metadata: {
      design: design({
        palette: [{ hex: "#F2E4CE", pct: 55, role: "ground" }], // same cream/yellow hue bucket
        layout: { composition: "centered", density: "sparse", alignment: "left" }, // different, so 4c doesn't dominate the assertion
        texture: [],
        mood: [],
      }),
    },
  });
  const q = stubQ([a, b]);
  const n = deriveEdgesForItem(q, a, 5000);
  expect(n).toBe(1);
  expect(q.edges[0]).toMatchObject({
    from_id: "a",
    to_id: "b",
    relationship: "related_to",
    weight: 0.7,
    approval_state: "approved",
    created_by: "system",
  });
});

test("rule 4c: unrelated design profiles do not get linked", () => {
  const a = item({ id: "a", type: "image", metadata: { design: design() } });
  const b = item({
    id: "b",
    type: "image",
    metadata: {
      design: design({
        palette: [{ hex: "#123456", pct: 70, role: "ground" }], // blue, not the cream bucket
        typography: { classification: "monospace", case: "lowercase", scale: "small", note: "" },
        layout: { composition: "grid_contact_sheet", density: "dense", alignment: "justified" },
        texture: ["photocopy"],
        shape: { corner_radius: "pill", stroke: "heavy" },
        imagery: { treatment: "line_drawing" },
        mood: ["technical"],
      }),
    },
  });
  const q = stubQ([a, b]);
  const n = deriveEdgesForItem(q, a, 5000);
  expect(n).toBe(0);
});

test("no design profile -> no design edges, does not throw", () => {
  const a = item({ id: "a", type: "image" }); // metadata: {} — no .design
  const b = item({ id: "b", type: "image", metadata: { design: design() } });
  const q = stubQ([a, b]);
  expect(() => deriveEdgesForItem(q, a, 5000)).not.toThrow();
  expect(deriveEdgesForItem(q, a, 5000)).toBe(0);
});

test("rule 4: idempotent, re-running creates no duplicate design edge", () => {
  const a = item({ id: "a", type: "image", metadata: { design: design() } });
  const b = item({ id: "b", type: "image", metadata: { design: design() } });
  const q = stubQ([a, b]);
  const first = deriveEdgesForItem(q, a, 5000);
  const before = q.edges.length;
  const second = deriveEdgesForItem(q, a, 6000);
  expect(first).toBeGreaterThan(0);
  expect(second).toBe(0);
  expect(q.edges.length).toBe(before);
});

test("rule 4: items in different spaces are never linked", () => {
  const a = item({ id: "a", type: "image", space_id: "s1", metadata: { design: design() } });
  const b = item({ id: "b", type: "image", space_id: "s2", metadata: { design: design() } });
  const q = stubQ([a, b]);
  const n = deriveEdgesForItem(q, a, 5000);
  expect(n).toBe(0);
  expect(q.edges).toHaveLength(0);
});

test("guards: never self-edge, cap 12 per call, weights in [0,1]", () => {
  const many: ContextItem[] = [];
  for (let i = 0; i < 30; i++) {
    many.push(item({ id: `n${i}`, source_url: "https://example.com/" + i }));
  }
  const q = stubQ(many);
  const n = deriveEdgesForItem(q, many[0], 5000);
  expect(n).toBe(12);
  expect(q.edges.every((e: Inserted) => e.from_id !== e.to_id)).toBe(true);
  expect(q.edges.every((e: Inserted) => e.weight >= 0 && e.weight <= 1)).toBe(true);
});
