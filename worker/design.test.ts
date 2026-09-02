/**
 * The guarantee under test: whatever the vision model says, what gets STORED is
 * inside the closed vocabulary from shared/contract.ts. Graph edges and taste
 * matching compare these values for equality, so a single invented word breaks
 * matching silently rather than loudly.
 */
import { test, expect } from "bun:test";
import { COMPOSITIONS, MOODS, TEXTURES, TYPE_CLASSIFICATIONS } from "@shared/contract";
import type { PaletteEntry } from "@shared/contract";
import { coerceDesign, designSummary, parseLooseJson } from "./design";

const measured: PaletteEntry[] = [
  { hex: "#F5EBDE", pct: 57, role: "ground" },
  { hex: "#E4753F", pct: 17, role: "primary" },
  { hex: "#2149AC", pct: 8, role: "accent" },
];

test("a well-formed answer survives intact", () => {
  const d = coerceDesign(
    {
      typography: { classification: "didone_serif", case: "uppercase", scale: "hero", note: "condensed caps" },
      layout: { composition: "poster_split", density: "sparse", alignment: "left" },
      texture: ["halftone", "paper_grain"],
      shape: { corner_radius: "sharp", stroke: "hairline" },
      imagery: { treatment: "duotone" },
      mood: ["editorial", "retro_print"],
    },
    measured,
    1,
  );
  expect(d.typography.classification).toBe("didone_serif");
  expect(d.layout.composition).toBe("poster_split");
  expect(d.texture).toEqual(["halftone", "paper_grain"]);
  expect(d.palette).toEqual(measured);
  expect(d.palette_source).toBe("measured");
});

test("invented vocabulary is replaced by the field default, never stored", () => {
  const d = coerceDesign(
    {
      typography: { classification: "swiss_modernist", case: "SHOUTY", scale: "enormous" },
      layout: { composition: "vibes", density: "airy" },
      texture: ["risograph", "halftone", "sparkles"],
      imagery: { treatment: "duo-tone" },
      mood: ["editorial", "cinematic", "brutalist"],
    },
    measured,
    1,
  );
  expect(TYPE_CLASSIFICATIONS).toContain(d.typography.classification);
  expect(d.typography.classification).toBe("none");
  expect(COMPOSITIONS).toContain(d.layout.composition);
  expect(d.layout.density).toBe("balanced");
  // "risograph" and "sparkles" are not in the vocabulary; "halftone" is.
  expect(d.texture).toEqual(["halftone"]);
  for (const t of d.texture) expect(TEXTURES).toContain(t);
  // Hyphen/space/case are normalized rather than rejected.
  expect(d.imagery.treatment).toBe("duotone");
  expect(d.mood).toEqual(["editorial", "brutalist"]);
  for (const m of d.mood) expect(MOODS).toContain(m);
});

test("a flat (un-nested) answer is read the same way", () => {
  const d = coerceDesign(
    { "typography.classification": "grotesque", "layout.density": "dense" },
    measured,
    1,
  );
  expect(d.typography.classification).toBe("grotesque");
  expect(d.layout.density).toBe("dense");
});

test("a measured palette always wins over an estimated one", () => {
  const d = coerceDesign({ palette: [{ hex: "#000000", pct: 90, role: "ground" }] }, measured, 1);
  expect(d.palette).toEqual(measured);
  expect(d.palette_source).toBe("measured");
});

test("a model-estimated palette is refused, not stored", () => {
  // Measured against the real archive: asked for the colours of a cream poster
  // printed in ultramarine and burnt orange, the model answered #2ECC40 green —
  // generic flat-UI defaults, not the image. Those values would flow into
  // hue-bucket graph edges and into the palette an agent is told to build with,
  // so a wrong palette is materially worse than no palette. Colour is measured
  // from real pixels in the browser or it does not exist.
  const d = coerceDesign(
    { palette: [{ hex: "#2ECC40", pct: 40, role: "ground" }], mood: ["editorial"] },
    [],
    1,
  );
  expect(d.palette).toEqual([]);
  expect(d.palette_source).toBe("none");
  // The non-colour fields the model IS reliable at still come through.
  expect(d.mood).toEqual(["editorial"]);
});

test("no palette at all is a state, not an error", () => {
  expect(coerceDesign({}, [], 1).palette_source).toBe("none");
});

test("JSON is recovered from prose and fences around it", () => {
  expect(parseLooseJson('Sure! ```json\n{"mood":["minimal"]}\n``` hope that helps')).toEqual({
    mood: ["minimal"],
  });
  expect(parseLooseJson("no object here")).toBeNull();
  expect(parseLooseJson("{not json}")).toBeNull();
});

test("a brace-less key:value answer is still read", () => {
  // Observed live, roughly one call in three: the model drops the braces and
  // the value quotes entirely. The content is as good as a well-formed reply,
  // so it is parsed rather than thrown away.
  const raw = parseLooseJson(
    [
      '"typography.classification": grotesque',
      '"typography.case": uppercase',
      '"layout.composition": poster_split',
      '"texture": [halftone, paper_grain]',
      '"mood": []',
    ].join("\n"),
  );
  expect(raw).not.toBeNull();
  const d = coerceDesign(raw!, measured, 1);
  expect(d.typography.classification).toBe("grotesque");
  expect(d.typography.case).toBe("uppercase");
  expect(d.layout.composition).toBe("poster_split");
  expect(d.texture).toEqual(["halftone", "paper_grain"]);
  expect(d.mood).toEqual([]);
});

test("the summary carries the terms someone would actually search for", () => {
  const line = designSummary(
    coerceDesign(
      {
        typography: { classification: "didone_serif", scale: "hero", note: "condensed caps" },
        layout: { composition: "poster_split", density: "sparse" },
        texture: ["halftone"],
        imagery: { treatment: "duotone" },
        mood: ["editorial"],
      },
      measured,
      1,
    ),
  );
  // These are the words that let FTS and the embedding index reach this item.
  for (const term of ["didone serif", "hero", "poster split", "halftone", "duotone", "editorial", "#E4753F"]) {
    expect(line).toContain(term);
  }
});
