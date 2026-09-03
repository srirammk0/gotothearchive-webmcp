/**
 * Judge demo access (docs/roadmap/judge-demo-access.md).
 *
 * The machinery around the pre-written seed: guest-space provisioning, the
 * baked (never extracted) design profiles, and the three guards — a guest
 * cannot read the owner's items, cannot spend the owner's quota, and does not
 * consume a beta slot.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { applyDemoSeed, provisionGuestSpace, DEMO_ITEMS, DEMO_REGIONS } from "./db/demo-seed";
import { authorize, authorizedItemIds, authorizedRegionIds } from "./permissions";
import { consumeQuota, quotaLimits, GUEST_QUOTA, quotaPeriod } from "./quota";
import { handleRoute } from "./routes";
import { verifyBlobSignature } from "./blob-sign";
import type { ContextItem } from "@shared/contract";

function makeQueries(): Queries {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...b: unknown[]) => {
      const rows = db.query(query).all(...(b as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql);
  migrate(sql);
  return q;
}

const GUEST = "guest-1";
const GUEST_SPACE = "space-guest-1";
const NOW = 1_800_000_000_000;

function seededImages(q: Queries): ContextItem[] {
  return q.listItemsBySpace(GUEST_SPACE).filter((i) => i.type === "image");
}

test("a guest space boots with the seeded regions, items and design profiles", () => {
  const q = makeQueries();
  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);

  const space = q.getSpace(GUEST_SPACE);
  expect(space?.kind).toBe("guest");
  expect(space?.owner_id).toBe(GUEST);

  const regions = q.listRegions(GUEST_SPACE);
  expect(regions.map((r) => r.slug).toSorted()).toEqual(DEMO_REGIONS.map((r) => r.slug).toSorted());

  const items = q.listItemsBySpace(GUEST_SPACE);
  expect(items).toHaveLength(DEMO_ITEMS.length);
  // Every item is owned by the guest and lives in the guest space.
  expect(items.every((i) => i.space_id === GUEST_SPACE && i.owner_id === GUEST)).toBe(true);

  const withDesign = items.filter((i) => (i.metadata as { design?: unknown }).design);
  expect(withDesign).toHaveLength(DEMO_ITEMS.filter((d) => d.design).length);
});

test("design profiles arrive pre-baked — no AI binding call on guest boot", () => {
  // provisionGuestSpace takes (q, humanId, spaceId, now) and no env / AI binding:
  // there is structurally no extraction path on boot.
  expect(provisionGuestSpace.length).toBe(4);

  const q = makeQueries();
  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);

  const bySrc = new Map(DEMO_ITEMS.filter((d) => d.design).map((d) => [d.title, d.design]));
  for (const img of seededImages(q)) {
    const design = (img.metadata as { design: Record<string, unknown> }).design;
    // Stored verbatim — deep-equal proves nothing was regenerated (an extraction
    // would rewrite extracted_at / extracted_by).
    expect(design).toEqual(bySrc.get(img.title));
    expect(design.palette_source).toBe("measured");
    // The seed is lifted from the owner's real archive, so every profile still
    // names the vision model that judged it at capture time. A profile judged
    // here on boot could not carry this value with an extracted_at in the past.
    expect(design.extracted_by).toBe("@cf/meta/llama-3.2-11b-vision-instruct");
    expect(design.extracted_at).not.toBe(NOW);
  }

  // rebuildSpaceEdges still grew real edges off those baked profiles, with no
  // model in the loop: the grotesque-set product shots share
  // typography.classification + typography.scale (design rule 4a).
  const didone = seededImages(q).filter(
    (i) => (i.metadata as { design: { typography: { classification: string } } }).design.typography.classification ===
      "grotesque",
  );
  expect(didone.length).toBeGreaterThanOrEqual(2);
  const [a, b] = didone;
  const linked = q
    .allEdgesForItem(a.id)
    .some((e) => e.relationship === "related_to" && (e.from_id === b.id || e.to_id === b.id));
  expect(linked).toBe(true);
  // And at least one design-only edge exists among the items carrying no
  // display type — they share almost no salient words, so an edge between them
  // can only have come from designTokens similarity (rule 4c).
  const mono = seededImages(q).filter(
    (i) => (i.metadata as { design: { typography: { classification: string } } }).design.typography.classification ===
      "none",
  );
  const monoIds = new Set(mono.map((i) => i.id));
  const designOnly = mono.some((i) =>
    q.allEdgesForItem(i.id).some((e) => monoIds.has(e.from_id) && monoIds.has(e.to_id)),
  );
  expect(designOnly).toBe(true);
});

test("a guest cannot read the owner's items, at any grant level", () => {
  const q = makeQueries();

  // Owner space with a private item.
  q.insertSpace({ id: "space-owner", name: "Archive", owner_id: "owner", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "owner-insp", space_id: "space-owner", parent_id: null, name: "Inspiration", slug: "inspiration", created_at: 1 });
  q.insertItem({
    id: "owner-secret", space_id: "space-owner", region_id: "owner-insp", owner_id: "owner",
    type: "note", title: "Owner private", source_url: null, content_ref: null,
    semantic_text: "secret", metadata: {}, authority_class: "human_authored",
    created_by: "owner", created_at: 1, updated_at: 1,
  });

  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);
  q.insertTask({
    id: "guest-task", space_id: GUEST_SPACE, human_id: GUEST, title: "Demo", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });
  q.insertAgentSession({ id: "guest-session", human_id: GUEST, task_id: "guest-task", declared: null, created_at: NOW });

  // Hand-insert a cross-space grant pointing the guest task at the owner's
  // region, at the most permissive level. The FK is satisfied; the guard is
  // that human access is still the ceiling.
  for (const level of ["read", "propose", "write"] as const) {
    q.insertGrant({
      id: `x-${level}`, task_id: "guest-task", space_id: GUEST_SPACE, region_id: "owner-insp",
      level, grantor_id: GUEST, created_at: NOW, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
    });

    expect(authorizedRegionIds(q, "guest-task", NOW).has("owner-insp")).toBe(false);
    expect(authorizedItemIds(q, "guest-task", NOW).has("owner-secret")).toBe(false);

    const res = authorize(q, {
      taskId: "guest-task", agentSessionId: "guest-session", regionSlug: "inspiration",
      need: level, toolName: "retrieve", requested: {},
    }, NOW);
    // The slug resolves to the GUEST's own inspiration region, never the owner's.
    if (res.ok) expect(res.region.id).not.toBe("owner-insp");
  }

  // Guest retrieval only ever sees guest-space items.
  const reachable = authorizedItemIds(q, "guest-task", NOW);
  for (const id of reachable) expect(q.getItem(id)?.space_id).toBe(GUEST_SPACE);
});

test("a guest cannot consume the owner's quota", () => {
  const q = makeQueries();
  q.insertSpace({ id: "space-owner", name: "Archive", owner_id: "owner", kind: "personal", created_at: 1 });
  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);

  const period = quotaPeriod();
  // Guests meter against GUEST_QUOTA, keyed on their own human id.
  expect(quotaLimits(q.getSpace(GUEST_SPACE)?.kind)).toBe(GUEST_QUOTA);
  for (let i = 0; i < GUEST_QUOTA.agent_calls; i++) {
    expect(consumeQuota(q, GUEST, "agent_calls", 1, GUEST_QUOTA).ok).toBe(true);
  }
  // Over the (smaller) guest ceiling now...
  expect(consumeQuota(q, GUEST, "agent_calls", 1, GUEST_QUOTA).ok).toBe(false);
  // ...and the owner's counter never moved.
  expect(q.usageGet("owner", period, "agent_calls")).toBe(0);

  // uploads / vision are fully closed to guests.
  expect(GUEST_QUOTA.uploads).toBe(0);
  expect(GUEST_QUOTA.vision_calls).toBe(0);
  expect(consumeQuota(q, GUEST, "uploads", 1, GUEST_QUOTA).ok).toBe(false);
  expect(consumeQuota(q, GUEST, "vision_calls", 1, GUEST_QUOTA).ok).toBe(false);
});

test("guest spaces do not count against BETA_MAX_USERS", () => {
  const q = makeQueries();

  // Fill the beta to the cap.
  for (let i = 0; i < 25; i++) {
    expect(q.claimBetaSlot(`member-${i}`, 25, 1)).not.toBeNull();
  }
  expect(q.claimBetaSlot("member-25", 25, 1)).toBeNull();
  expect(q.betaMemberCount()).toBe(25);

  // A guest still provisions, and takes no slot.
  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);
  expect(q.getSpace(GUEST_SPACE)?.kind).toBe("guest");
  expect(q.betaSlot(GUEST)).toBeNull();
  expect(q.betaMemberCount()).toBe(25);
});

test("purgeSpace wipes a guest space and applyDemoSeed restores it", () => {
  const q = makeQueries();
  provisionGuestSpace(q, GUEST, GUEST_SPACE, NOW);
  q.insertTask({
    id: "t", space_id: GUEST_SPACE, human_id: GUEST, title: "x", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });

  q.purgeSpace(GUEST_SPACE);
  expect(q.listItemsBySpace(GUEST_SPACE)).toHaveLength(0);
  expect(q.listRegions(GUEST_SPACE)).toHaveLength(0);
  expect(q.listTasks(GUEST_SPACE)).toHaveLength(0);
  expect(q.getSpace(GUEST_SPACE)?.kind).toBe("guest"); // the space row survives

  applyDemoSeed(q, GUEST_SPACE, GUEST, NOW + 1);
  expect(q.listItemsBySpace(GUEST_SPACE)).toHaveLength(DEMO_ITEMS.length);
  expect(q.listRegions(GUEST_SPACE)).toHaveLength(DEMO_REGIONS.length);
});

/* ---------------- /api/demo-entry ---------------- */

