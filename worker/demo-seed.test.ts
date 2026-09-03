/**
 * Judge demo access (docs/roadmap/judge-demo-access.md).
 *
 * The SHARED demo model: every judge's `demo_session` cookie resolves to a
 * `demo-<nonce>` identity, and `spaceIdFor()` pins every one of those to the
 * single `space-demo` (kind:'guest'). Isolation *among* judges relaxes — they
 * share one archive and see each other's items — but isolation between a demo
 * identity and a real member's kind:'personal' space stays absolute.
 *
 * These tests pin the new rule. The premise the old ones asserted ("a guest
 * cannot read another guest's space") is now deliberately obsolete.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import {
  applyDemoSeed,
  provisionGuestSpace,
  DEMO_ITEMS,
  DEMO_REGIONS,
  DEMO_SPACE_ID,
} from "./db/demo-seed";
import { authorize, authorizedItemIds, authorizedRegionIds, humanRegions } from "./permissions";
import { consumeQuota, quotaLimits, GUEST_QUOTA, QUOTA, quotaPeriod } from "./quota";
import { handleRoute, spaceIdFor, visibleTasteSignals } from "./routes";
import { resolveHuman } from "./auth";
import { signDemoLink, signDemoToken, verifyDemoToken } from "./blob-sign";
import { isComponentPreview } from "../src/ui/workbench/componentPreview";
import { confidenceFrom, type ContextItem } from "@shared/contract";

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

const SECRET = "test-signing-secret";
/** Two distinct judges. Real Clerk ids are `user_…`, never `demo-…`. */
const A = "demo-11111111-1111-1111-1111-111111111111";
const B = "demo-22222222-2222-2222-2222-222222222222";
const NOW = 1_800_000_000_000;

function regionId(q: Queries, slug: string): string {
  const r = q.getRegionBySlug(DEMO_SPACE_ID, slug);
  if (!r) throw new Error(`no demo region ${slug}`);
  return r.id;
}

/** Give `human` a live task in the shared demo space with `slug` granted at `level`. */
function demoTaskWithGrant(
  q: Queries,
  human: string,
  taskId: string,
  slug: string,
  level: "read" | "propose" | "write",
): void {
  q.insertTask({
    id: taskId, space_id: DEMO_SPACE_ID, human_id: human, title: "Demo", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });
  q.insertGrant({
    id: `g-${taskId}`, task_id: taskId, space_id: DEMO_SPACE_ID, region_id: regionId(q, slug),
    level, grantor_id: human, created_at: NOW, expires_at: null,
    revoked_at: null, revoked_by: null, reason: null,
  });
}

function seededImages(q: Queries): ContextItem[] {
  return q.listItemsBySpace(DEMO_SPACE_ID).filter((i) => i.type === "image");
}

/* ---------------- the shared space ---------------- */

test("every demo identity maps to the one shared space; real members do not", () => {
  expect(spaceIdFor(A)).toBe(DEMO_SPACE_ID);
  expect(spaceIdFor(B)).toBe(DEMO_SPACE_ID);
  expect(spaceIdFor(A)).toBe(spaceIdFor(B));
  expect(spaceIdFor("user_2abcDEF")).toBe("space-user_2abcDEF");
});

test("the shared demo space boots with the seeded regions, items and design profiles", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);

  const space = q.getSpace(DEMO_SPACE_ID);
  expect(space?.kind).toBe("guest");

  const regions = q.listRegions(DEMO_SPACE_ID);
  expect(regions.map((r) => r.slug).toSorted()).toEqual(DEMO_REGIONS.map((r) => r.slug).toSorted());

  const items = q.listItemsBySpace(DEMO_SPACE_ID);
  expect(items).toHaveLength(DEMO_ITEMS.length);

  const withDesign = items.filter((i) => (i.metadata as { design?: unknown }).design);
  expect(withDesign).toHaveLength(DEMO_ITEMS.filter((d) => d.design).length);
});

