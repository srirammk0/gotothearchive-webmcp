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

const GUEST_SPACE_ID = "space-guest";

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
      return withCookie(await handleBootstrap(request, q, human.human_id));
    case API.regions:
      return withCookie(handleRegions(request, q));
    case API.items:
      return withCookie(await handleItems(request, q, human.human_id));
    case API.upload:
      return withCookie(await handleUpload(request, env));
    case API.blob:
      return withCookie(await handleBlob(request, env));
    case API.provenance:
      return withCookie(handleProvenance(request, q));
    case API.graph:
      return withCookie(await handleGraph(request, q));
    case API.task:
      return withCookie(await handleTask(request, q, human.human_id));
    case API.session:
      return withCookie(await handleSession(request, q, human.human_id));
    case API.grants:
      return withCookie(await handleGrants(request, q, human.human_id));
    case API.capabilities:
      return withCookie(handleCapabilities(request, q));
    case API.toolCall:
      return withCookie(await handleMcpCall(request, q, human));
    case API.artifacts:
      return withCookie(handleArtifacts(request, q));
    case API.annotations:
      return withCookie(await handleAnnotations(request, q, human.human_id));
    case API.decisions:
      return withCookie(await handleDecisions(request, q, human.human_id));
    case API.taste:
      return withCookie(await handleTaste(request, q, human.human_id));
    case API.lens:
      return withCookie(handleLens(request, q));
    default:
      return new Response(null, { status: 404 });
  }
}

/* ---------------- bootstrap ---------------- */

async function handleBootstrap(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const existing = q.getSpace(GUEST_SPACE_ID);
  if (existing) {
    return json({ ok: true, space: existing, regions: q.listRegions(existing.id) });
  }

  const now = Date.now();
  q.insertSpace({
    id: GUEST_SPACE_ID,
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
      space_id: GUEST_SPACE_ID,
      parent_id: null,
      name: r.name,
      slug: r.slug,
      created_at: now,
    });
  }

  seedItems(q, GUEST_SPACE_ID, regionIds, humanId, now);

  return json({
    ok: true,
    space: q.getSpace(GUEST_SPACE_ID),
    regions: q.listRegions(GUEST_SPACE_ID),
  });
}

function seedItems(
  q: Queries,
  spaceId: string,
  regionIds: Record<string, string>,
  ownerId: string,
  now: number,
): void {
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
}

/* ---------------- regions ---------------- */

function handleRegions(request: Request, q: Queries): Response {
  if (request.method !== "GET") return badRequest("GET required");
  return json({ ok: true, regions: q.listRegions(GUEST_SPACE_ID) });
}

/* ---------------- items ---------------- */

async function handleItems(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const regionSlug = url.searchParams.get("region");
    if (regionSlug) {
      const region = q.getRegionBySlug(GUEST_SPACE_ID, regionSlug);
      if (!region) return badRequest("unknown region");
      return json({ ok: true, items: q.listItemsByRegion(region.id) });
    }
    return json({ ok: true, items: q.listItemsBySpace(GUEST_SPACE_ID) });
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
    const region = q.getRegionBySlug(GUEST_SPACE_ID, body.region_slug);
    if (!region) return badRequest("unknown region");
    if (!(ITEM_TYPES as readonly string[]).includes(body.type)) return badRequest("unknown item type");
    const now = Date.now();
    const id = crypto.randomUUID();
    q.insertItem({
      id,
      space_id: GUEST_SPACE_ID,
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

/* ---------------- upload ---------------- */

async function handleUpload(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const key = `${GUEST_SPACE_ID}/${crypto.randomUUID()}`;
  const body = await request.arrayBuffer();
  await env.BLOBS.put(key, body, { httpMetadata: { contentType } });
  return json({ ok: true, key });
}

/**
 * Streams a canonical original back out of R2.
 *
 * Keys are confined to this space's prefix, so a caller cannot walk out of the
 * bucket by supplying a crafted key. The agent never receives a bucket
 * credential or a raw R2 URL — it only ever sees this path.
 */
async function handleBlob(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return badRequest("GET required");
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return badRequest("key required");
  if (!key.startsWith(`${GUEST_SPACE_ID}/`) || key.includes("..")) {
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
function handleProvenance(request: Request, q: Queries): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const versionId = new URL(request.url).searchParams.get("version_id");
  if (!versionId) return badRequest("version_id required");

  const version = q.getArtifactVersion(versionId);
  if (!version) return badRequest("unknown version");
  const artifact = q.getArtifact(version.artifact_id);
  if (!artifact) return badRequest("unknown artifact");

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

async function handleGraph(request: Request, q: Queries): Promise<Response> {
  if (request.method !== "POST") return badRequest("POST required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
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
      space_id: GUEST_SPACE_ID,
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
    return json({ ok: true, tasks: q.listTasks(GUEST_SPACE_ID) });
  }
  return badRequest("unsupported method");
}

/* ---------------- grants ---------------- */

async function handleGrants(request: Request, q: Queries, humanId: string): Promise<Response> {
  if (request.method === "POST") {
    const body = (await request.json()) as { task_id: string; region_slug: string; level: GrantLevel; expires_at?: number | null };
    const region = q.getRegionBySlug(GUEST_SPACE_ID, body.region_slug);
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
      space_id: GUEST_SPACE_ID,
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

function handleCapabilities(request: Request, q: Queries): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId) return badRequest("task_id required");
  const task = q.getTask(taskId);
  if (!task) return badRequest("unknown task");

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

function handleArtifacts(request: Request, q: Queries): Response {
  if (request.method !== "GET") return badRequest("GET required");
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const artifact = q.getArtifact(id);
    if (!artifact) return badRequest("not found");
    return json({ ok: true, artifact, versions: q.listArtifactVersions(id) });
  }
  return json({ ok: true, artifacts: q.listArtifacts(GUEST_SPACE_ID) });
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
    return json({ ok: true, signals: q.listTasteSignals(GUEST_SPACE_ID) });
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
      space_id: GUEST_SPACE_ID,
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
    const body = (await request.json()) as { id: string; status: "confirmed" | "rejected" | "superseded" };
    q.setTasteSignalStatus(body.id, body.status, humanId);
    return json({ ok: true, signal: q.getTasteSignal(body.id) });
  }
  return badRequest("unsupported method");
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
