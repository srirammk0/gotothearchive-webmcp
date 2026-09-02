/**
 * Exact colour palette, measured from the real pixels, in the browser.
 *
 * Why here and not in the worker: the Worker runtime has no image decoder, so
 * extracting colour server-side would mean shipping a WASM codec or asking a
 * vision model to guess hex values. The browser is already holding the decoded
 * file at the moment of capture — `createImageBitmap` + a canvas gives us the
 * true pixels for free, with no AI call and no Cloudflare cost.
 *
 * Everything else about an image's design (typography, layout, texture, mood)
 * is a judgement and belongs to the vision model in worker/design.ts. Colour is
 * a fact, so it is measured. `DesignProfile.palette_source` records which of the
 * two a stored palette came from.
 */
import type { PaletteEntry, PaletteRole } from "@shared/contract";

/** Downscale target. 160px is plenty for area proportions and keeps this ~1ms. */
const SAMPLE_EDGE = 160;
/** 5 bits per channel: 32³ buckets. Fine enough to separate a duotone's inks,
 *  coarse enough that photographic gradients collapse into one entry. */
const BITS = 3;
const MAX_COLORS = 5;
/** Below this share of the frame a colour is noise, not part of the palette. */
const MIN_PCT = 2;

interface Bucket {
  r: number;
  g: number;
  b: number;
  n: number;
}

function channel(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function hex(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** HSL-ish saturation and lightness, 0..1. Used only to assign roles. */
function satLum(r: number, g: number, b: number): { s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Squared RGB distance — cheap, and good enough to merge near-duplicate bins. */
function dist2(a: Bucket, b: Bucket): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Two bins this close are the same ink to a human eye (JND in plain RGB is
 * roughly 30). Without merging, a halftone or a paper grain returns five
 * near-identical creams and no accent colour at all.
 */
const MERGE_DIST2 = 48 * 48;

/**
 * Assign each colour a role.
 *
 * `groundIndex` comes from the frame border (see groundIndexFromBorder), not
 * from coverage. Measured against the real archive: a duotone poster
 * whose portraits are printed in the ink colour has more ink pixels than paper
 * pixels, and coverage alone called the ink the ground. What is at the edges is
 * the paper.
 *
 * Remaining colours rank by coverage x saturation — saturation alone promoted a
 * 2%-coverage deep green over the 19% green the design is actually built from.
 * A desaturated near-black or near-white that is not the ground is text.
 *
 * Roles are a heuristic and only ever a label; the hex values are exact either
 * way, and `DesignProfile.palette` keeps them in coverage order regardless.
 */
function assignRoles(buckets: Bucket[], total: number, groundIndex: number): PaletteEntry[] {
  const entries = buckets.map((b) => ({
    ...b,
    pct: Math.round((b.n / total) * 100),
    ...satLum(b.r, b.g, b.b),
  }));

  const out: PaletteEntry[] = [];
  if (entries.length === 0) return out;

  const ground = entries[groundIndex] ?? entries[0];
  const rest = entries.filter((e) => e !== ground);
  out.push({ hex: hex(ground.r, ground.g, ground.b), pct: ground.pct, role: "ground" });

  // Coverage x saturation: the ink the design is built from, not the rarest one.
  // oxlint-disable-next-line unicorn/no-array-sort -- fresh local array
  const ranked = [...rest].sort((a, b) => b.pct * b.s - a.pct * a.s || b.pct - a.pct);
  let inkIndex = 0;
  for (const e of ranked) {
    let role: PaletteRole;
    if (e.s < 0.18 && (e.l < 0.28 || e.l > 0.86)) {
      role = "text";
    } else {
      role = inkIndex === 0 ? "primary" : inkIndex === 1 ? "secondary" : "accent";
      inkIndex++;
    }
    out.push({ hex: hex(e.r, e.g, e.b), pct: e.pct, role });
  }
  // Restore coverage order for presentation; roles are already fixed.
  // oxlint-disable-next-line unicorn/no-array-sort -- fresh local array
  return out.sort((a, b) => b.pct - a.pct);
}

/**
 * Which palette entry is the paper: every pixel in the outermost ring votes for
 * its nearest entry, and the most votes wins.
 *
 * A MEAN over the ring was tried first and is worse than useless — a poster
 * that bleeds artwork to one edge averages paper and ink into a colour that is
 * neither, which then snaps to some minor entry. Both real regressions came
 * from that. A mode is contaminated-edge-proof: the paper only has to be the
 * plurality of the border, not all of it.
 *
 * Returns null when the ring is empty or nothing wins outright.
 */
function groundIndexFromBorder(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  entries: Bucket[],
): number | null {
  if (entries.length === 0) return null;
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.04));
  const votes: number[] = Array.from({ length: entries.length }, () => 0);
  let counted = 0;

  for (let y = 0; y < h; y++) {
    const edgeRow = y < ring || y >= h - ring;
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= ring && x < w - ring) continue;
      const i = (y * w + x) * 4;
      if (pixels[i + 3] < 128) continue;
      const px: Bucket = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], n: 1 };
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let k = 0; k < entries.length; k++) {
        const d = dist2(entries[k], px);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      votes[best]++;
      counted++;
    }
  }
  if (counted === 0) return null;
  let winner = 0;
  for (let k = 1; k < votes.length; k++) if (votes[k] > votes[winner]) winner = k;
  // A bare plurality on a busy edge is not evidence; fall back to coverage.
  return votes[winner] / counted >= 0.4 ? winner : null;
}

