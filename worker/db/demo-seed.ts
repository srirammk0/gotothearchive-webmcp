/**
 * Demo seed — the material a judge's guest space boots with.
 *
 * See docs/roadmap/judge-demo-access.md. A judge opens /api/demo-entry, gets a
 * signed `demo_session` cookie, and lands in the ONE shared `kind: 'guest'`
 * space (`DEMO_SPACE_ID`) that this module seeds on first touch. Every judge
 * shares that archive; nothing here touches a real member's space.
 *
 * ## Why the design profiles are baked
 *
 * `metadata.design` is shipped as data, not extracted on first boot. Extracting
 * would cost a Workers AI call per image per judge, take ~8s each, and — because
 * the non-palette fields are a model's judgement — hand every judge a *different*
 * profile, so no two judges would see the same demo.
 *
 * ## Provenance of the values
 *
 * Nothing here was authored for the demo. Every item below is a real row lifted
 * out of the owner's own archive (the Design region), so each profile is exactly
 * what the product's own capture path produced when the image was first saved:
 *
 * - `palette` / `palette_source: "measured"` — quantized from the real pixels in
 *   the browser at capture time by `src/ui/archive/palette.ts`. Exact.
 * - everything else — judged at capture time by the vision model in
 *   `worker/design.ts`, and each profile's own `extracted_by` / `extracted_at`
 *   record which model and when. Carried through verbatim rather than re-judged,
 *   so the seed cannot drift from what the product actually does, and no Workers
 *   AI call happens on a guest boot.
 *
 * `semantic_text` is likewise the caption the capture path wrote, not demo prose.
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

/**
 * The single shared demo Space. Every judge's `demo-<nonce>` identity is pinned
 * to this id by `spaceIdFor()`, so they all land in the same archive and can
 * point their own WebMCP agents at it at once. It is `kind: 'guest'`, which is
 * the only kind `humanRegions()` will grant a non-owner write on.
 */
export const DEMO_SPACE_ID = "space-demo";

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
  /** Where a link item came from. Null for everything else. */
  source_url?: string | null;
  /** R2 key under the shared read-only `demo/` prefix. Null for text and link items. */
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
 * Twenty-one items. Eighteen sit in Inspiration and come straight from the
 * owner's Design region: eleven captured images, each carrying a real measured
 * palette and a real extracted profile, plus seven links to the posts they were
 * collected from.
 *
 * They cluster the way a real reference folder does — a run of minimal,
 * grotesque-set product and landing-page work alongside looser visual material —
 * which is what makes the taste loop demonstrable: enough agreement for a signal
 * to actually derive, grounded only in Inspiration, so revoking Inspiration takes
 * it away (F1).
 *
 * Work and Personal hold short written items instead. They are the one part of
 * the seed that is written rather than lifted: the owner's real Personal region
 * holds personal documents, which have no place in a demo a stranger opens. Text
 * also means the demo needs no upload path, which is why guests get `uploads: 0`.
 */
