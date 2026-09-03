/**
 * Demo seed — the material a judge's guest space boots with.
 *
 * See docs/roadmap/judge-demo-access.md. A judge signs in, lands in their own
 * `kind: 'guest'` space, and gets a copy of everything below. Nothing here
 * touches the owner's space.
 *
 * ## Why the design profiles are baked
 *
 * `metadata.design` is shipped as data, not extracted on first boot. Extracting
 * would cost a Workers AI call per image per judge, take ~8s each, and — because
 * the non-palette fields are a model's judgement — hand every judge a *different*
 * profile, so no two judges would see the same demo. These are extracted once and
 * frozen.
 *
 * ## Provenance of the values, honestly
 *
 * - `palette` / `palette_source: "measured"` — genuinely measured. Produced by
 *   running the production quantizer (`src/ui/archive/palette.ts`, the same code
 *   the capture path runs in the browser) over the real pixels of the files in
 *   `demo-assets/`. Exact, not invented.
 * - everything else — judged, and `extracted_by` records who judged it. These
 *   were assigned by a model reading the images directly rather than by the
 *   vision model in `worker/design.ts`, so `extracted_by` names that model. It is
 *   never presented as human-authored.
 *
 * ## Blobs
 *
 * `content_ref` points at the fixed `demo/` R2 prefix, shared read-only by every
 * guest space, never written by one. The bytes live in `demo-assets/` in the repo
 * and are uploaded once:
 *
 *   for f in demo-assets/*; do
 *     bunx wrangler r2 object put "gotothearchive-blobs/demo/$(basename "$f")" --file "$f" --remote
 *   done
 */

import type { AuthorityClass, DesignProfile, ItemType } from "@shared/contract";
import type { Queries } from "./queries";
import { GRAPH_DERIVATION_VERSION, rebuildSpaceEdges } from "../graph-build";

/** Frozen so every judge's copy carries the same timestamps. */
const EXTRACTED_AT = 1_788_300_000_000;

/** The model that judged the non-palette design fields. Not human-authored. */
const EXTRACTED_BY = "claude-opus-5";

export interface DemoRegion {
  slug: string;
  name: string;
}

export interface DemoItem {
  region_slug: string;
  type: ItemType;
  title: string;
  /** What retrieval matches on. Written as prose, the way a person would say it. */
  semantic_text: string;
  /** R2 key under the shared read-only `demo/` prefix. Null for text items. */
  content_ref: string | null;
  design: DesignProfile | null;
}

/**
 * Three regions, matching the flow in docs/roadmap/judge-demo-access.md: a judge
 * grants Work and Inspiration and leaves Personal at `none`, so there is always
 * something the agent is genuinely refused.
 */
export const DEMO_REGIONS: DemoRegion[] = [
  { slug: "work", name: "Work" },
  { slug: "inspiration", name: "Inspiration" },
  { slug: "personal", name: "Personal" },
];

/**
 * Ten items. Seven images in Inspiration carrying real design profiles — four
 * riso-print posters that share a signature (warm off-white ground, one
 * saturated ink, halftone, hero display caps) and three frames of a monochrome
 * identity system. The posters are what make the taste loop demonstrable: they
 * agree with each other strongly enough for a real signal to be derived, and
 * that signal is grounded only in Inspiration, so revoking Inspiration takes it
 * away (F1). Work and Personal hold text, so the demo needs no upload path.
 */