/**
 * Quantize decoded RGBA into the top few colours by area.
 *
 * `width`/`height` are optional: without them the border-ring ground hint is
 * skipped and the largest area becomes the ground, which is the old behaviour.
 * Exported for testing.
 */
export function quantize(pixels: Uint8ClampedArray, width?: number, height?: number): PaletteEntry[] {
  const shift = 8 - BITS;
  const bins = new Map<number, Bucket>();
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    // Transparent pixels are not part of the design's colour story — a logo on
    // a transparent ground would otherwise report black as its dominant colour.
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> shift) << (BITS * 2)) | ((g >> shift) << BITS) | (b >> shift);
    const bucket = bins.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n++;
    } else {
      bins.set(key, { r, g, b, n: 1 });
    }
    total++;
  }
  if (total === 0) return [];

  // Bucket centroid, not the bin's corner — keeps the reported hex true.
  const centroids: Bucket[] = [...bins.values()].map((b) => ({
    r: b.r / b.n,
    g: b.g / b.n,
    b: b.b / b.n,
    n: b.n,
  }));
  // oxlint-disable-next-line unicorn/no-array-sort -- fresh local array
  centroids.sort((a, b) => b.n - a.n);

  const merged: Bucket[] = [];
  for (const c of centroids) {
    const near = merged.find((m) => dist2(m, c) < MERGE_DIST2);
    if (near) {
      // Weighted mean, so the larger area keeps pulling the colour.
      const n = near.n + c.n;
      near.r = (near.r * near.n + c.r * c.n) / n;
      near.g = (near.g * near.n + c.g * c.n) / n;
      near.b = (near.b * near.n + c.b * c.n) / n;
      near.n = n;
    } else if (merged.length < MAX_COLORS * 3) {
      merged.push({ ...c });
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- fresh local array
  merged.sort((a, b) => b.n - a.n);

  const kept = merged.filter((b) => (b.n / total) * 100 >= MIN_PCT).slice(0, MAX_COLORS);
  const palette = kept.length > 0 ? kept : merged.slice(0, 1);
  const ground =
    width && height && width * height * 4 <= pixels.length
      ? groundIndexFromBorder(pixels, width, height, palette)
      : null;
  return assignRoles(palette, total, ground ?? 0);
}

/**
 * Measure one image file's palette. Returns `[]` on any failure — a missing
 * palette is a normal state (`palette_source: "estimated" | "none"`), never an
 * error the person needs to see.
 */
export async function measurePalette(file: Blob): Promise<PaletteEntry[]> {
  if (typeof createImageBitmap !== "function") return [];
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(bitmap, 0, 0, w, h);
    return quantize(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
}
