/**
 * JSON handlers for every path in the API const. All mounted under a single
 * SpaceDO instance (one guest space for the whole demo).
 */
import {
  API,
  ITEM_TYPES,
  REVIEW_DECISIONS,
  type AccessRecord,
  type ArtifactState,
  type CapabilityInput,
  type GrantLevel,
  type ItemType,
  type ReviewDecision,
  type TasteDimension,
  type ToolCallRequest,
} from "@shared/contract";
import { Queries } from "./db/queries";
import { guestCookie, resolveHuman } from "./auth";
import { authorizedRegionIds, humanRegions, liveGrants } from "./permissions";
import { traverse } from "./graph";
import { handleToolCall } from "./mcp";
import { SEED_ASSETS } from "./seed-assets";

/**
 * Each visitor gets their own Space, keyed to their guest identity.
 *
 * A single shared guest space would be owned by whoever opened the app first;
 * every later visitor would have no human access to any region, and since agent
 * authority can never exceed the invoking human's, their agent could do nothing
 * at all. The product would look dead to everyone but the first person through
 * the door — and several judges will open this at once.
 */
function spaceIdFor(humanId: string): string {
  return `space-${humanId}`;
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function badRequest(message: string): Response {
  return json({ ok: false, error: message }, { status: 400 });
}

export async function handleRoute(
  request: Request,
  env: Env,
  q: Queries,
): Promise<Response> {
  const url = new URL(request.url);
  const human = resolveHuman(request);
  const cookieHeader = guestCookie(human.human_id);

  const withCookie = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", cookieHeader);
    return new Response(res.body, { status: res.status, headers });
  };

  switch (url.pathname) {
    case API.bootstrap:
      return withCookie(await handleBootstrap(request, env, q, human.human_id));
    case API.regions:
      return withCookie(handleRegions(request, q, human.human_id));
    case API.items:
      return withCookie(await handleItems(request, q, human.human_id));
    case API.upload:
      return withCookie(await handleUpload(request, env, human.human_id));
    case API.blob:
      return withCookie(await handleBlob(request, env, human.human_id));
    case API.provenance:
      return withCookie(handleProvenance(request, q, human.human_id));
    case API.graph:
      return withCookie(await handleGraph(request, q, human.human_id));
    case API.task:
      return withCookie(await handleTask(request, q, human.human_id));
    case API.session:
      return withCookie(await handleSession(request, q, human.human_id));
    case API.grants:
      return withCookie(await handleGrants(request, q, human.human_id));
    case API.capabilities:
      return withCookie(handleCapabilities(request, q, human.human_id));
    case API.toolCall:
      return withCookie(await handleMcpCall(request, q, human));
    case API.artifacts:
      return withCookie(handleArtifacts(request, q, human.human_id));
    case API.annotations:
      return withCookie(await handleAnnotations(request, q, human.human_id));
    case API.decisions:
      return withCookie(await handleDecisions(request, q, human.human_id));
    case API.taste:
      return withCookie(await handleTaste(request, q, human.human_id));
    case API.tasteEvidence:
      return withCookie(handleTasteEvidence(request, q, human.human_id));
    case API.lens:
      return withCookie(handleLens(request, q));
    default:
      return new Response(null, { status: 404 });
  }
}

/* ---------------- bootstrap ---------------- */