export const DEMO_ITEMS: DemoItem[] = [
  {
    region_slug: "inspiration",
    type: "image",
    title: "ascii hero design",
    semantic_text: "This image depicts the homepage of the Alvio website, featuring a striking central image of a man standing in a room surrounded by a large, illuminated wall of small, square, white lights. He is dressed in a light-colored suit and is holding a tablet, with a blue sky and clouds visible behind him. The image is overlaid with text, including the phrase \"10M+ Research Signals Analyzed\" in the bottom left corner and \"Open New Frontiers of Intelligence\" in the bottom left. The top of the page displays the Alvio logo and a navigation bar with options such as \"How it works\", \"Integrations\", \"Pricing\"…\nlarge grotesque typography — none; centered composition, balanced density; flat clean texture; full color photo imagery; rounded corners; luxury mood; palette #E5EBED #161A13 #343C2F #A8BCB1 #556253",
    content_ref: "demo/ascii-hero-design.png",
    design: {
      palette: [
        {
          hex: "#E5EBED",
          pct: 53,
          role: "ground"
        },
        {
          hex: "#161A13",
          pct: 16,
          role: "text"
        },
        {
          hex: "#343C2F",
          pct: 9,
          role: "text"
        },
        {
          hex: "#A8BCB1",
          pct: 8,
          role: "primary"
        },
        {
          hex: "#556253",
          pct: 6,
          role: "secondary"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "none",
        scale: "large",
        note: "none"
      },
      layout: {
        composition: "centered",
        density: "balanced",
        alignment: "center"
      },
      texture: [
        "flat_clean"
      ],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "full_color_photo"
      },
      mood: [
        "luxury"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361903030
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "flower w/ motion blur",
    semantic_text: "The image presents a captivating close-up of a flower, showcasing its intricate details and vibrant colors. The flower's petals are predominantly yellow and pink, with subtle hints of green, and appear to be in motion, as if swaying gently in the breeze. The blurred effect surrounding the flower adds a sense of dynamism and energy to the image.\n\nIn the background, a solid black surface provides a striking contrast to the flower's delicate features, drawing the viewer's attention to the subject. The overall composition is simple yet effective, allowing the viewer to focus on the beauty and eleg…\ntype only composition, sparse density; sharp corners; editorial, organic mood; palette #0F1004 #C77D3F #57401B #F1C4A6 #E2A264",
    content_ref: "demo/flower-w-motion-blur.png",
    design: {
      palette: [
        {
          hex: "#0F1004",
          pct: 71,
          role: "ground"
        },
        {
          hex: "#C77D3F",
          pct: 7,
          role: "secondary"
        },
        {
          hex: "#57401B",
          pct: 7,
          role: "accent"
        },
        {
          hex: "#F1C4A6",
          pct: 6,
          role: "primary"
        },
        {
          hex: "#E2A264",
          pct: 5,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "sparse",
        alignment: "none"
      },
      texture: [],
      shape: {
        corner_radius: "sharp",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "editorial",
        "organic"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361736550
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "creation of adam",
    semantic_text: "dithering\ntype only composition, balanced density; halftone texture; rounded corners; luxury mood; palette #FFFEFF #9F7AC6 #D2C1E4",
    content_ref: "demo/creation-of-adam.png",
    design: {
      palette: [
        {
          hex: "#FFFEFF",
          pct: 89,
          role: "ground"
        },
        {
          hex: "#9F7AC6",
          pct: 5,
          role: "primary"
        },
        {
          hex: "#D2C1E4",
          pct: 5,
          role: "secondary"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "balanced",
        alignment: "center"
      },
      texture: [
        "halftone"
      ],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "luxury"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361741677
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "minimal features section",
    semantic_text: "features section\nlarge grotesque typography — none; centered composition, balanced density; flat clean texture; rounded corners; minimal mood; palette #FDFEFD #464946 #252113 #797A6E #ACB4B5",
    content_ref: "demo/minimal-features-section.png",
    design: {
      palette: [
        {
          hex: "#FDFEFD",
          pct: 50,
          role: "primary"
        },
        {
          hex: "#464946",
          pct: 17,
          role: "ground"
        },
        {
          hex: "#252113",
          pct: 11,
          role: "secondary"
        },
        {
          hex: "#797A6E",
          pct: 10,
          role: "accent"
        },
        {
          hex: "#ACB4B5",
          pct: 3,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "mixed",
        scale: "large",
        note: "none"
      },
      layout: {
        composition: "centered",
        density: "balanced",
        alignment: "center"
      },
      texture: [
        "flat_clean"
      ],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "minimal"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361845471
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "minimal hero section",
    semantic_text: "agentic landing page design\ntype only composition, sparse density; sharp corners; palette #FDFDFD #8F826C #3F3124 #1594D4 #CCD3CE",
    content_ref: "demo/minimal-hero-section.png",
    design: {
      palette: [
        {
          hex: "#FDFDFD",
          pct: 59,
          role: "text"
        },
        {
          hex: "#8F826C",
          pct: 17,
          role: "ground"
        },
        {
          hex: "#3F3124",
          pct: 15,
          role: "primary"
        },
        {
          hex: "#1594D4",
          pct: 2,
          role: "secondary"
        },
        {
          hex: "#CCD3CE",
          pct: 2,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "sparse",
        alignment: "none"
      },
      texture: [],
      shape: {
        corner_radius: "sharp",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361796502
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "login flow minimal",
    semantic_text: "agentic startup onboarding/login flow design\nmoderate grotesque typography — none; centered composition, balanced density; hairline strokes; slight corners; editorial, minimal mood; palette #151615 #333333",
    content_ref: "demo/login-flow-minimal.png",
    design: {
      palette: [
        {
          hex: "#151615",
          pct: 61,
          role: "text"
        },
        {
          hex: "#333333",
          pct: 32,
          role: "ground"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "mixed",
        scale: "moderate",
        note: "none"
      },
      layout: {
        composition: "centered",
        density: "balanced",
        alignment: "center"
      },
      texture: [],
      shape: {
        corner_radius: "slight",
        stroke: "hairline"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "editorial",
        "minimal"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361802485
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "enterprise agentic saas landing",
    semantic_text: "hero section\nlarge grotesque typography — high-contrast condensed caps; centered composition, balanced density; halftone texture; rounded corners; editorial mood; palette #F8F7ED #C4BEAD #8C8C82 #1C1C16",
    content_ref: "demo/enterprise-agentic-saas-landing.png",
    design: {
      palette: [
        {
          hex: "#F8F7ED",
          pct: 67,
          role: "primary"
        },
        {
          hex: "#C4BEAD",
          pct: 22,
          role: "ground"
        },
        {
          hex: "#8C8C82",
          pct: 4,
          role: "secondary"
        },
        {
          hex: "#1C1C16",
          pct: 2,
          role: "text"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "mixed",
        scale: "large",
        note: "high-contrast condensed caps"
      },
      layout: {
        composition: "centered",
        density: "balanced",
        alignment: "center"
      },
      texture: [
        "halftone"
      ],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "editorial"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788362032722
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "dithered gothic concept",
    semantic_text: "nice messy dithering concept for a background, gothic style\ntype only composition, sparse density; rounded corners; minimal, experimental mood; palette #0C38B3 #CBB7A2 #536DBF #8295CF #9A8B8A",
    content_ref: "demo/dithered-gothic-concept.png",
    design: {
      palette: [
        {
          hex: "#0C38B3",
          pct: 52,
          role: "ground"
        },
        {
          hex: "#CBB7A2",
          pct: 30,
          role: "primary"
        },
        {
          hex: "#536DBF",
          pct: 4,
          role: "secondary"
        },
        {
          hex: "#8295CF",
          pct: 3,
          role: "accent"
        },
        {
          hex: "#9A8B8A",
          pct: 2,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "sparse",
        alignment: "center"
      },
      texture: [],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "minimal",
        "experimental"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361867978
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "simple hero section",
    semantic_text: "landing hero section for startup w/ dithered focused image\ntype only composition, balanced density; sharp corners; palette #FCFCFD #C0C0EC #4040EA #8080EB #1313DC",
    content_ref: "demo/simple-hero-section.png",
    design: {
      palette: [
        {
          hex: "#FCFCFD",
          pct: 65,
          role: "ground"
        },
        {
          hex: "#C0C0EC",
          pct: 10,
          role: "accent"
        },
        {
          hex: "#4040EA",
          pct: 9,
          role: "primary"
        },
        {
          hex: "#8080EB",
          pct: 8,
          role: "secondary"
        },
        {
          hex: "#1313DC",
          pct: 3,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "balanced",
        alignment: "center"
      },
      texture: [],
      shape: {
        corner_radius: "sharp",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361920850
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "onboarding flow minimal agentic startup",
    semantic_text: "onboarding flow for an agentic startup landing\nlarge grotesque typography — none; type only composition, balanced density; hairline strokes; slight corners; editorial, minimal mood; palette #1C1C1C",
    content_ref: "demo/onboarding-flow-minimal-agentic-startup.png",
    design: {
      palette: [
        {
          hex: "#1C1C1C",
          pct: 91,
          role: "ground"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "grotesque",
        case: "mixed",
        scale: "large",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "balanced",
        alignment: "center"
      },
      texture: [],
      shape: {
        corner_radius: "slight",
        stroke: "hairline"
      },
      imagery: {
        treatment: "none"
      },
      mood: [
        "editorial",
        "minimal"
      ],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788361931899
    }
  },
  {
    region_slug: "inspiration",
    type: "image",
    title: "ai agent hero background concept",
    semantic_text: "This image depicts a website landing page, featuring a striking blue and beige color scheme. The top section, in blue, displays a navigation bar with white text, including \"About,\" \"Product,\" \"Contact Us,\" \"Moonlight,\" \"Login,\" and \"Sign Up.\" The central section showcases a large blue spiral pattern on a beige background, accompanied by the phrase \"The AI Agent That Keeps Everything Aligned\" in white text. Below this, a smaller white text reads, \"Keep Check on every activity related to your day to day tasks and with a single agent.\" A blue \"Get Started\" button is prominently displayed below. T…\ntype only composition, balanced density; rounded corners; palette #062BA6 #DDD5C6 #A1ABBE #6582B5",
    content_ref: "demo/ai-agent-hero-background-concept.png",
    design: {
      palette: [
        {
          hex: "#062BA6",
          pct: 44,
          role: "ground"
        },
        {
          hex: "#DDD5C6",
          pct: 35,
          role: "primary"
        },
        {
          hex: "#A1ABBE",
          pct: 12,
          role: "secondary"
        },
        {
          hex: "#6582B5",
          pct: 6,
          role: "accent"
        }
      ],
      palette_source: "measured",
      typography: {
        classification: "none",
        case: "none",
        scale: "none",
        note: "none"
      },
      layout: {
        composition: "type_only",
        density: "balanced",
        alignment: "center"
      },
      texture: [],
      shape: {
        corner_radius: "rounded",
        stroke: "none"
      },
      imagery: {
        treatment: "none"
      },
      mood: [],
      extracted_by: "@cf/meta/llama-3.2-11b-vision-instruct",
      extracted_at: 1788362084031
    }
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "video design",
    semantic_text: "more language exploration https://t.co/yChH7pIOsp",
    source_url: "https://x.com/ayushsoni_io/status/2093976615407718587?s=20",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "startup post 1",
    semantic_text: "editorial vibe",
    source_url: "https://x.com/miralizain/status/2093662498104934885?s=20",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "playful post for cardinal",
    semantic_text: "geometric graphic",
    source_url: "https://x.com/ayushsoni_io/status/2093991380003815645?s=20",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "my favorite poster concept",
    semantic_text: "very good beautiful poster concept made for founders inc, my favority",
    source_url: "https://x.com/ayushsoni_io/status/2094767901651669281?s=20",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "posters!",
    semantic_text: "geomtric",
    source_url: "https://x.com/ayushsoni_io/status/2093993497573707811?s=20",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "Latest Visuals from Agent Index brand",
    semantic_text: "Latest Visuals from Agent Index brand",
    source_url: "https://x.com/yahyavision/status/2094740298555695176?s=46",
    content_ref: null,
    design: null
  },
  {
    region_slug: "inspiration",
    type: "link",
    title: "Brand identity direction for Cicely, focusing on making the brand feel youthful,",
    semantic_text: "Brand identity direction for Cicely, focusing on making the brand feel youthful, accessible, tactile, and vibrant.",
    source_url: "https://x.com/swarnima_otw/status/2094679145771160055?s=46",
    content_ref: null,
    design: null
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
      source_url: it.source_url ?? null,
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
 * Create the shared `kind: 'guest'` demo space and seed it, on the first judge
 * to arrive (`humanId` is just whoever that was — every later judge shares the
 * space, none owns it in a meaningful sense). Everything downstream — regions,
 * grants, tasks, retrieval, graph, taste — is keyed off `space_id` and works
 * unmodified. Recording the graph-derivation version keeps SpaceDO from
 * rescanning the seeded space on every boot.
 */
export function provisionGuestSpace(q: Queries, humanId: string, spaceId: string, now: number): void {
  q.insertSpace({ id: spaceId, name: "Demo Archive", owner_id: humanId, kind: "guest", created_at: now });
  applyDemoSeed(q, spaceId, humanId, now);
  rebuildSpaceEdges(q, spaceId, now);
  q.recordGraphBackfill(spaceId, GRAPH_DERIVATION_VERSION, now);
}