test("design profiles arrive pre-baked — no AI binding call on boot", () => {
  // provisionGuestSpace takes (q, humanId, spaceId, now) and no env / AI binding:
  // there is structurally no extraction path on boot.
  expect(provisionGuestSpace.length).toBe(4);

  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);

  const bySrc = new Map(DEMO_ITEMS.filter((d) => d.design).map((d) => [d.title, d.design]));
  for (const img of seededImages(q)) {
    const design = (img.metadata as { design: Record<string, unknown> }).design;
    expect(design).toEqual(bySrc.get(img.title));
    expect(design.palette_source).toBe("measured");
    expect(design.extracted_by).toBe("@cf/meta/llama-3.2-11b-vision-instruct");
    expect(design.extracted_at).not.toBe(NOW);
  }

  // rebuildSpaceEdges still grew real edges off those baked profiles, no model.
  const grotesque = seededImages(q).filter(
    (i) => (i.metadata as { design: { typography: { classification: string } } }).design.typography
      .classification === "grotesque",
  );
  expect(grotesque.length).toBeGreaterThanOrEqual(2);
  const [a, b] = grotesque;
  const linked = q
    .allEdgesForItem(a.id)
    .some((e) => e.relationship === "related_to" && (e.from_id === b.id || e.to_id === b.id));
  expect(linked).toBe(true);
});

test("two demo identities resolve to the same space and both see the seeded items", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW); // A happens to be first in

  // B provisions nothing of its own — spaceIdFor routes it to space-demo.
  expect(spaceIdFor(B)).toBe(DEMO_SPACE_ID);

  // Both get write on the guest space's regions via humanRegions' guest branch.
  for (const who of [A, B]) {
    const levels = humanRegions(q, DEMO_SPACE_ID, who);
    expect(levels).toHaveLength(DEMO_REGIONS.length);
    expect(levels.every((r) => r.level === "write")).toBe(true);
  }

  // And through a granted task, both retrieve the identical seeded item set.
  demoTaskWithGrant(q, A, "tA", "inspiration", "read");
  demoTaskWithGrant(q, B, "tB", "inspiration", "read");
  const seenA = authorizedItemIds(q, "tA", NOW);
  const seenB = authorizedItemIds(q, "tB", NOW);
  expect(seenA.size).toBeGreaterThan(0);
  expect([...seenA].toSorted()).toEqual([...seenB].toSorted());
});

test("both demo identities can write, and both writes survive", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  demoTaskWithGrant(q, A, "tA", "work", "write");
  demoTaskWithGrant(q, B, "tB", "work", "write");

  for (const task of ["tA", "tB"]) {
    const res = authorize(q, {
      taskId: task, agentSessionId: null, regionSlug: "work",
      need: "write", toolName: "add_context_item", requested: {},
    }, NOW);
    expect(res.ok).toBe(true);
  }

  // Simulate each write landing (add_context_item inserts an item owned by the
  // acting human into the granted region).
  const work = regionId(q, "work");
  for (const who of [A, B]) {
    q.insertItem({
      id: `note-${who}`, space_id: DEMO_SPACE_ID, region_id: work, owner_id: who,
      type: "note", title: `${who} note`, source_url: null, content_ref: null,
      semantic_text: "x", metadata: {}, authority_class: "human_authored",
      created_by: who, created_at: NOW, updated_at: NOW,
    });
  }

  const ids = q.listItemsBySpace(DEMO_SPACE_ID).map((i) => i.id);
  expect(ids).toContain(`note-${A}`);
  expect(ids).toContain(`note-${B}`); // nothing lost — the multi-agent consistency claim
});

test("grants are independent: A revoking a region for A's task leaves B untouched", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  demoTaskWithGrant(q, A, "tA", "inspiration", "write");
  demoTaskWithGrant(q, B, "tB", "inspiration", "write");
  const insp = regionId(q, "inspiration");

  expect(authorizedRegionIds(q, "tA", NOW).has(insp)).toBe(true);
  expect(authorizedRegionIds(q, "tB", NOW).has(insp)).toBe(true);
  const bBefore = authorizedItemIds(q, "tB", NOW);
  expect(bBefore.size).toBeGreaterThan(0);

  // A revokes Inspiration on A's task — exactly what POST /api/grants does.
  q.revokeGrant("g-tA", A, "superseded", NOW + 1);

  // A loses it, server-side, at every level.
  expect(authorizedRegionIds(q, "tA", NOW + 2).has(insp)).toBe(false);
  const denied = authorize(q, {
    taskId: "tA", agentSessionId: null, regionSlug: "inspiration",
    need: "read", toolName: "retrieve", requested: {},
  }, NOW + 2);
  expect(denied.ok).toBe(false);

  // B keeps it — grant and retrieval both untouched.
  expect(authorizedRegionIds(q, "tB", NOW + 2).has(insp)).toBe(true);
  expect([...authorizedItemIds(q, "tB", NOW + 2)].toSorted()).toEqual([...bBefore].toSorted());
});

