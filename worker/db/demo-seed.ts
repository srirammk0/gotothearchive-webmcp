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

import type { AuthorityClass, DesignProfile, ItemType, TasteDimension } from "@shared/contract";
import { confidenceFrom } from "@shared/contract";
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
  const itemIdByTitle = new Map<string, string>();
  for (const it of DEMO_ITEMS) {
    const regionId = regionIdBySlug.get(it.region_slug);
    if (!regionId) continue;
    const itemId = crypto.randomUUID();
    itemIdByTitle.set(it.title, itemId);
    q.insertItem({
      id: itemId,
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
  seedShowcase(q, spaceId, humanId, now, regionIdBySlug, itemIdByTitle);
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * A finished slice of real work on top of the seeded references: one task, one
 * agent session, three well-designed artifacts with version history, the
 * provenance behind them (references used vs items merely accessed), one review
 * trail, and four taste signals grounded in all of it. This is what a judge sees
 * when they open the Workbench and the Taste page — a populated product, not an
 * empty shell. `purgeSpace` clears every table touched here, so a `?reset=1`
 * re-seed just runs this again from clean.
 */
function seedShowcase(
  q: Queries,
  spaceId: string,
  humanId: string,
  now: number,
  regionIdBySlug: Map<string, string>,
  itemIdByTitle: Map<string, string>,
): void {
  const inspirationId = regionIdBySlug.get("inspiration") ?? null;
  const item = (title: string): string => {
    const id = itemIdByTitle.get(title);
    if (!id) throw new Error(`demo showcase cites unknown item: ${title}`);
    return id;
  };

  /* ---- 2a. task + agent session ---- */
  const taskId = crypto.randomUUID();
  q.insertTask({
    id: taskId,
    space_id: spaceId,
    project_id: null,
    human_id: humanId,
    title: "Alvio spring launch — landing page, poster, pricing",
    instruction: "Draft the launch set from the Inspiration references.",
    status: "open",
    created_at: now - 6 * DAY,
    expires_at: null,
  });
  const sessionId = crypto.randomUUID();
  q.insertAgentSession({
    id: sessionId,
    human_id: humanId,
    task_id: taskId,
    declared: { client: "Claude", provider: "anthropic", model: "claude-sonnet-4" },
    created_at: now - 6 * DAY + HOUR,
  });

  /* ---- 2b. three artifacts ---- */
  const a1v1 = crypto.randomUUID();
  const a1v2 = crypto.randomUUID();
  const a1 = crypto.randomUUID();
  q.insertArtifact({
    id: a1,
    space_id: spaceId,
    task_id: taskId,
    kind: "visual_brief",
    title: "Alvio — launch landing page",
    region_id: inspirationId,
    created_at: now - 5 * DAY - 2 * HOUR,
  });
  q.insertArtifactVersion({
    id: a1v1,
    artifact_id: a1,
    version_no: 1,
    parent_version_id: null,
    content_html: alvioLandingHtml({
      heroSize: "clamp(40px, 7vw, 72px)",
      heroLeading: "1.05",
      heroTracking: "-0.01em",
    }),
    agent_session_id: sessionId,
    state: "changes_requested",
    created_at: now - 5 * DAY,
  });
  q.insertArtifactVersion({
    id: a1v2,
    artifact_id: a1,
    version_no: 2,
    parent_version_id: a1v1,
    content_html: alvioLandingHtml({
      heroSize: "clamp(56px, 10vw, 112px)",
      heroLeading: "0.95",
      heroTracking: "-0.035em",
    }),
    agent_session_id: sessionId,
    state: "approved_with_notes",
    created_at: now - 3 * DAY,
  });

  const a2 = crypto.randomUUID();
  const a2v1 = crypto.randomUUID();
  q.insertArtifact({
    id: a2,
    space_id: spaceId,
    task_id: taskId,
    kind: "visual_brief",
    title: "Bright Pulp — launch poster",
    region_id: inspirationId,
    created_at: now - 4 * DAY - HOUR,
  });
  q.insertArtifactVersion({
    id: a2v1,
    artifact_id: a2,
    version_no: 1,
    parent_version_id: null,
    content_html: brightPulpPosterHtml(),
    agent_session_id: sessionId,
    state: "ready_for_review",
    created_at: now - 4 * DAY,
  });

  const a3 = crypto.randomUUID();
  const a3v1 = crypto.randomUUID();
  q.insertArtifact({
    id: a3,
    space_id: spaceId,
    task_id: taskId,
    kind: "visual_brief",
    title: "Pricing — plan toggle",
    region_id: inspirationId,
    created_at: now - 2 * DAY - HOUR,
  });
  q.insertArtifactVersion({
    id: a3v1,
    artifact_id: a3,
    version_no: 1,
    parent_version_id: null,
    content_html: pricingComponentHtml(),
    agent_session_id: sessionId,
    state: "approved",
    created_at: now - 2 * DAY,
  });

  /* ---- 2c. provenance: influences (used) + accesses (retrieved) ---- */
  const influence = (versionId: string, title: string, strength: number, note: string): void => {
    q.insertInfluence({
      id: crypto.randomUUID(),
      version_id: versionId,
      item_id: item(title),
      role: "reference",
      strength,
      note,
    });
  };
  influence(a1v1, "minimal features section", 0.8, "Feature row as hairline-split columns, not boxed cards.");
  influence(a1v1, "enterprise agentic saas landing", 0.7, "Warm off-white ground and editorial restraint.");
  influence(a1v1, "ascii hero design", 0.55, "Grotesque hero type carrying the whole frame.");
  influence(a1v2, "minimal features section", 0.9, "Kept the hairline column rules through the revision.");
  influence(a1v2, "ascii hero design", 0.85, "Pushed the headline bigger and tighter, per review.");
  influence(a2v1, "my favorite poster concept", 0.9, "Small-press object: limited ink, display type does the work.");
  influence(a2v1, "posters!", 0.6, "Geometric registration mark behind the wordmark.");
  influence(a3v1, "login flow minimal", 0.7, "Hairline strokes, restrained accent on one control.");
  influence(a3v1, "simple hero section", 0.55, "Single accent hue against a near-white ground.");

  q.insertAccesses([
    // A1 — two of these are also influences, two are look-only.
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("minimal features section"), tool_name: "get_context_for_task", at: now - 5 * DAY - 5 * HOUR, why: "Closest reference for a hairline-split feature row.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("enterprise agentic saas landing"), tool_name: "get_context_for_task", at: now - 5 * DAY - 5 * HOUR, why: "Editorial landing page on a warm ground.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("minimal hero section"), tool_name: "get_context_for_task", at: now - 5 * DAY - 5 * HOUR, why: "Checked its hero spacing, did not use the layout.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("simple hero section"), tool_name: "get_context_for_task", at: now - 5 * DAY - 4 * HOUR, why: "Scanned for hero treatments, went another way.", applied_signal_ids: [] },
    // A2
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("my favorite poster concept"), tool_name: "get_context_for_task", at: now - 4 * DAY - 3 * HOUR, why: "The poster direction the brief points at.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("posters!"), tool_name: "get_context_for_task", at: now - 4 * DAY - 3 * HOUR, why: "Geometric poster set for the registration mark.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("dithered gothic concept"), tool_name: "get_context_for_task", at: now - 4 * DAY - 2 * HOUR, why: "Considered a dithered ground, dropped it as too heavy.", applied_signal_ids: [] },
    // A3
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("login flow minimal"), tool_name: "get_context_for_task", at: now - 2 * DAY - 3 * HOUR, why: "Reference for restrained product UI chrome.", applied_signal_ids: [] },
    { id: crypto.randomUUID(), task_id: taskId, item_id: item("onboarding flow minimal agentic startup"), tool_name: "get_context_for_task", at: now - 2 * DAY - 2 * HOUR, why: "Looked at its step layout, not used in the pricing table.", applied_signal_ids: [] },
  ]);

  /* ---- 2d. review trail on Artifact 1 ---- */
  const annotationId = crypto.randomUUID();
  q.insertAnnotation({
    id: annotationId,
    version_id: a1v1,
    author_id: humanId,
    target: null,
    sentiment: "negative",
    dimensions: ["typography", "visual_hierarchy"],
    comment:
      "The hero type is too polite. Push it bigger and tighten the tracking — it should dominate the frame.",
    status: "resolved",
    created_at: now - 4 * DAY,
  });
  q.insertDecision({
    id: crypto.randomUUID(),
    version_id: a1v1,
    actor_id: humanId,
    decision: "request_changes",
    note: "Bigger headline, then it's there.",
    prev_state: "ready_for_review",
    at: now - 4 * DAY + HOUR,
  });
  q.insertDecision({
    id: crypto.randomUUID(),
    version_id: a1v2,
    actor_id: humanId,
    decision: "approve_with_notes",
    note: "Good. Ship this.",
    prev_state: "in_review",
    at: now - 3 * DAY + HOUR,
  });

  /* ---- 2e. four taste signals ---- */
  const signal = (opts: {
    statement: string;
    dimensions: TasteDimension[];
    status: "confirmed" | "proposed";
    createdAt: number;
    evidence: { item_id?: string; annotation_id?: string; version_id?: string }[];
    proposedAt: number;
    acceptedAt?: number;
  }): void => {
    const id = crypto.randomUUID();
    q.insertTasteSignal({
      id,
      space_id: spaceId,
      owner_id: humanId,
      statement: opts.statement,
      dimensions: opts.dimensions,
      scope: "personal",
      project_id: null,
      status: opts.status,
      confidence: confidenceFrom(opts.evidence.length, 0),
      created_by: "human",
      approved_by: opts.status === "confirmed" ? humanId : null,
      supersedes: null,
      created_at: opts.createdAt,
    });
    for (const e of opts.evidence) {
      q.insertTasteEvidence({
        id: crypto.randomUUID(),
        signal_id: id,
        kind: "supports",
        annotation_id: e.annotation_id ?? null,
        version_id: e.version_id ?? null,
        item_id: e.item_id ?? null,
      });
    }
    q.insertTasteEvent({
      id: crypto.randomUUID(),
      signal_id: id,
      kind: "proposed",
      actor_type: "agent",
      actor_label: "Agent",
      agent_session_id: sessionId,
      detail: "Named from the Inspiration references",
      version_id: null,
      at: opts.proposedAt,
    });
    if (opts.acceptedAt !== undefined) {
      q.insertTasteEvent({
        id: crypto.randomUUID(),
        signal_id: id,
        kind: "accepted",
        actor_type: "human",
        actor_label: "You",
        agent_session_id: null,
        detail: "",
        version_id: null,
        at: opts.acceptedAt,
      });
    }
  };

  signal({
    statement:
      "Landing pages breathe: one clear headline, a single accent, hairline rules between sections instead of boxed feature cards.",
    dimensions: ["layout_density", "composition"],
    status: "confirmed",
    createdAt: now - 5 * DAY,
    proposedAt: now - 5 * DAY,
    acceptedAt: now - 3 * DAY + 2 * HOUR,
    evidence: [
      { item_id: item("minimal features section") },
      { item_id: item("minimal hero section") },
      { version_id: a1v2 },
    ],
  });
  signal({
    statement:
      "Display type is grotesque, set large with tight tracking. No serif or decorative headline faces on product pages.",
    dimensions: ["typography", "visual_hierarchy"],
    status: "confirmed",
    createdAt: now - 4 * DAY + 2 * HOUR,
    proposedAt: now - 4 * DAY + 2 * HOUR,
    acceptedAt: now - 3 * DAY + 3 * HOUR,
    evidence: [
      { item_id: item("ascii hero design") },
      { item_id: item("enterprise agentic saas landing") },
      { annotation_id: annotationId },
    ],
  });
  signal({
    statement:
      "Product screenshots run full-bleed, framed by the layout — never shrunk into a bordered card.",
    dimensions: ["imagery", "composition"],
    status: "confirmed",
    createdAt: now - 3 * DAY,
    proposedAt: now - 3 * DAY,
    acceptedAt: now - 2 * DAY + HOUR,
    evidence: [
      { item_id: item("login flow minimal") },
      { item_id: item("onboarding flow minimal agentic startup") },
    ],
  });
  signal({
    statement:
      "May prefer a warm off-white ground (around #F8F7ED) over pure white for long-form pages.",
    dimensions: ["color"],
    status: "proposed",
    createdAt: now - 1 * DAY,
    proposedAt: now - 1 * DAY,
    evidence: [{ item_id: item("enterprise agentic saas landing") }],
  });
}

/* ------------------------------------------------------------------ *
 * Artifact content — every string below is a complete, self-contained
 * document: web fonts from Google Fonts, all other CSS inline, palettes
 * lifted from the measured profiles of the demo items above.
 * ------------------------------------------------------------------ */

function alvioLandingHtml(v: { heroSize: string; heroLeading: string; heroTracking: string }): string {
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="gotothearchive-aspect" content="page">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --ground:#F8F7ED; --ink:#1C1C16; --muted:#8C8C82; --line:#C4BEAD; --accent:#556253; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:var(--ground); color:var(--ink); font-family:"Inter", system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
  body { padding:64px clamp(24px, 6vw, 96px); }
  .wrap { max-width:1080px; margin:0 auto; }
  header { display:flex; justify-content:space-between; align-items:baseline; padding-bottom:48px; border-bottom:1px solid var(--line); }
  .mark { font-family:"Archivo", sans-serif; font-weight:700; letter-spacing:-0.02em; font-size:20px; }
  nav a { color:var(--ink); text-decoration:none; margin-left:28px; font-size:14px; opacity:0.75; }
  h1 { font-family:"Archivo", sans-serif; font-weight:700; font-size:${v.heroSize}; line-height:${v.heroLeading}; letter-spacing:${v.heroTracking}; margin:80px 0 20px; max-width:15ch; }
  .stat { font-size:15px; color:var(--muted); letter-spacing:0.01em; }
  .features { display:grid; grid-template-columns:repeat(3, 1fr); margin:104px 0; }
  .features > div { padding:0 36px; }
  .features > div:first-child { padding-left:0; }
  .features > div + div { border-left:1px solid var(--line); }
  .features h3 { font-family:"Archivo", sans-serif; font-weight:500; font-size:17px; margin-bottom:10px; }
  .features p { font-size:14px; color:var(--muted); line-height:1.65; }
  .cta { border-top:1px solid var(--line); padding-top:48px; display:flex; justify-content:space-between; align-items:center; gap:24px; }
  .cta p { font-family:"Archivo", sans-serif; font-weight:500; font-size:24px; letter-spacing:-0.01em; }
  .cta a { background:var(--accent); color:var(--ground); text-decoration:none; padding:14px 28px; font-size:14px; white-space:nowrap; }
</style></head><body><div class="wrap">
  <header><span class="mark">Alvio</span><nav><a>How it works</a><a>Integrations</a><a>Pricing</a></nav></header>
  <h1>Open new frontiers of intelligence</h1>
  <p class="stat">10M+ research signals analysed</p>
  <section class="features">
    <div><h3>Signal capture</h3><p>Every source your team touches, folded into one searchable archive that keeps its own provenance.</p></div>
    <div><h3>Grounded agents</h3><p>Agents draft against your references and cite the ones they used. Nothing arrives unattributed.</p></div>
    <div><h3>Taste that holds</h3><p>Confirmed preferences steer retrieval, so the second draft already knows what the first got wrong.</p></div>
  </section>
  <section class="cta"><p>Draft the launch set from your own references.</p><a>Start free</a></section>
</div></body></html>`;
}

function brightPulpPosterHtml(): string {
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="gotothearchive-aspect" content="poster">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --cream:#F6ECDE; --cobalt:#2349AA; --orange:#E0723D; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { height:100%; }
  body { background:var(--cream); font-family:"Inter", sans-serif; overflow:hidden; }
  .poster { position:relative; width:100%; height:100%; padding:56px; overflow:hidden; }
  .ring { position:absolute; top:32px; left:28px; width:300px; height:300px; border:2px solid var(--cobalt); border-radius:50%; opacity:0.4; }
  h1 { position:relative; font-family:"Playfair Display", Georgia, serif; font-weight:900; color:var(--cobalt); font-size:clamp(64px, 17vw, 148px); line-height:0.84; letter-spacing:-0.02em; text-transform:uppercase; }
  .glass { position:absolute; right:-90px; top:24%; width:340px; height:520px; background:var(--orange); border-radius:130px 130px 24px 24px; }
  .glass::after { content:""; position:absolute; left:0; right:0; top:36%; height:70px; background:rgba(246,236,222,0.32); }
  .tag { position:absolute; left:56px; bottom:104px; font-family:"Playfair Display", Georgia, serif; font-style:italic; font-weight:600; font-size:22px; color:var(--orange); }
  .meta { position:absolute; left:56px; bottom:60px; font-size:13px; letter-spacing:0.2em; text-transform:uppercase; color:var(--cobalt); }
  .grain { position:absolute; inset:0; opacity:0.13; pointer-events:none; mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
</style></head><body>
  <div class="poster">
    <div class="ring"></div>
    <div class="glass"></div>
    <h1>Bright<br>Pulp</h1>
    <div class="tag">Cold-pressed, nothing added</div>
    <div class="meta">Spring range &middot; 2026</div>
    <div class="grain"></div>
  </div>
</body></html>`;
}

function pricingComponentHtml(): string {
  return `<meta name="gotothearchive-renderer" content="component"><!doctype html><html><head>
<meta charset="utf-8">
<meta name="gotothearchive-aspect" content="wide">
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family:"Inter", system-ui, sans-serif; background:#F8F7ED; color:#1C1C16; margin:0; }
  .tight { font-family:"Inter Tight", "Inter", sans-serif; }
</style></head><body>
<div id="root"></div>
<script>
  var h = React.createElement;
  var useState = React.useState;
  var PLANS = [
    { name:"Starter", monthly:0, blurb:"For one archive and one person.", feats:["1 workspace","200 saved items","Community support"] },
    { name:"Team", monthly:24, blurb:"For a working design team.", feats:["Unlimited items","Shared taste signals","Full agent provenance","Priority support"], rec:true },
    { name:"Scale", monthly:60, blurb:"For several brands at once.", feats:["Everything in Team","SSO and audit log","Custom retention","Dedicated review lane"] }
  ];
  function App() {
    var s = useState(false); var annual = s[0]; var setAnnual = s[1];
    function price(p) { return annual ? Math.round(p.monthly * 10) : p.monthly; }
    function seg(on, label) {
      var active = annual === (on === "a");
      return h("button", { onClick:function(){ setAnnual(on === "a"); },
        className:"px-4 py-1.5 text-sm rounded-full transition " + (active ? "bg-[#1C1C16] text-[#F8F7ED]" : "text-[#8C8C82]") }, label);
    }
    return h("div", { className:"max-w-5xl mx-auto px-8 py-14" },
      h("div", { className:"flex items-center justify-center gap-3 mb-12" },
        h("div", { className:"inline-flex items-center gap-1 border border-[#C4BEAD] rounded-full p-1" }, seg("m","Monthly"), seg("a","Annual")),
        h("span", { className:"text-xs text-[#556253]" }, "2 months free")),
      h("div", { className:"grid grid-cols-3 gap-px bg-[#C4BEAD] border border-[#C4BEAD]" },
        PLANS.map(function(p) {
          return h("div", { key:p.name, className:"bg-[#F8F7ED] p-7 " + (p.rec ? "ring-1 ring-inset ring-[#556253]" : "") },
            h("div", { className:"tight text-lg font-semibold" }, p.name),
            h("div", { className:"text-sm text-[#8C8C82] mt-1 mb-5" }, p.blurb),
            h("div", { className:"tight text-4xl font-semibold" }, "$" + price(p)),
            h("div", { className:"text-xs text-[#8C8C82] mt-1 mb-5" }, annual ? "per year" : "per month"),
            p.rec ? h("div", { className:"text-[10px] uppercase tracking-widest text-[#556253] mb-4" }, "Recommended") : null,
            h("ul", { className:"space-y-2 text-sm" }, p.feats.map(function(f) {
              return h("li", { key:f, className:"flex gap-2" }, h("span", { className:"text-[#556253]" }, "—"), f);
            })));
        })));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
</script>
</body></html>`;
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