async function handleBootstrap(request: Request, env: Env, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const existing = q.getSpace(spaceIdFor(humanId));
  if (existing) {
    // Backfill rather than skip. A space created by an earlier build may predate
    // the seeded review round or the seeded reference images, and returning early
    // would leave that visitor looking at an empty Workbench and a text-only
    // Archive forever. Each backfill is guarded by its own condition so adding a
    // later one never silently depends on an earlier one having run.
    const seedIds: Record<string, string> = {};
    for (const item of q.listItemsBySpace(existing.id)) {
      if (item.title.startsWith("Atlas rebrand")) seedIds["brief_atlas"] = item.id;
      if (item.title.startsWith("Atlas logo draft")) seedIds["draft_atlas_v1"] = item.id;
      if (item.title.startsWith("Terracotta")) seedIds["ref_terracotta"] = item.id;
      if (item.title.startsWith("Editorial serif")) seedIds["ref_editorial_type"] = item.id;
      if (item.title.startsWith("Friendly onboarding")) seedIds["ref_onboarding_flow"] = item.id;
    }

    if (
      q.listArtifacts(existing.id).length === 0 &&
      seedIds["brief_atlas"] &&
      seedIds["ref_terracotta"] &&
      seedIds["ref_editorial_type"] &&
      seedIds["draft_atlas_v1"]
    ) {
      seedPriorReview(q, existing.id, seedIds, existing.owner_id, Date.now());
    }

    const missingImages = q
      .listItemsBySpace(existing.id)
      .some((i) => i.content_ref === null && Object.values(seedIds).includes(i.id));
    if (missingImages) {
      await attachSeedAssets(env, q, existing.id, seedIds);
    }

    return json({ ok: true, space: existing, regions: q.listRegions(existing.id) });
  }

  const now = Date.now();
  q.insertSpace({
    id: spaceIdFor(humanId),
    name: "Guest Archive",
    owner_id: humanId,
    kind: "guest",
    created_at: now,
  });

  const regionDefs = [
    { name: "Work", slug: "work" },
    { name: "Inspiration", slug: "inspiration" },
    { name: "Personal", slug: "personal" },
  ];
  const regionIds: Record<string, string> = {};
  for (const r of regionDefs) {
    const id = crypto.randomUUID();
    regionIds[r.slug] = id;
    q.insertRegion({
      id,
      space_id: spaceIdFor(humanId),
      parent_id: null,
      name: r.name,
      slug: r.slug,
      created_at: now,
    });
  }

  const seededIds = seedItems(q, spaceIdFor(humanId), regionIds, humanId, now);
  await attachSeedAssets(env, q, spaceIdFor(humanId), seededIds);

  return json({
    ok: true,
    space: q.getSpace(spaceIdFor(humanId)),
    regions: q.listRegions(spaceIdFor(humanId)),
  });
}