/* ---------------- THE INVARIANT ---------------- */

test("a demo identity cannot read a kind:'personal' space at any grant level", () => {
  const q = makeQueries();

  // A real member's space with a private item.
  q.insertSpace({ id: "space-user_m", name: "Archive", owner_id: "user_m", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "m-insp", space_id: "space-user_m", parent_id: null, name: "Inspiration", slug: "inspiration", created_at: 1 });
  q.insertItem({
    id: "m-secret", space_id: "space-user_m", region_id: "m-insp", owner_id: "user_m",
    type: "note", title: "Member private", source_url: null, content_ref: null,
    semantic_text: "secret", metadata: {}, authority_class: "human_authored",
    created_by: "user_m", created_at: 1, updated_at: 1,
  });

  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  q.insertTask({
    id: "tA", space_id: DEMO_SPACE_ID, human_id: A, title: "Demo", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });
  q.insertAgentSession({ id: "sA", human_id: A, task_id: "tA", declared: null, created_at: NOW });

  // The personal space never takes the guest branch of humanRegions: a demo id
  // gets "none" on every one of its regions.
  expect(humanRegions(q, "space-user_m", A).every((r) => r.level === "none")).toBe(true);

  // Hand-insert a cross-space grant at each level, most permissive included. The
  // FK is satisfied; the guard is that human access is still the ceiling.
  for (const level of ["read", "propose", "write"] as const) {
    q.insertGrant({
      id: `x-${level}`, task_id: "tA", space_id: DEMO_SPACE_ID, region_id: "m-insp",
      level, grantor_id: A, created_at: NOW, expires_at: null, revoked_at: null, revoked_by: null, reason: null,
    });

    expect(authorizedRegionIds(q, "tA", NOW).has("m-insp")).toBe(false);
    expect(authorizedItemIds(q, "tA", NOW).has("m-secret")).toBe(false);

    const res = authorize(q, {
      taskId: "tA", agentSessionId: "sA", regionSlug: "inspiration",
      need: level, toolName: "retrieve", requested: {},
    }, NOW);
    // "inspiration" resolves to the DEMO space's own region, never the member's.
    if (res.ok) expect(res.region.id).not.toBe("m-insp");
  }

  // Whatever a demo task can reach, it is only ever in the demo space.
  for (const id of authorizedItemIds(q, "tA", NOW)) {
    expect(q.getItem(id)?.space_id).toBe(DEMO_SPACE_ID);
  }
});

test("a real member's own access is unchanged by the demo model", () => {
  const q = makeQueries();
  q.insertSpace({ id: "space-user_m", name: "Archive", owner_id: "user_m", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "m-work", space_id: "space-user_m", parent_id: null, name: "Work", slug: "work", created_at: 1 });
  q.insertTask({
    id: "mt", space_id: "space-user_m", human_id: "user_m", title: "T", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });
  q.insertGrant({
    id: "mg", task_id: "mt", space_id: "space-user_m", region_id: "m-work",
    level: "write", grantor_id: "user_m", created_at: NOW, expires_at: null,
    revoked_at: null, revoked_by: null, reason: null,
  });

  expect(humanRegions(q, "space-user_m", "user_m")[0].level).toBe("write");
  const res = authorize(q, {
    taskId: "mt", agentSessionId: null, regionSlug: "work", need: "write",
    toolName: "add_context_item", requested: {},
  }, NOW);
  expect(res.ok).toBe(true);

  // A demo identity gets nothing on that personal space, and metering is
  // unchanged: personal spaces meter against the full QUOTA table.
  expect(humanRegions(q, "space-user_m", A).every((r) => r.level === "none")).toBe(true);
  expect(quotaLimits("personal")).toBe(QUOTA);
  expect(quotaLimits("guest")).toBe(GUEST_QUOTA);
});

