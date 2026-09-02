/**
 * Role assignment, pinned against the two cases that actually broke it when
 * this was run over the real archive.
 *
 * The hex values were never the problem — they are measured and were exact from
 * the first version. Both bugs were in deciding WHICH measured colour is the
 * paper and which is the ink.
 */
import { test, expect } from "bun:test";
import { quantize } from "./palette";

/** Build RGBA for a w×h image from a per-pixel colour function. */
function image(w: number, h: number, at: (x: number, y: number) => [number, number, number, number?]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = at(x, y);
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return px;
}

const CREAM: [number, number, number] = [245, 235, 222];
const BLUE: [number, number, number] = [28, 77, 165];
const roleOf = (pal: ReturnType<typeof quantize>, hex: string) => pal.find((p) => p.hex === hex)?.role;

test("the ink can out-cover the paper and the paper is still the ground", () => {
  // The SIDE BY SIDE poster: cream stock, but the duotone portraits are printed
  // in the ink, so the ink has MORE pixels than the paper. Coverage alone called
  // the blue the ground. The border is still overwhelmingly cream.
  const w = 100;
  const h = 100;
  const px = image(w, h, (x, y) => {
    const border = x < 6 || y < 6 || x >= w - 6 || y >= h - 6;
    if (border) return CREAM;
    return y > 25 ? BLUE : CREAM; // ~70% blue overall
  });
  const pal = quantize(px, w, h);
  expect(roleOf(pal, "#F5EBDE")).toBe("ground");
  expect(roleOf(pal, "#1C4DA5")).toBe("primary");
});

test("a genuinely dark board keeps its dark ground", () => {
  // The streetwear board: near-black really is the paper. An earlier attempt
  // that averaged the border ring landed between the black and the panel grey
  // and handed "ground" to a minor colour.
  const w = 100;
  const h = 100;
  const px = image(w, h, (x, y) => (x > 60 && y > 60 ? [115, 114, 113] : [14, 14, 14]));
  const pal = quantize(px, w, h);
  expect(roleOf(pal, "#0E0E0E")).toBe("ground");
});

test("the dominant ink outranks a rarer, more saturated one", () => {
  // Ranking by saturation alone promoted a 2%-coverage deep green over the 19%
  // green the design was actually built from.
  const w = 100;
  const h = 100;
  const px = image(w, h, (x, y) => {
    if (x < 6 || y < 6 || x >= w - 6 || y >= h - 6) return [250, 249, 246];
    if (y < 30) return [127, 177, 146]; // lots of muted green
    if (y < 34) return [19, 125, 72]; // a sliver of vivid green
    return [250, 249, 246];
  });
  const pal = quantize(px, w, h);
  expect(roleOf(pal, "#7FB192")).toBe("primary");
  expect(roleOf(pal, "#137D48")).not.toBe("primary");
});

test("transparent pixels are not part of the palette", () => {
  // A logo on a transparent ground otherwise reports black as its main colour.
  const w = 40;
  const h = 40;
  const px = image(w, h, (x, y) => (x > 15 && x < 25 && y > 15 && y < 25 ? [230, 30, 30] : [0, 0, 0, 0]));
  const pal = quantize(px, w, h);
  expect(pal.length).toBe(1);
  expect(pal[0].hex).toBe("#E61E1E");
});

test("an empty image yields no palette rather than throwing", () => {
  expect(quantize(new Uint8ClampedArray(0), 0, 0)).toEqual([]);
});