function seedItems(
  q: Queries,
  spaceId: string,
  regionIds: Record<string, string>,
  ownerId: string,
  now: number,
): Record<string, string> {
  const item = (
    key: string,
    region: string,
    type: "note" | "image" | "screenshot" | "link" | "pdf" | "document",
    title: string,
    text: string,
    authority: "human_authored" | "imported_source_linked" = "human_authored",
  ) => {
    const id = crypto.randomUUID();
    q.insertItem({
      id,
      space_id: spaceId,
      region_id: regionIds[region],
      owner_id: ownerId,
      type,
      title,
      source_url: null,
      content_ref: null,
      semantic_text: text,
      metadata: {},
      authority_class: authority,
      created_by: ownerId,
      created_at: now,
      updated_at: now,
    });
    ids[key] = id;
    return id;
  };
  const ids: Record<string, string> = {};

  // Work — project briefs and drafts.
  item("brief_atlas", "work", "document", "Atlas rebrand — creative brief", "Atlas wants a rebrand that feels warmer and more human, moving away from the current cold corporate blue. Target: mid-market SaaS buyers.");
  item("draft_atlas_v1", "work", "note", "Atlas logo draft v1 notes", "First pass leaned on a rounded wordmark and a terracotta accent. Client feedback pending.");
  item("brief_lumen", "work", "document", "Lumen app onboarding flow brief", "Redesign the Lumen onboarding to cut drop-off. Stakeholders want fewer screens and a friendlier tone.");

  // Inspiration — visual references.
  item("ref_terracotta", "inspiration", "image", "Terracotta palette reference", "A warm terracotta and cream palette pulled from a ceramics studio's branding. Good candidate for Atlas.", "imported_source_linked");
  item("ref_editorial_type", "inspiration", "image", "Editorial serif type reference", "Large serif headlines paired with a humanist sans body — reference for warmer, more editorial brand voices.", "imported_source_linked");
  item("ref_onboarding_flow", "inspiration", "screenshot", "Friendly onboarding flow screenshot", "A three-screen onboarding flow with playful illustration and progressive disclosure — reference for Lumen.", "imported_source_linked");

  // Personal — private notes that must never leak into Work-scoped retrieval.
  item("note_therapy", "personal", "note", "Therapy session notes — private", "Personal reflections from this week's session. Not for sharing with any client or agent working on client projects.");
  item("note_family", "personal", "note", "Family trip planning notes", "Draft itinerary for a family trip. Budget and dates, entirely personal.");

  // Edges: related_to, inspired_by, belongs_to — including one that crosses Work -> Personal,
  // so the graph-leak test has something concrete to prove never surfaces.
  const edge = (from: string, to: string, relationship: "related_to" | "inspired_by" | "belongs_to", weight = 1) => {
    q.insertEdge({
      id: crypto.randomUUID(),
      from_id: ids[from],
      to_id: ids[to],
      relationship,
      weight,
      created_by: ownerId,
      approval_state: "approved",
      created_at: now,
    });
  };

  edge("draft_atlas_v1", "brief_atlas", "belongs_to");
  edge("draft_atlas_v1", "ref_terracotta", "inspired_by");
  edge("brief_atlas", "ref_editorial_type", "inspired_by");
  edge("brief_lumen", "ref_onboarding_flow", "inspired_by");
  // Deliberate leak-test edge: a Work item related to a Personal item. The graph
  // traversal must never surface note_therapy/note_family to a Work-only grant.
  edge("brief_atlas", "note_therapy", "related_to", 0.4);

  seedPriorReview(q, spaceId, ids, ownerId, now);
  return ids;
}

/**
 * One completed round of the loop, so a first-time visitor sees the product
 * rather than three empty states.
 *
 * This is demo scaffolding for the guest space only: a real signed-in Archive
 * starts empty and fills with the person's own uploads and their agent's actual
 * output. What is seeded here is honest — the artifact's influences point at
 * real seeded items, the denial records a real refusal to cite a Personal item,
 * and the taste proposal cites the annotation it was derived from.
 */