/* ---------------- the demo_session cookie ---------------- */

test("an expired or tampered demo_session cookie resolves to no identity (fails closed)", async () => {
  const env = { BLOB_SIGNING_SECRET: SECRET } as unknown as Parameters<typeof resolveHuman>[1];
  const withCookie = (v: string) =>
    resolveHuman(
      new Request("https://archive.example/api/regions", { headers: { Cookie: `demo_session=${v}` } }),
      env,
    );

  const fresh = await signDemoToken(SECRET, 60_000);
  expect(await withCookie(fresh.value)).toEqual({ human_id: `demo-${fresh.nonce}` });

  const expired = await signDemoToken(SECRET, -1_000);
  expect(await withCookie(expired.value)).toBeNull();

  const [nonce, exp, sig] = fresh.value.split(".");
  const flipped = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
  expect(await withCookie(`${nonce}.${exp}.${flipped}`)).toBeNull(); // tampered signature
  expect(await withCookie(`${nonce}-x.${exp}.${sig}`)).toBeNull(); // tampered nonce
  expect(await withCookie("not-a-token")).toBeNull(); // malformed
  expect(await resolveHuman(new Request("https://archive.example/api/regions"), env)).toBeNull(); // absent

  // A token signed with a different secret can't be forged in.
  const forged = await signDemoToken("different-secret", 60_000);
  expect(await withCookie(forged.value)).toBeNull();

  // verifyDemoToken directly, too.
  expect(await verifyDemoToken(SECRET, fresh.value)).toBe(fresh.nonce);
  expect(await verifyDemoToken(undefined, fresh.value)).toBeNull();
});

/* ---------------- /api/demo-entry ---------------- */

const demoEntry = (
  env: Record<string, unknown>,
  url = "https://archive.example/api/demo-entry",
  method = "GET",
) =>
  handleRoute(
    new Request(url, { method }),
    env as unknown as Parameters<typeof handleRoute>[1],
    // The route returns before touching the DB — no session, no queries.
    null as unknown as Queries,
  );

test("GET /api/demo-entry sets a demo_session cookie and 302s to /", async () => {
  const res = await demoEntry({ BLOB_SIGNING_SECRET: SECRET });
  expect(res.status).toBe(302);
  expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");

  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith("demo_session="));
  expect(session).toBeDefined();
  expect(session).toContain("HttpOnly");
  expect(session).toContain("Secure");
  expect(session).toContain("SameSite=Lax");
  expect(session).toMatch(/Max-Age=86400\b/);
  expect(cookies.some((c) => c.startsWith("demo_hint=1"))).toBe(true);

  const value = session!.slice("demo_session=".length).split(";")[0];
  expect(await verifyDemoToken(SECRET, value)).not.toBeNull();
});

test("/api/demo-entry fails closed with BLOB_SIGNING_SECRET unset — no redirect", async () => {
  const res = await demoEntry({});
  expect(res.status).toBe(503);
  expect(res.headers.get("location")).toBeNull();
  expect(await res.json()).toEqual({ ok: false, error: "demo_unavailable" });
});

test("/api/demo-entry is GET only", async () => {
  const res = await demoEntry({ BLOB_SIGNING_SECRET: SECRET }, undefined, "POST");
  expect(res.status).toBe(400);
});

test("/api/demo-entry rejects an expired pre-minted ?token= and honours a live one", async () => {
  const env = { BLOB_SIGNING_SECRET: SECRET };

  const dead = await signDemoLink(SECRET, -1_000);
  const bad = await demoEntry(env, `https://archive.example/api/demo-entry?token=${dead.exp}.${dead.sig}`);
  expect(bad.status).toBe(403);
  expect(bad.headers.getSetCookie()).toHaveLength(0);

  const live = await signDemoLink(SECRET, 60_000);
  const ok = await demoEntry(env, `https://archive.example/api/demo-entry?token=${live.exp}.${live.sig}`);
  expect(ok.status).toBe(302);
  expect(ok.headers.getSetCookie().some((c) => c.startsWith("demo_session="))).toBe(true);
});

