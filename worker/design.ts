/**
 * Design extraction — what an archived image actually looks like, as structured
 * data instead of a prose caption.
 *
 * The problem this exists to fix: an agent working from this archive only ever
 * receives text. A caption ("a poster with blue type over an orange drink")
 * tells it nothing it can build with. `#2244CC`, `didone_serif`, `hero`,
 * `halftone` are things it can build with — and things two items can be
 * compared on, which is what makes the context graph and taste matching real.
 *
 * Split by provenance, deliberately:
 *   palette  — MEASURED from pixels in the browser (src/ui/archive/palette.ts).
 *              Exact. The worker only estimates it during backfill of items
 *              that were archived before this existed, and says so via
 *              `palette_source`.
 *   the rest — JUDGED by the vision model, but constrained: every field is a
 *              closed enum from shared/contract.ts, and `coerceDesign()` below
 *              validates the model's answer against those enums rather than
 *              trusting it. An invalid value becomes the field's default, never
 *              a new vocabulary word — otherwise nothing downstream can match.
 *
 * Best-effort throughout. No AI binding, a failed call, or unparseable output
 * → null, and the item keeps whatever it already had.
 */
import {
  COMPOSITIONS,
  CORNER_RADII,
  IMAGE_TREATMENTS,
  LAYOUT_DENSITIES,
  MOODS,
  STROKE_WEIGHTS,
  TEXTURES,
  TYPE_CASES,
  TYPE_CLASSIFICATIONS,
  TYPE_SCALES,
} from "@shared/contract";
import type { DesignProfile, PaletteEntry } from "@shared/contract";
import { consumeQuota, type QuotaStore } from "./quota";

export type DesignAiLike = {
  AI?: { run: (model: string, opts: unknown) => Promise<unknown> };
};

export const DESIGN_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const MAX_MOODS = 3;
const MAX_TEXTURES = 3;
const MAX_NOTE = 120;

/**
 * Vocabularies inlined into the prompt — the model can only pick, not invent.
 *
 * Colour is deliberately NOT asked for. Measured against the real archive, the
 * model's hex estimates are hallucinated flat-UI defaults: on a cream poster
 * printed in ultramarine and burnt orange it returned #2ECC40 green as the
 * ground. Those values would then flow into hue-bucket graph edges and into the
 * agent's palette instructions, so a wrong palette is worse than none. Colour
 * comes from the browser quantizer or it does not exist.
 */
function promptFor(): string {
  return [
    "You are cataloguing a design reference for an archive. Report only what is",
    "visibly true of THIS image. Answer with a single JSON object and nothing else.",
    "",
    "Every value must be chosen from the list given. Never invent a value.",
    "",
    `"typography.classification": one of ${TYPE_CLASSIFICATIONS.join(" | ")}`,
    `"typography.case": one of ${TYPE_CASES.join(" | ")}`,
    `"typography.scale": one of ${TYPE_SCALES.join(" | ")} (how large the display type is relative to the frame)`,
    `"typography.note": a short phrase, max ${MAX_NOTE} characters, e.g. "high-contrast condensed caps"`,
    `"layout.composition": one of ${COMPOSITIONS.join(" | ")}`,
    `"layout.density": one of ${LAYOUT_DENSITIES.join(" | ")}`,
    '"layout.alignment": one of left | center | right | justified | none',
    `"texture": array of up to ${MAX_TEXTURES} from ${TEXTURES.join(" | ")}`,
    `"shape.corner_radius": one of ${CORNER_RADII.join(" | ")}`,
    `"shape.stroke": one of ${STROKE_WEIGHTS.join(" | ")}`,
    `"imagery.treatment": one of ${IMAGE_TREATMENTS.join(" | ")}`,
    `"mood": array of up to ${MAX_MOODS} from ${MOODS.join(" | ")}`,
    "",
    "Definitions, so these are not guesses:",
    "- poster_split: display type occupies one side/band, imagery the other.",
    "- type_only: there is NO significant imagery, only lettering.",
    "- grid_contact_sheet: several separate frames tiled in a grid.",
    "- full_bleed_image: one image fills the frame, type sits on top.",
    "- hero scale: the display type dominates the frame. large: prominent but not dominant.",
    "- imagery.treatment none: there is genuinely no image, only type or flat shapes.",
    "",
    'If the image contains no text at all, use "none" for every typography field.',
    "Report only what you can actually see. Do not describe a typical poster.",
  ].join("\n");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reach into a possibly-flat or possibly-nested response: `a.b` or `"a.b"`. */
function at(root: Record<string, unknown>, path: string): unknown {
  if (path in root) return root[path];
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Normalize a model's spelling of a vocabulary word. It writes "Duo-Tone",
 * "duo tone" and "duotone" interchangeably, so try the separator-as-underscore
 * form first (`layout_density`) and then the separator-removed form
 * (`duotone`). Anything still unrecognized is not coerced into a near match —
 * it becomes the caller's default, because a wrong-but-valid value is worse
 * than an honest default.
 */
function normalizeVocab(value: string): [string, string] {
  const base = value.trim().toLowerCase();
  return [base.replace(/[\s-]+/g, "_"), base.replace(/[\s_-]+/g, "")];
}

/** Model output constrained to a known vocabulary; anything else becomes `fallback`. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const [underscored, squashed] = normalizeVocab(value);
  const list = allowed as readonly string[];
  if (list.includes(underscored)) return underscored as T;
  const match = allowed.find((a) => a.replace(/_/g, "") === squashed);
  return match ?? fallback;
}

function pickMany<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const out: T[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const [underscored, squashed] = normalizeVocab(entry);
    const hit = (allowed as readonly string[]).includes(underscored)
      ? (underscored as T)
      : allowed.find((a) => a.replace(/_/g, "") === squashed);
    if (hit !== undefined && !out.includes(hit)) out.push(hit);
    if (out.length === max) break;
  }
  return out;
}

/**
 * The model is told to answer with JSON only, and mostly does — but it also
 * likes a sentence of preamble or a ```json fence. Take the outermost braces
 * rather than failing the whole extraction over packaging.
 */
export function parseLooseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (isRecord(parsed)) return parsed;
    } catch {
      // fall through to the line parser
    }
  }
  return parseKeyValueLines(text);
}