function seedPriorReview(
  q: Queries,
  spaceId: string,
  ids: Record<string, string>,
  ownerId: string,
  now: number,
): void {
  const taskId = crypto.randomUUID();
  q.insertTask({
    id: taskId,
    space_id: spaceId,
    human_id: ownerId,
    title: "Atlas rebrand — visual brief",
    instruction: "Draft a visual brief for the Atlas rebrand from the brief and the references.",
    status: "open",
    created_at: now,
    expires_at: null,
  });

  const sessionId = crypto.randomUUID();
  q.insertAgentSession({
    id: sessionId,
    human_id: ownerId,
    task_id: taskId,
    declared: { provider: "openai", client: "chatgpt-desktop", model: "gpt-5" },
    created_at: now,
  });

  const artifactId = crypto.randomUUID();
  q.insertArtifact({
    id: artifactId,
    space_id: spaceId,
    task_id: taskId,
    kind: "visual_brief",
    title: "Atlas rebrand — visual brief",
    created_at: now,
  });

  const versionId = crypto.randomUUID();
  q.insertArtifactVersion({
    id: versionId,
    artifact_id: artifactId,
    version_no: 1,
    parent_version_id: null,
    content_html: `<article style="font-family:Georgia,serif;color:#211d17;line-height:1.55;padding:40px 44px;max-width:64ch">
<p style="font-family:system-ui,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8a8071;margin:0 0 20px">Atlas rebrand</p>
<h1 style="font-size:40px;line-height:1.1;margin:0 0 20px;font-weight:400">Warmer, and unmistakably human</h1>
<p style="margin:0 0 26px">Atlas reads as competent and cold. The move is not to soften the logo but to change
the material the brand is made of: a terracotta and cream ground instead of corporate blue, and an
editorial serif carrying the voice.</p>
<h2 style="font-size:15px;font-family:system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#57503f;margin:0 0 12px">Direction</h2>
<ul style="margin:0 0 26px;padding-left:20px"><li style="margin-bottom:7px">Terracotta accent on a cream ground</li>
<li style="margin-bottom:7px">Large serif headline over a humanist sans body</li>
<li style="margin-bottom:7px">One dominant image per view, generous negative space</li></ul>
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#8a8071;margin:0;border-top:1px solid #d9d1bf;padding-top:16px">
Drafted from the Atlas creative brief and two references in Inspiration.</p></article>`,
    agent_session_id: sessionId,
    state: "ready_for_review",
    created_at: now,
  });

  const influence = (itemKey: string, role: string, note: string) => {
    q.insertInfluence({
      id: crypto.randomUUID(),
      version_id: versionId,
      item_id: ids[itemKey],
      role,
      strength: 1,
      note,
    });
  };
  influence("brief_atlas", "brief", "Set the goal: warmer, away from corporate blue.");
  influence("ref_terracotta", "reference", "Source of the terracotta and cream ground.");
  influence("ref_editorial_type", "reference", "Serif headline over humanist sans.");

  // Accessed but not influential — looked at, did not shape the result.
  q.insertAccess({
    id: crypto.randomUUID(),
    task_id: taskId,
    item_id: ids["draft_atlas_v1"],
    tool_name: "get_context_for_task",
    at: now,
  });

  // A real refusal: the agent reached for a Personal item and was denied. This
  // is what the third provenance group exists to show.
  q.insertDenial({
    id: crypto.randomUUID(),
    task_id: taskId,
    agent_session_id: sessionId,
    tool_name: "get_context_for_task",
    requested: { region: "personal" },
    reason: "No grant exists for the requested region",
    at: now,
  });

  const annotationId = crypto.randomUUID();
  q.insertAnnotation({
    id: annotationId,
    version_id: versionId,
    author_id: ownerId,
    target: null,
    sentiment: "positive",
    dimension: "composition",
    comment: "The single dominant image is right. Don't turn this into a grid of equal tiles.",
    status: "open",
    created_at: now,
  });

  // Derived from that annotation, and citing it. Proposed — never confirmed
  // without the person acting on it.
  const signalId = crypto.randomUUID();
  q.insertTasteSignal({
    id: signalId,
    space_id: spaceId,
    owner_id: ownerId,
    statement:
      "For brand and research presentations, prefers a single dominant visual with generous negative space rather than evenly weighted card grids.",
    dimensions: ["composition", "layout_density"],
    scope: "personal",
    status: "proposed",
    confidence: 0.62,
    created_by: "system",
    approved_by: null,
    created_at: now,
  });
  q.insertTasteEvidence({
    id: crypto.randomUUID(),
    signal_id: signalId,
    kind: "supports",
    annotation_id: annotationId,
    version_id: versionId,
    item_id: null,
  });
}

/* ---------------- regions ---------------- */

function handleRegions(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  return json({ ok: true, regions: q.listRegions(spaceIdFor(humanId)) });
}

/* ---------------- items ---------------- */