test("the shared demo space is seeded exactly once across repeated entries", async () => {
  const q = makeQueries();
  const env = { BLOB_SIGNING_SECRET: SECRET } as unknown as Parameters<typeof handleRoute>[1];

  const cookieFor = async (): Promise<string> => {
    const entry = await handleRoute(new Request("https://archive.example/api/demo-entry"), env, q);
    const set = entry.headers.getSetCookie().find((c) => c.startsWith("demo_session="));
    if (!set) throw new Error("no demo_session cookie");
    return set.split(";")[0]; // "demo_session=<value>"
  };

  // Three visits by three freshly-minted judge identities.
  for (const cookie of [await cookieFor(), await cookieFor(), await cookieFor()]) {
    const res = await handleRoute(
      new Request("https://archive.example/api/bootstrap", { method: "POST", headers: { Cookie: cookie } }),
      env,
      q,
    );
    expect(res.status).toBe(200);
  }

  expect(q.listItemsBySpace(DEMO_SPACE_ID)).toHaveLength(DEMO_ITEMS.length);
  expect(q.listRegions(DEMO_SPACE_ID)).toHaveLength(DEMO_REGIONS.length);
  expect(q.listSpaces().filter((s) => s.kind === "guest")).toHaveLength(1);
});

test("a wiped shared demo space is recovered on the next entry", async () => {
  const q = makeQueries();
  const env = { BLOB_SIGNING_SECRET: SECRET } as unknown as Parameters<typeof handleRoute>[1];

  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  q.purgeSpace(DEMO_SPACE_ID); // every judge deleted everything
  expect(q.listItemsBySpace(DEMO_SPACE_ID)).toHaveLength(0);

  const entry = await handleRoute(new Request("https://archive.example/api/demo-entry"), env, q);
  const cookie = entry.headers.getSetCookie().find((c) => c.startsWith("demo_session="))!.split(";")[0];
  await handleRoute(
    new Request("https://archive.example/api/bootstrap", { method: "POST", headers: { Cookie: cookie } }),
    env,
    q,
  );

  expect(q.listItemsBySpace(DEMO_SPACE_ID)).toHaveLength(DEMO_ITEMS.length);
  expect(q.listRegions(DEMO_SPACE_ID)).toHaveLength(DEMO_REGIONS.length);
});

/* ---------------- quota + beta cap (unchanged guarantees) ---------------- */

test("a demo identity cannot consume a real member's quota", () => {
  const q = makeQueries();
  q.insertSpace({ id: "space-user_m", name: "Archive", owner_id: "user_m", kind: "personal", created_at: 1 });
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);

  const period = quotaPeriod();
  expect(quotaLimits(q.getSpace(DEMO_SPACE_ID)?.kind)).toBe(GUEST_QUOTA);
  for (let i = 0; i < GUEST_QUOTA.agent_calls; i++) {
    expect(consumeQuota(q, A, "agent_calls", 1, GUEST_QUOTA).ok).toBe(true);
  }
  expect(consumeQuota(q, A, "agent_calls", 1, GUEST_QUOTA).ok).toBe(false);
  expect(q.usageGet("user_m", period, "agent_calls")).toBe(0);

  // uploads / vision are fully closed to demo identities.
  expect(GUEST_QUOTA.uploads).toBe(0);
  expect(GUEST_QUOTA.vision_calls).toBe(0);
  expect(consumeQuota(q, A, "uploads", 1, GUEST_QUOTA).ok).toBe(false);
  expect(consumeQuota(q, A, "vision_calls", 1, GUEST_QUOTA).ok).toBe(false);

  // Two judges meter independently — B has its own GUEST_QUOTA budget.
  expect(consumeQuota(q, B, "agent_calls", 1, GUEST_QUOTA).ok).toBe(true);
});

test("the shared demo space does not count against BETA_MAX_USERS", () => {
  const q = makeQueries();
  for (let i = 0; i < 25; i++) {
    expect(q.claimBetaSlot(`member-${i}`, 25, 1)).not.toBeNull();
  }
  expect(q.claimBetaSlot("member-25", 25, 1)).toBeNull();

  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  expect(q.getSpace(DEMO_SPACE_ID)?.kind).toBe("guest");
  expect(q.betaSlot(A)).toBeNull();
  expect(q.betaMemberCount()).toBe(25);
});