const KV_LINE = /^\s*["']?([\w.]+)["']?\s*[:=]\s*(.+?)\s*,?\s*$/;

/**
 * Rescue the answer when the model drops the braces.
 *
 * Measured against the live model: roughly one call in three comes back as
 * bare `"typography.classification": grotesque` lines with no object around
 * them and unquoted values — not JSON, but the CONTENT is just as good as a
 * well-formed reply. Throwing those away lost correct extractions to
 * packaging, so they are parsed rather than rejected.
 *
 * Values are read as plain strings; `coerceDesign()` validates every one of
 * them against the closed vocabulary afterwards, so a junk value here is
 * still incapable of reaching storage.
 */
function parseKeyValueLines(text: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const m = KV_LINE.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (value.startsWith("[")) {
      // "[a, b]" or "[]" — split rather than JSON.parse, entries are unquoted.
      out[key] = value
        .slice(1, value.endsWith("]") ? -1 : undefined)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      out[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Pull the answer object out of whatever Workers AI hands back.
 *
 * Verified against the live model, not assumed: `@cf/meta/llama-3.2-11b-vision-instruct`
 * returns `{ response: <object> }` here — already-parsed JSON, with FLAT dotted
 * keys ("typography.classification"), which `at()` reads natively. The docs
 * describe `response` as a string, and it still is for a plain prose prompt, so
 * both shapes are handled rather than betting on one.
 */
export function readModelObject(result: unknown): Record<string, unknown> | null {
  if (!isRecord(result)) return null;
  for (const key of ["response", "description", "output"]) {
    const value = result[key];
    if (isRecord(value)) return value;
    if (typeof value === "string") {
      const parsed = parseLooseJson(value);
      if (parsed) return parsed;
    }
  }
  // Some models answer with the object at the top level and no envelope.
  return "typography" in result || "typography.classification" in result ? result : null;
}

/**
 * Validate a raw model object into a DesignProfile. Pure, exported, and tested:
 * this is the function that guarantees every stored value is inside the
 * vocabulary, so graph edges and taste matching can rely on equality.
 */
export function coerceDesign(
  raw: Record<string, unknown>,
  measured: PaletteEntry[],
  now: number,
  model = DESIGN_MODEL,
): DesignProfile {
  // Measured or nothing — see promptFor(). An estimate is never stored.
  const palette = measured;
  const note = typeof at(raw, "typography.note") === "string"
    ? (at(raw, "typography.note") as string).trim().slice(0, MAX_NOTE)
    : "";

  return {
    palette,
    palette_source: palette.length > 0 ? "measured" : "none",
    typography: {
      classification: pick(at(raw, "typography.classification"), TYPE_CLASSIFICATIONS, "none"),
      case: pick(at(raw, "typography.case"), TYPE_CASES, "none"),
      scale: pick(at(raw, "typography.scale"), TYPE_SCALES, "none"),
      note,
    },
    layout: {
      composition: pick(at(raw, "layout.composition"), COMPOSITIONS, "centered"),
      density: pick(at(raw, "layout.density"), LAYOUT_DENSITIES, "balanced"),
      alignment: pick(
        at(raw, "layout.alignment"),
        ["left", "center", "right", "justified", "none"] as const,
        "none",
      ),
    },
    texture: pickMany(at(raw, "texture"), TEXTURES, MAX_TEXTURES),
    shape: {
      corner_radius: pick(at(raw, "shape.corner_radius"), CORNER_RADII, "sharp"),
      stroke: pick(at(raw, "shape.stroke"), STROKE_WEIGHTS, "none"),
    },
    imagery: { treatment: pick(at(raw, "imagery.treatment"), IMAGE_TREATMENTS, "none") },
    mood: pickMany(at(raw, "mood"), MOODS, MAX_MOODS),
    extracted_by: model,
    extracted_at: now,
  };
}

/**
 * Run the vision model over one image and return a validated profile.
 *
 * `measured` is the browser-quantized palette when we have one. Passing it does
 * two things: it keeps the exact values, and it lets the prompt skip asking for
 * colours at all, which measurably improves the fields we do want.
 */
export async function extractDesignProfile(
  env: DesignAiLike | undefined,
  bytes: Uint8Array,
  measured: PaletteEntry[],
  now: number,
  model: string = DESIGN_MODEL,
): Promise<DesignProfile | null> {
  if (!env?.AI?.run) return null;
  try {
    const result = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt: promptFor(),
      max_tokens: 700,
    });
    const raw = readModelObject(result);
    if (!raw) {
      console.warn(`design: unusable response — ${JSON.stringify(result).slice(0, 300)}`);
      return null;
    }
    return coerceDesign(raw, measured, now, model);
  } catch (e) {
    console.warn(`design: extraction failed — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Vocabulary slugs read back as the words a person would actually search with. */
function words(s: string): string {
  return s.replace(/_/g, " ");
}

/**
 * One line of prose describing the profile, appended to the item's
 * `semantic_text`.
 *
 * This is the bridge to retrieval: FTS and the embedding index only see text,
 * so without this a search for "halftone poster" or "condensed serif" could
 * never reach an item whose design profile says exactly that. Written as words
 * a person would search with, not as the raw slugs.
 */
export function designSummary(d: DesignProfile): string {
  const parts: string[] = [];

  if (d.typography.classification !== "none") {
    const t = [d.typography.scale === "none" ? "" : words(d.typography.scale), words(d.typography.classification)]
      .filter(Boolean)
      .join(" ");
    parts.push(d.typography.note ? `${t} typography — ${d.typography.note}` : `${t} typography`);
  }
  parts.push(`${words(d.layout.composition)} composition, ${d.layout.density} density`);
  if (d.texture.length > 0) parts.push(`${d.texture.map(words).join(" and ")} texture`);
  if (d.imagery.treatment !== "none") parts.push(`${words(d.imagery.treatment)} imagery`);
  if (d.shape.stroke !== "none") parts.push(`${d.shape.stroke} strokes`);
  parts.push(`${d.shape.corner_radius} corners`);
  if (d.mood.length > 0) parts.push(`${d.mood.map(words).join(", ")} mood`);
  if (d.palette.length > 0) {
    parts.push(`palette ${d.palette.map((p) => p.hex).join(" ")}`);
  }
  return parts.join("; ");
}

/** One bounded batch per alarm — the vision model is the only real cost here. */
const BACKFILL_BATCH = 4;

/**
 * Bring already-archived images up to date with a design profile.
 *
 * The person's existing archive was captured before any of this existed, and
 * their images are the whole point — an empty profile on every one of them
 * would make the feature look broken on the only data that matters. The browser
 * never saw those bytes, so the palette here is the model's estimate and is
 * labelled `palette_source: "estimated"`; re-uploading an image, or a future
 * client-side pass, upgrades it to "measured".
 *
 * Best-effort: this runs inside SpaceDO.alarm() and must never throw out of it.
 */
export async function backfillSpaceDesign(
  q: {
    imagesNeedingDesign: (spaceId: string, limit: number) => import("@shared/contract").ContextItem[];
    getItem: (id: string) => import("@shared/contract").ContextItem | null;
    updateItem: (item: import("@shared/contract").ContextItem) => void;
  } & QuotaStore,
  ownerId: string,
  env: DesignAiLike,
  spaceId: string,
  getBlob: (key: string) => Promise<Uint8Array | null>,
): Promise<{ extracted: number; morePending: boolean }> {
  const items = q.imagesNeedingDesign(spaceId, BACKFILL_BATCH);
  let extracted = 0;
  let quotaBlocked = false;

  for (const item of items) {
    if (!item.content_ref) continue;
    const bytes = await getBlob(item.content_ref).catch(() => null);
    if (!bytes) continue;
    // Same meter as the capture path (worker/quota.ts `vision_calls`). Over
    // budget → stop the batch; the rest of this space's backlog waits for the
    // next month. Don't re-arm the alarm for it (morePending below).
    if (!consumeQuota(q, ownerId, "vision_calls").ok) {
      quotaBlocked = true;
      break;
    }
    const now = Date.now();
    // Use the browser-measured palette if one has been backfilled onto this
    // item (see the PATCH path in routes.ts). Colour is never estimated, so
    // without one the profile simply carries `palette_source: "none"` until the
    // Archive page measures it.
    const stored = (item.metadata as { palette?: unknown }).palette;
    const measured = Array.isArray(stored) ? (stored as PaletteEntry[]) : [];
    const design = await extractDesignProfile(env, bytes, measured, now).catch(() => null);
    if (!design) continue;
    const fresh = q.getItem(item.id);
    if (!fresh) continue;
    const summary = designSummary(design);
    q.updateItem({
      ...fresh,
      semantic_text: fresh.semantic_text ? `${fresh.semantic_text}\n${summary}` : summary,
      metadata: { ...fresh.metadata, design },
      updated_at: now,
    });
    extracted++;
  }

  return {
    extracted,
    morePending: !quotaBlocked && q.imagesNeedingDesign(spaceId, 1).length > 0,
  };
}