async function handleItems(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const regionSlug = url.searchParams.get("region");
    if (regionSlug) {
      const region = q.getRegionBySlug(spaceIdFor(humanId), regionSlug);
      if (!region) return badRequest("unknown region");
      return json({ ok: true, items: q.listItemsByRegion(region.id) });
    }
    return json({ ok: true, items: q.listItemsBySpace(spaceIdFor(humanId)) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      region_slug: string;
      type: string;
      title: string;
      source_url?: string | null;
      content_ref?: string | null;
      semantic_text?: string | null;
    };
    const region = q.getRegionBySlug(spaceIdFor(humanId), body.region_slug);
    if (!region) return badRequest("unknown region");
    if (!(ITEM_TYPES as readonly string[]).includes(body.type)) return badRequest("unknown item type");
    const now = Date.now();
    const id = crypto.randomUUID();
    q.insertItem({
      id,
      space_id: spaceIdFor(humanId),
      region_id: region.id,
      owner_id: humanId,
      type: body.type as ItemType,
      title: body.title,
      source_url: body.source_url ?? null,
      content_ref: body.content_ref ?? null,
      semantic_text: body.semantic_text ?? null,
      metadata: {},
      authority_class: "human_authored",
      created_by: humanId,
      created_at: now,
      updated_at: now,
    });
    return json({ ok: true, item: q.getItem(id) });
  }
  return badRequest("unsupported method");
}

/**
 * Writes the seeded SVG references into R2 and points their items at them.
 *
 * Without this every "Image" item rendered as a text row, and an archive of a
 * designer's work with no visible work in it cannot look like anything but a
 * list. Failures here are non-fatal: canonical item creation must not depend on
 * derived assets succeeding.
 */
async function attachSeedAssets(
  env: Env,
  q: Queries,
  spaceId: string,
  ids: Record<string, string>,
): Promise<void> {
  for (const [seedKey, svg] of Object.entries(SEED_ASSETS)) {
    const itemId = ids[seedKey];
    if (!itemId) continue;
    const key = `${spaceId}/seed-${seedKey}.svg`;
    try {
      await env.BLOBS.put(key, svg, { httpMetadata: { contentType: "image/svg+xml" } });
      q.setItemContentRef(itemId, key);
    } catch {
      // Leave the item as text rather than failing the whole bootstrap.
    }
  }
}

/* ---------------- upload ---------------- */

async function handleUpload(request: Request, env: Env, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const key = `${spaceIdFor(humanId)}/${crypto.randomUUID()}`;
  const body = await request.arrayBuffer();
  await env.BLOBS.put(key, body, { httpMetadata: { contentType } });
  return json({ ok: true, key });
}

/**
 * Streams a canonical original back out of R2.
 *
 * Keys are confined to this visitor's own space prefix, so a caller can neither
 * walk out of the bucket with a crafted key nor read another visitor's uploads. The agent never receives a bucket
 * credential or a raw R2 URL — it only ever sees this path.
 */
async function handleBlob(request: Request, env: Env, humanId: string): Promise<Response> {
  if (request.method !== "GET") return badRequest("GET required");
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return badRequest("key required");
  if (!key.startsWith(`${spaceIdFor(humanId)}/`) || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  const object = await env.BLOBS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}

/**
 * The three provenance record types for one artifact version, kept separate.
 *
 *   influences → "Used these references"
 *   accesses   → "Accessed for this task"
 *   denials    → "Unavailable or denied" (Agent Lens only)
 *
 * Merging these would erase the distinction between what shaped the work, what
 * was merely looked at, and what was refused. See BUILD-CONTRACT invariant 5.
 */
function handleProvenance(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const versionId = new URL(request.url).searchParams.get("version_id");
  if (!versionId) return badRequest("version_id required");

  const version = q.getArtifactVersion(versionId);
  if (!version) return badRequest("unknown version");
  const artifact = q.getArtifact(version.artifact_id);
  if (!artifact) return badRequest("unknown artifact");
  // Ids are guessable in principle; ownership is the actual boundary.
  if (artifact.space_id !== spaceIdFor(humanId)) return badRequest("unknown version");

  const influences = q.listInfluences(versionId).map((inf) => ({
    ...inf,
    item: q.getItem(inf.item_id) ?? null,
  }));

  // Accessed-but-not-influential: retrieved during the task, minus anything
  // already credited as an influence.
  const influenced = new Set(influences.map((i) => i.item_id));
  const accesses = q
    .recentAccesses(artifact.task_id, 200)
    .filter((a: AccessRecord) => !influenced.has(a.item_id))
    .map((a: AccessRecord) => ({ ...a, item: q.getItem(a.item_id) ?? null }));

  return json({
    ok: true,
    provenance: {
      influences,
      accesses,
      denials: q.recentDenials(artifact.task_id, 50),
    },
  });
}

/* ---------------- graph ---------------- */

async function handleGraph(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task || task.human_id !== humanId) return badRequest("unknown task");
  const body = (await request.json()) as { seed_item_ids: string[] };
  const allowed = authorizedRegionIds(q, taskId, Date.now());
  const result = traverse(q, body.seed_item_ids, allowed);
  return json({ ok: true, ...result });
}