test("purgeSpace wipes the demo space and applyDemoSeed restores it", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  q.insertTask({
    id: "t", space_id: DEMO_SPACE_ID, human_id: A, title: "x", instruction: "",
    status: "open", created_at: NOW, expires_at: null,
  });

  q.purgeSpace(DEMO_SPACE_ID);
  expect(q.listItemsBySpace(DEMO_SPACE_ID)).toHaveLength(0);
  expect(q.listRegions(DEMO_SPACE_ID)).toHaveLength(0);
  expect(q.listTasks(DEMO_SPACE_ID)).toHaveLength(0);
  expect(q.getSpace(DEMO_SPACE_ID)?.kind).toBe("guest"); // the space row survives

  applyDemoSeed(q, DEMO_SPACE_ID, A, NOW + 1);
  expect(q.listItemsBySpace(DEMO_SPACE_ID)).toHaveLength(DEMO_ITEMS.length);
  expect(q.listRegions(DEMO_SPACE_ID)).toHaveLength(DEMO_REGIONS.length);
});

/* ---------------- the seeded showcase (artifacts + taste) ---------------- */

test("the shared demo space boots with a populated showcase", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);

  // ≥3 artifacts, each with ≥1 version.
  const artifacts = q.listArtifacts(DEMO_SPACE_ID);
  expect(artifacts.length).toBeGreaterThanOrEqual(3);
  for (const a of artifacts) {
    expect(a.kind).toBe("visual_brief");
    expect(q.listArtifactVersions(a.id).length).toBeGreaterThanOrEqual(1);
  }

  // Landing page: two versions, v2 built on v1, states as a real review arc.
  const landing = artifacts.find((a) => a.title === "Alvio — launch landing page")!;
  const [v1, v2] = q.listArtifactVersions(landing.id);
  expect(q.listArtifactVersions(landing.id)).toHaveLength(2);
  expect(v2.parent_version_id).toBe(v1.id);
  expect(v1.state).toBe("changes_requested");
  expect(v2.state).toBe("approved_with_notes");

  // Component seed: the marker is present so the Workbench renders it live.
  const pricing = artifacts.find((a) => a.title === "Pricing — plan toggle")!;
  const pricingHtml = q.listArtifactVersions(pricing.id)[0].content_html;
  expect(isComponentPreview(pricingHtml)).toBe(true);

  // Every artifact version starts a real HTML document.
  for (const a of artifacts) {
    for (const v of q.listArtifactVersions(a.id)) {
      expect(v.content_html.toLowerCase().startsWith("<!doctype html>") ||
        v.content_html.includes("<!doctype html>")).toBe(true);
    }
  }

  // Review trail on artifact 1: one whole-artifact annotation + two decisions.
  const notes = q.listAnnotations(v1.id);
  expect(notes).toHaveLength(1);
  expect(notes[0].target).toBeNull();
  expect(notes[0].sentiment).toBe("negative");
  expect(q.listDecisions(v1.id).map((d) => d.decision)).toEqual(["request_changes"]);
  expect(q.listDecisions(v2.id).map((d) => d.decision)).toEqual(["approve_with_notes"]);

  // Provenance: influences and accesses both exist, and at least one accessed
  // item was never an influence (the "accessed vs used" distinction).
  const showcaseTask = q.listTasks(DEMO_SPACE_ID).find((t) => t.title.startsWith("Alvio spring launch"))!;
  const accesses = q.recentAccesses(showcaseTask.id, 100);
  expect(accesses.length).toBeGreaterThanOrEqual(4);
  const influenceItemIds = new Set(
    q.listArtifacts(DEMO_SPACE_ID)
      .flatMap((a) => q.listArtifactVersions(a.id))
      .flatMap((v) => q.listInfluences(v.id).map((i) => i.item_id)),
  );
  expect(influenceItemIds.size).toBeGreaterThan(0);
  expect(accesses.some((a) => !influenceItemIds.has(a.item_id))).toBe(true);
  for (const acc of accesses) expect(q.getItem(acc.item_id)).not.toBeNull();
});

