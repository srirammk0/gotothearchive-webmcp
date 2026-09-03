/**
 * F1 — region-scoped taste revocation. Revoking a folder takes the taste that
 * folder taught with it, on BOTH agent-facing surfaces (`get_taste_for_task`
 * and `retrieve()`), while the human's own Taste page keeps every signal.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "../db/queries";
import { migrate } from "../db/migrate";
import { handleToolCall } from "../mcp";
import { retrieve } from "../retrieval";

function makeQueries(): Queries {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
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

const HUMAN = "u1";
const SPACE = "s1";
const now = 1_000_000;

const item = (q: Queries, id: string, region_id: string, title: string, text: string): void =>
  q.insertItem({
    id,
    space_id: SPACE,
    region_id,
    owner_id: HUMAN,
    type: "note",
    title,
    source_url: null,
    content_ref: null,
    semantic_text: text,
    metadata: { dimensions: ["color"] },
    authority_class: "human_authored",
    created_by: HUMAN,
    created_at: now,
    updated_at: now,
  });

const signal = (q: Queries, id: string, statement: string): void =>
  q.insertTasteSignal({
    id,
    space_id: SPACE,
    owner_id: HUMAN,
    statement,
    dimensions: ["color"],
    scope: "personal",
    status: "confirmed",
    confidence: 0.9,
    created_by: "human",
    approved_by: HUMAN,
    created_at: now,
    supersedes: null,
    project_id: null,
  });

const groundInItem = (q: Queries, signalId: string, itemId: string): void =>
  q.insertTasteEvidence({
    id: crypto.randomUUID(),
    signal_id: signalId,
    kind: "supports",
    annotation_id: null,
    version_id: null,
    item_id: itemId,
  });

const grant = (q: Queries, region_id: string): void =>
  q.insertGrant({
    id: `g_${region_id}`,
    task_id: "t1",
    space_id: SPACE,
    region_id,
    level: "read",
    grantor_id: HUMAN,
    created_at: now,
    expires_at: null,
    revoked_at: null,
    revoked_by: null,
    reason: null,
  });

function seed(q: Queries) {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  for (const [id, slug] of [
    ["r_work", "work"],
    ["r_insp", "inspiration"],
  ] as const) {
    q.insertRegion({ id, space_id: SPACE, parent_id: null, name: slug, slug, created_at: now });
  }
  item(q, "i_work", "r_work", "Colour palette study", "warm saturated colour palette");
  item(q, "i_insp", "r_insp", "Editorial colour reference", "dense colour palette reference");

  q.insertTask({
    id: "t1",
    space_id: SPACE,
    human_id: HUMAN,
    title: "Spring campaign",
    instruction: "",
    status: "open",
    created_at: now,
    expires_at: null,
  });
  grant(q, "r_work");
  grant(q, "r_insp");
  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: null, created_at: now });
}

async function toolSignalIds(q: Queries): Promise<string[]> {
  const res = await handleToolCall(
    { tool: "get_taste_for_task", input: {}, agent_session_id: "sess1", task_id: "t1" },
    q,
    { human_id: HUMAN },
    now + 1,
  );
  expect(res.ok).toBe(true);
  return (res as { result: { signals: { id: string }[] } }).result.signals.map((s) => s.id);
}

test("a signal grounded only in inspiration is present with the grant, gone once it is revoked", async () => {
  const q = makeQueries();
  seed(q);
  signal(q, "sig_insp", "leans on a dense saturated colour palette");
  groundInItem(q, "sig_insp", "i_insp");

  expect(await toolSignalIds(q)).toContain("sig_insp");

  q.revokeGrant("g_r_insp", HUMAN, null, now + 2);
  expect(await toolSignalIds(q)).not.toContain("sig_insp");
});

test("a signal grounded in work + inspiration is gone when EITHER is revoked (every, not some)", async () => {
  for (const toRevoke of ["g_r_work", "g_r_insp"] as const) {
    const q = makeQueries();
    seed(q);
    signal(q, "sig_both", "warm saturated colour palette across the set");
    groundInItem(q, "sig_both", "i_work");
    groundInItem(q, "sig_both", "i_insp");

    expect(await toolSignalIds(q)).toContain("sig_both");
    q.revokeGrant(toRevoke, HUMAN, null, now + 2);
    expect(await toolSignalIds(q)).not.toContain("sig_both");
  }
});

test("a signal with no resolvable grounding stays available", async () => {
  const q = makeQueries();
  seed(q);
  signal(q, "sig_free", "prefers generous whitespace");
  groundInItem(q, "sig_free", "i_deleted"); // evidence points at nothing

  expect(await toolSignalIds(q)).toContain("sig_free");
  q.revokeGrant("g_r_insp", HUMAN, null, now + 2);
  expect(await toolSignalIds(q)).toContain("sig_free");
});

test("the retrieval path agrees with the tool path after revocation", async () => {
  const q = makeQueries();
  seed(q);
  signal(q, "sig_insp", "warm saturated colour palette");
  groundInItem(q, "sig_insp", "i_insp");

  const before = await retrieve(q, { taskId: "t1", query: "colour", regionSlugs: null, limit: 10 }, now + 1);
  expect(before.some((r) => r.applied_signal_ids.includes("sig_insp"))).toBe(true);

  q.revokeGrant("g_r_insp", HUMAN, null, now + 2);

  const after = await retrieve(q, { taskId: "t1", query: "colour", regionSlugs: null, limit: 10 }, now + 3);
  expect(after.some((r) => r.applied_signal_ids.includes("sig_insp"))).toBe(false);

  // get_context_for_task drives the same retrieve() — no 'applied' event for a revoked signal.
  const ctx = await handleToolCall(
    { tool: "get_context_for_task", input: { query: "colour" }, agent_session_id: "sess1", task_id: "t1" },
    q,
    { human_id: HUMAN },
    now + 4,
  );
  expect(ctx.ok).toBe(true);
  expect(q.listTasteEvents("sig_insp").filter((e) => e.kind === "applied")).toHaveLength(0);
});

test("/api/taste still returns the signal after revocation (the human keeps it)", async () => {
  const q = makeQueries();
  seed(q);
  signal(q, "sig_insp", "warm saturated colour palette");
  groundInItem(q, "sig_insp", "i_insp");

  q.revokeGrant("g_r_insp", HUMAN, null, now + 2);

  // handleTaste GET returns exactly listTasteSignals(space) filtered by owner — unscoped.
  const humanFacing = q.listTasteSignals(SPACE).filter((s) => s.owner_id === HUMAN);
  expect(humanFacing.map((s) => s.id)).toContain("sig_insp");
  // ...while the agent surface has dropped it.
  expect(await toolSignalIds(q)).not.toContain("sig_insp");
});