/* ---------------- task ---------------- */

/**
 * Registers an agent session. The id is issued by the SERVER, never accepted
 * from the client — an agent must not be able to name its own session and so
 * pick which human or task it appears to belong to.
 *
 * `declared` is attribution only. It is stored for the history ledger and never
 * read during authorization (BUILD-CONTRACT invariant 9).
 */
async function handleSession(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("unsupported method");
  const body = (await request.json()) as {
    task_id: string;
    declared?: { provider?: string; client?: string; model?: string } | null;
  };

  const task = q.getTask(body.task_id);
  if (!task) return badRequest("unknown task");
  // A session may only be bound to a task the caller actually owns.
  if (task.human_id !== humanId) return badRequest("unknown task");

  const id = crypto.randomUUID();
  q.insertAgentSession({
    id,
    human_id: humanId,
    task_id: body.task_id,
    declared: body.declared ?? null,
    created_at: Date.now(),
  });
  return json({ ok: true, agent_session_id: id });
}

async function handleTask(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "POST") {
    const body = (await request.json()) as { title: string; instruction?: string; expires_at?: number | null };
    const id = crypto.randomUUID();
    q.insertTask({
      id,
      space_id: spaceIdFor(humanId),
      human_id: humanId,
      title: body.title,
      instruction: body.instruction ?? "",
      status: "open",
      created_at: Date.now(),
      expires_at: body.expires_at ?? null,
    });
    return json({ ok: true, task: q.getTask(id) });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const task = q.getTask(id);
      if (!task) return badRequest("not found");
      return json({ ok: true, task });
    }
    // Only the caller's own tasks. The guest space is shared, so without this
    // filter one visitor would see another's tasks and try to bind an agent
    // session to work that is not theirs — which the session route correctly
    // refuses, leaving the app wedged. Several judges will use this at once.
    return json({
      ok: true,
      tasks: q.listTasks(spaceIdFor(humanId)).filter((t) => t.human_id === humanId),
    });
  }
  return badRequest("unsupported method");
}

/* ---------------- grants ---------------- */