test("the seeded taste signals are grounded and derive their confidence", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);

  const signals = q.listTasteSignals(DEMO_SPACE_ID);
  expect(signals.filter((s) => s.status === "confirmed")).toHaveLength(3);
  expect(signals.filter((s) => s.status === "proposed")).toHaveLength(1);
  expect(signals.length).toBeGreaterThanOrEqual(4);

  for (const s of signals) {
    expect(s.created_by).toBe("human");
    expect(s.scope).toBe("personal");
    expect(s.dimensions.length).toBeGreaterThanOrEqual(1);

    const evidence = q.listTasteEvidence(s.id);
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    // Confidence is derived from evidence counts, never a literal.
    expect(s.confidence).toBe(confidenceFrom(evidence.length, 0));
    for (const e of evidence) {
      expect(e.kind).toBe("supports");
      if (e.item_id) expect(q.getItem(e.item_id)).not.toBeNull();
      if (e.annotation_id) expect(q.getAnnotation(e.annotation_id)).not.toBeNull();
      if (e.version_id) expect(q.getArtifactVersion(e.version_id)).not.toBeNull();
    }

    const events = q.listTasteEvents(s.id);
    expect(events.some((ev) => ev.kind === "proposed")).toBe(true);
    if (s.status === "confirmed") expect(events.some((ev) => ev.kind === "accepted")).toBe(true);
  }

  // One signal cites an annotation, one cites an artifact version, one cites a
  // single item (tentative confidence).
  const allEvidence = signals.flatMap((s) => q.listTasteEvidence(s.id));
  expect(allEvidence.some((e) => e.annotation_id)).toBe(true);
  expect(allEvidence.some((e) => e.version_id)).toBe(true);
  const proposed = signals.find((s) => s.status === "proposed")!;
  expect(q.listTasteEvidence(proposed.id)).toHaveLength(1);
});

/* ---------------- guest-space taste is shared, personal is owner-scoped ---------------- */

test("guest space taste is shared across judges; personal space stays owner-scoped", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW); // seeds signals owned by A

  // B is a second judge in the same shared space — sees A's seeded signals.
  const seenByB = visibleTasteSignals(q, DEMO_SPACE_ID, B);
  expect(seenByB.length).toBe(q.listTasteSignals(DEMO_SPACE_ID).length);
  expect(seenByB.length).toBeGreaterThanOrEqual(4);
  expect(seenByB.every((s) => s.owner_id === A)).toBe(true); // not B's, but B sees them

  // A personal space with two owners' signals: each owner sees only their own.
  q.insertSpace({ id: "space-user_p", name: "Archive", owner_id: "user_p", kind: "personal", created_at: 1 });
  const mkSignal = (owner: string) =>
    q.insertTasteSignal({
      id: `sig-${owner}`, space_id: "space-user_p", owner_id: owner,
      statement: `${owner} likes tight tracking`, dimensions: ["typography"],
      scope: "personal", project_id: null, status: "confirmed", confidence: 0.5,
      created_by: "human", approved_by: owner, supersedes: null, created_at: 1,
    });
  mkSignal("user_p");
  mkSignal("user_q");
  expect(visibleTasteSignals(q, "space-user_p", "user_p").map((s) => s.id)).toEqual(["sig-user_p"]);
  expect(visibleTasteSignals(q, "space-user_p", "user_q").map((s) => s.id)).toEqual(["sig-user_q"]);
});

test("purgeSpace clears the showcase and provisionGuestSpace restores it", () => {
  const q = makeQueries();
  provisionGuestSpace(q, A, DEMO_SPACE_ID, NOW);
  q.purgeSpace(DEMO_SPACE_ID);
  expect(q.listArtifacts(DEMO_SPACE_ID)).toHaveLength(0);
  expect(q.listTasteSignals(DEMO_SPACE_ID)).toHaveLength(0);

  applyDemoSeed(q, DEMO_SPACE_ID, A, NOW + 1);
  expect(q.listArtifacts(DEMO_SPACE_ID).length).toBeGreaterThanOrEqual(3);
  expect(q.listTasteSignals(DEMO_SPACE_ID).length).toBeGreaterThanOrEqual(4);
});