export const DEMO_ITEMS: DemoItem[] = [
  {
    region_slug: "inspiration",
    type: "image",
    title: "Bright Pulp — beverage poster",
    semantic_text:
      "Riso-style drink poster. Condensed high-contrast serif caps in cobalt blue stacked in the upper left, over a halftone illustration of a citrus soda glass in burnt orange that bleeds off the right edge. Warm cream paper ground, a thin blue registration circle behind the type, visible print grain.",
    content_ref: "demo/bright-pulp.png",
    design: {
      palette: [
        { hex: "#F6ECDE", pct: 59, role: "ground" },
        { hex: "#E0723D", pct: 18, role: "primary" },
        { hex: "#2349AA", pct: 10, role: "secondary" },
        { hex: "#ECC1A1", pct: 6, role: "accent" },
        { hex: "#DF9A70", pct: 3, role: "accent" },
      ],
      palette_source: "measured",
      typography: {
        classification: "didone_serif",
        case: "uppercase",
        scale: "hero",
        note: "high-contrast condensed serif caps, tight leading",
      },
      layout: { composition: "asymmetric_stack", density: "sparse", alignment: "left" },
      texture: ["halftone", "paper_grain"],
      shape: { corner_radius: "sharp", stroke: "hairline" },
      imagery: { treatment: "halftone" },
      mood: ["retro_print", "editorial"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "After Rain — botanical poster",
    semantic_text:
      "Riso-style botanical poster. A halftone fern frond in deep green runs the full height of the right side, water beads picked out in white. Condensed serif caps in the lower left, one thin red circle and rule marking a single leaf. Off-white paper ground, generous empty space.",
    content_ref: "demo/after-rain.png",
    design: {
      palette: [
        { hex: "#F9F9F5", pct: 67, role: "ground" },
        { hex: "#4F926B", pct: 11, role: "secondary" },
        { hex: "#85B898", pct: 11, role: "accent" },
        { hex: "#197646", pct: 6, role: "primary" },
        { hex: "#AFD6BD", pct: 4, role: "accent" },
      ],
      palette_source: "measured",
      typography: {
        classification: "didone_serif",
        case: "uppercase",
        scale: "hero",
        note: "high-contrast serif caps set tight in two lines",
      },
      layout: { composition: "asymmetric_stack", density: "sparse", alignment: "left" },
      texture: ["halftone", "paper_grain"],
      shape: { corner_radius: "sharp", stroke: "hairline" },
      imagery: { treatment: "halftone" },
      mood: ["retro_print", "organic", "editorial"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "Side by Side — duotone portrait poster",
    semantic_text:
      "Poster split between heavy condensed grotesque caps stacked down the left and two halftone portraits in cobalt duotone on the right. A single thin orange line curves between the two figures, ending in small crosses. Cool off-white ground, heavy print grain.",
    content_ref: "demo/side-by-side.png",
    design: {
      palette: [
        { hex: "#1B4CA3", pct: 48, role: "primary" },
        { hex: "#F4F4F2", pct: 31, role: "ground" },
        { hex: "#BFC4D2", pct: 9, role: "accent" },
        { hex: "#5B77B3", pct: 8, role: "secondary" },
        { hex: "#909EC2", pct: 4, role: "accent" },
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "uppercase",
        scale: "hero",
        note: "heavy condensed grotesque caps, stacked one word per line",
      },
      layout: { composition: "poster_split", density: "balanced", alignment: "left" },
      texture: ["halftone", "paper_grain"],
      shape: { corner_radius: "sharp", stroke: "hairline" },
      imagery: { treatment: "duotone" },
      mood: ["editorial", "retro_print"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "Concrete Quiet — architecture poster",
    semantic_text:
      "Brutalist architecture poster. A halftone black and white photograph of a curved concrete stair and cantilevered ramp fills the frame. Condensed grotesque caps in signal red run edge to edge across the middle, underlined by a hairline rule. Warm grey paper ground, coarse print screen.",
    content_ref: "demo/concrete-quiet.png",
    design: {
      palette: [
        { hex: "#DCD7CF", pct: 51, role: "ground" },
        { hex: "#2C2E30", pct: 18, role: "text" },
        { hex: "#505050", pct: 8, role: "accent" },
        { hex: "#B2ACA6", pct: 6, role: "primary" },
        { hex: "#75706E", pct: 6, role: "secondary" },
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "uppercase",
        scale: "hero",
        note: "condensed grotesque caps, tight tracking, set edge to edge",
      },
      layout: { composition: "asymmetric_stack", density: "balanced", alignment: "left" },
      texture: ["halftone", "paper_grain"],
      shape: { corner_radius: "sharp", stroke: "hairline" },
      imagery: { treatment: "halftone" },
      mood: ["brutalist", "editorial", "retro_print"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "Four-point mark — identity sheet",
    semantic_text:
      "Contact sheet for a monochrome apparel identity. A four-point star mark shown positive and negative, then applied across washed black garments — tee front and back, hoodie, cap, shorts, track jacket — photographed on grey seamless. No display type anywhere, flat clean surfaces.",
    content_ref: "demo/nightshade-identity-sheet.png",
    design: {
      palette: [
        { hex: "#0D0D0D", pct: 53, role: "ground" },
        { hex: "#302F2F", pct: 18, role: "text" },
        { hex: "#727070", pct: 11, role: "primary" },
        { hex: "#FDFDFD", pct: 9, role: "text" },
        { hex: "#4E4D4D", pct: 8, role: "secondary" },
      ],
      palette_source: "measured",
      typography: { classification: "none", case: "none", scale: "none", note: "no display type" },
      layout: { composition: "grid_contact_sheet", density: "dense", alignment: "none" },
      texture: ["flat_clean"],
      shape: { corner_radius: "sharp", stroke: "none" },
      imagery: { treatment: "full_color_photo" },
      mood: ["minimal", "streetwear", "luxury"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "Four-point mark — outerwear application",
    semantic_text:
      "Two panels side by side. Left, a black nylon track jacket on grey seamless with the four-point star mark small on the chest. Right, the same mark alone in black on white at large scale. Flat clean product photography, no type.",
    content_ref: "demo/nightshade-outerwear.png",
    design: {
      palette: [
        { hex: "#FEFEFE", pct: 60, role: "ground" },
        { hex: "#181819", pct: 26, role: "text" },
        { hex: "#6A6A69", pct: 14, role: "primary" },
      ],
      palette_source: "measured",
      typography: { classification: "none", case: "none", scale: "none", note: "no display type" },
      layout: { composition: "poster_split", density: "balanced", alignment: "none" },
      texture: ["flat_clean"],
      shape: { corner_radius: "sharp", stroke: "none" },
      imagery: { treatment: "full_color_photo" },
      mood: ["minimal", "streetwear"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "Four-point mark — primary lockup",
    semantic_text:
      "The bare identity mark: two joined four-point stars with long tapered horizontal points, white on solid black, centred with wide margins. Vector-flat, no texture, no type.",
    content_ref: "demo/nightshade-mark.jpg",
    design: {
      palette: [
        { hex: "#000000", pct: 97, role: "ground" },
        { hex: "#FEFEFE", pct: 3, role: "text" },
      ],
      palette_source: "measured",
      typography: { classification: "none", case: "none", scale: "none", note: "no display type" },
      layout: { composition: "centered", density: "sparse", alignment: "center" },
      texture: ["flat_clean"],
      shape: { corner_radius: "organic", stroke: "none" },
      imagery: { treatment: "illustration" },
      mood: ["minimal", "luxury"],
      extracted_by: EXTRACTED_BY,
      extracted_at: EXTRACTED_AT,
    },
  },
  {
    region_slug: "work",
    type: "document",
    title: "Spring range — creative brief",
    semantic_text:
      "Creative brief for the spring range launch. One printed poster series and a landing page, sharing a single visual language. Wants the range to read as a small press object rather than a campaign: limited ink, real paper texture, display type doing the work instead of photography. Deliverables due end of month. Print first, screen adapts to it, never the other way round.",
    content_ref: null,
    design: null,
  },
  {
    region_slug: "work",
    type: "note",
    title: "Landing page copy — second pass",
    semantic_text:
      "Second pass at the landing page copy. Cut the hero paragraph to one line. The old version explained the product before showing it, which reads defensive. Section order now runs: mark, range, materials, stockists. Still unsure about the closing line — it is doing two jobs and should probably do one.",
    content_ref: null,
    design: null,
  },
  {
    region_slug: "personal",
    type: "note",
    title: "Move — flat checklist",
    semantic_text:
      "Personal move checklist. Give notice by the 12th, book a van for the last weekend, cancel the internet, redirect post, find somewhere that takes the old sofa. Deposit should come back four to six weeks after the final inspection.",
    content_ref: null,
    design: null,
  },
];

/**
 * Write the regions and items above into `spaceId`. The baked `metadata.design`
 * goes in verbatim, so `palette_source` stays `"measured"` and `extracted_at`
 * stays the frozen constant — no Workers AI call happens here or anywhere on the
 * guest boot path. Design *edges* are grown afterwards by `rebuildSpaceEdges`,
 * which reads `metadata.design` directly and never calls a model.
 *
 * The data is not restructured — this only applies it. Callers own space
 * creation (`provisionGuestSpace`) and wiping (`Queries.purgeSpace`).
 */
export function applyDemoSeed(q: Queries, spaceId: string, humanId: string, now: number): void {
  const regionIdBySlug = new Map<string, string>();
  for (const r of DEMO_REGIONS) {
    const id = crypto.randomUUID();
    regionIdBySlug.set(r.slug, id);
    q.insertRegion({ id, space_id: spaceId, parent_id: null, name: r.name, slug: r.slug, created_at: now });
  }
  for (const it of DEMO_ITEMS) {
    const regionId = regionIdBySlug.get(it.region_slug);
    if (!regionId) continue;
    q.insertItem({
      id: crypto.randomUUID(),
      space_id: spaceId,
      region_id: regionId,
      owner_id: humanId,
      type: it.type,
      title: it.title,
      source_url: null,
      content_ref: it.content_ref,
      semantic_text: it.semantic_text,
      metadata: it.design ? { design: it.design } : {},
      authority_class: "human_authored" as AuthorityClass,
      created_by: humanId,
      created_at: now,
      updated_at: now,
    });
  }
}

/**
 * Create a judge's disposable `kind: 'guest'` space and seed it. Everything
 * downstream — regions, grants, tasks, retrieval, graph, taste — is keyed off
 * `space_id` and works unmodified. Recording the graph-derivation version keeps
 * SpaceDO from rescanning the seeded space on every boot.
 */
export function provisionGuestSpace(q: Queries, humanId: string, spaceId: string, now: number): void {
  q.insertSpace({ id: spaceId, name: "Demo Archive", owner_id: humanId, kind: "guest", created_at: now });
  applyDemoSeed(q, spaceId, humanId, now);
  rebuildSpaceEdges(q, spaceId, now);
  q.recordGraphBackfill(spaceId, GRAPH_DERIVATION_VERSION, now);
}