async function handleGrants(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "POST") {
    const body = (await request.json()) as { task_id: string; region_slug: string; level: GrantLevel; expires_at?: number | null };
    const region = q.getRegionBySlug(spaceIdFor(humanId), body.region_slug);
    if (!region) return badRequest("unknown region");

    // Setting a region's level SUPERSEDES whatever it was before. Any live grant
    // on this region is revoked first.
    //
    // Without this, each change from the lock control would stack another row and
    // the earliest, most permissive one would keep winning — the UI would show a
    // downgrade while the agent's real authority never moved. That is exactly the
    // "permission theater" this product exists to disprove, so it is enforced
    // here and, defensively, again in authorize().
    const now = Date.now();
    for (const g of q.grantsForTask(body.task_id)) {
      if (g.region_id === region.id && g.revoked_at === null) {
        q.revokeGrant(g.id, humanId, "superseded", now);
      }
    }

    // "none" is the absence of a grant, not a grant of nothing. Revoking is the
    // whole operation — inserting a none-level row would leave something for a
    // buggy lookup to find.
    if (body.level === "none") {
      return json({ ok: true, revoked: true, region: region.slug });
    }

    const id = crypto.randomUUID();
    q.insertGrant({
      id,
      task_id: body.task_id,
      space_id: spaceIdFor(humanId),
      region_id: region.id,
      level: body.level,
      grantor_id: humanId,
      created_at: Date.now(),
      expires_at: body.expires_at ?? null,
      revoked_at: null,
      revoked_by: null,
      reason: null,
    });
    return json({ ok: true, grant: q.getGrant(id) });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as { grant_id: string; reason?: string };
    q.revokeGrant(body.grant_id, humanId, body.reason ?? null, Date.now());
    return json({ ok: true, grant: q.getGrant(body.grant_id) });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const taskId = url.searchParams.get("task_id");
    if (!taskId) return badRequest("task_id required");
    return json({ ok: true, grants: q.grantsForTask(taskId) });
  }
  return badRequest("unsupported method");
}

/* ---------------- capabilities ---------------- */

function handleCapabilities(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task) return badRequest("unknown task");
  if (task.human_id !== humanId) return badRequest("unknown task");

  const regions = q.listRegions(task.space_id);
  const slugById = new Map(regions.map((r) => [r.id, r.slug]));
  const human = humanRegions(q, task.space_id, task.human_id).map((r) => ({
    slug: slugById.get(r.region_id) ?? "",
    level: r.level,
  }));
  const grants = liveGrants(q, taskId, Date.now()).map((g) => ({
    slug: slugById.get(g.region_id) ?? "",
    level: g.level,
  }));

  const payload: CapabilityInput = {
    humanRegions: human,
    grants,
    task: { id: task.id, title: task.title, expires_at: task.expires_at },
    pageState: { hasPendingProposals: false, activeArtifactId: null },
  };
  return json({ ok: true, capabilities: payload });
}

/* ---------------- mcp call ---------------- */

async function handleMcpCall(
  request: Request,
  q: Queries,
  human: { human_id: string; kind: "guest" | "clerk" },
): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const body = (await request.json()) as ToolCallRequest;
  const result = await handleToolCall(body, q, human, Date.now());
  return json(result, { status: result.ok ? 200 : 403 });
}

/* ---------------- artifacts ---------------- */

function handleArtifacts(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const artifact = q.getArtifact(id);
    if (!artifact) return badRequest("not found");
    return json({ ok: true, artifact, versions: q.listArtifactVersions(id) });
  }
  return json({ ok: true, artifacts: q.listArtifacts(spaceIdFor(humanId)) });
}

/* ---------------- annotations ---------------- */

async function handleAnnotations(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const versionId = url.searchParams.get("version_id");
    if (!versionId) return badRequest("version_id required");
    return json({ ok: true, annotations: q.listAnnotations(versionId) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      version_id: string;
      sentiment: "positive" | "negative" | "neutral";
      comment: string;
      dimension?: string | null;
      target?: { kind: "region"; x: number; y: number; w: number; h: number } | null;
    };
    const id = crypto.randomUUID();
    q.insertAnnotation({
      id,
      version_id: body.version_id,
      author_id: humanId,
      target: body.target ?? null,
      sentiment: body.sentiment,
      dimension: body.dimension ?? null,
      comment: body.comment,
      status: "open",
      created_at: Date.now(),
    });
    return json({ ok: true, annotation: { id } });
  }
  return badRequest("unsupported method");
}

/* ---------------- decisions ---------------- */