const SECRET = "test-signing-secret";
const demoEntry = (env: Record<string, unknown>) =>
  handleRoute(
    new Request("https://archive.example/api/demo-entry"),
    env as unknown as Parameters<typeof handleRoute>[1],
    // The route returns before touching the DB — no session, no queries.
    null as unknown as Queries,
  );

test("GET /api/demo-entry 302s into /demo with a token that verifies, no session needed", async () => {
  const res = await demoEntry({ BLOB_SIGNING_SECRET: SECRET });

  // Not the "Sign in required" 401 gate — the whole point is it works signed out.
  expect(res.status).toBe(302);

  const loc = new URL(res.headers.get("location") ?? "");
  expect(loc.pathname).toBe("/demo");
  const exp = loc.searchParams.get("demo_exp");
  const sig = loc.searchParams.get("demo_sig");
  expect(await verifyBlobSignature(SECRET, "demo", exp, sig)).toBe(true);

  // Short-lived: consumed on the next request.
  expect(Number(exp) - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);
  expect(Number(exp) - Date.now()).toBeGreaterThan(25 * 60 * 1000);
});

test("/api/demo-entry fails closed with BLOB_SIGNING_SECRET unset — no redirect", async () => {
  const res = await demoEntry({});
  expect(res.status).toBe(503);
  expect(res.headers.get("location")).toBeNull();
  expect(await res.json()).toEqual({ ok: false, error: "demo_unavailable" });
});

test("/api/demo-entry is GET only", async () => {
  const res = await handleRoute(
    new Request("https://archive.example/api/demo-entry", { method: "POST" }),
    { BLOB_SIGNING_SECRET: SECRET } as unknown as Parameters<typeof handleRoute>[1],
    null as unknown as Queries,
  );
  expect(res.status).toBe(400);
});