async function handleDecisions(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const body = (await request.json()) as { version_id: string; decision: string; note?: string | null };
  if (!(REVIEW_DECISIONS as readonly string[]).includes(body.decision)) {
    return badRequest("unknown decision");
  }
  const decision = body.decision as ReviewDecision;
  const version = q.getArtifactVersion(body.version_id);
  if (!version) return badRequest("unknown version");
  const now = Date.now();
  q.insertDecision({
    id: crypto.randomUUID(),
    version_id: body.version_id,
    actor_id: humanId,
    decision,
    note: body.note ?? null,
    prev_state: version.state,
    at: now,
  });
  const nextState: ArtifactState =
    decision === "approve"
      ? "approved"
      : decision === "approve_with_notes"
        ? "approved_with_notes"
        : decision === "request_changes"
          ? "changes_requested"
          : "rejected";
  q.setArtifactVersionState(body.version_id, nextState);
  return json({ ok: true, version: q.getArtifactVersion(body.version_id) });
}

/* ---------------- taste ---------------- */

async function handleTaste(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    return json({ ok: true, signals: q.listTasteSignals(spaceIdFor(humanId)) });
  }
  if (request.method === "POST") {
    const body = (await request.json()) as {
      statement: string;
      dimensions: TasteDimension[];
      scope: "personal" | "project";
    };
    const id = crypto.randomUUID();
    q.insertTasteSignal({
      id,
      space_id: spaceIdFor(humanId),
      owner_id: humanId,
      statement: body.statement,
      dimensions: body.dimensions,
      scope: body.scope,
      status: "proposed",
      confidence: 0.5,
      created_by: "human",
      approved_by: null,
      created_at: Date.now(),
    });
    return json({ ok: true, signal: q.getTasteSignal(id) });
  }
  if (request.method === "PATCH") {
    const body = (await request.json()) as {
      id: string;
      status?: "proposed" | "confirmed" | "rejected" | "superseded";
      statement?: string;
      scope?: "personal" | "project";
    };
    const existing = q.getTasteSignal(body.id);
    if (!existing) return badRequest("unknown signal");

    // Editing and rescoping are first-class review actions, not just status
    // changes: the doc's actions are accept, edit, rescope, reject. Dropping the
    // statement here would make the edit UI silently fail — the worst outcome
    // for a surface whose whole promise is that nothing changes without you.
    if (typeof body.statement === "string" && body.statement.trim()) {
      q.setTasteSignalStatement(body.id, body.statement.trim());
    }
    if (body.scope === "personal" || body.scope === "project") {
      q.setTasteSignalScope(body.id, body.scope);
    }
    if (body.status) {
      q.setTasteSignalStatus(body.id, body.status, humanId);
    }
    return json({ ok: true, signal: q.getTasteSignal(body.id) });
  }
  return badRequest("unsupported method");
}

/* ---------------- taste evidence ---------------- */

/**
 * The evidence behind one taste signal, hydrated into the annotations, versions
 * and items it cites.
 *
 * A proposal that cannot show its evidence is just an assertion, and the product
 * promises the opposite: signals cite the feedback and artifacts that support
 * them, and are never confirmed through silence.
 */
function handleTasteEvidence(request: Request, q: Queries, humanId: string): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const signalId = new URL(request.url).searchParams.get("signal_id");
  if (!signalId) return badRequest("signal_id required");

  // Evidence quotes a person's own annotations. Only its owner may read it.
  const signal = q.getTasteSignal(signalId);
  if (!signal || signal.space_id !== spaceIdFor(humanId)) return badRequest("unknown signal");

  const evidence = q.listTasteEvidence(signalId).map((e) => ({
    ...e,
    annotation: e.annotation_id ? (q.getAnnotation(e.annotation_id) ?? null) : null,
    item: e.item_id ? (q.getItem(e.item_id) ?? null) : null,
  }));
  return json({ ok: true, evidence });
}

/* ---------------- lens ---------------- */

function handleLens(request: Request, q: Queries): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  return json({
    ok: true,
    accesses: q.recentAccesses(taskId, limit),
    denials: q.recentDenials(taskId, limit),
    audit: q.recentAuditEvents(taskId, limit),
  });
}
