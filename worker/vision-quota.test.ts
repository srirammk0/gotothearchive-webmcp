/**
 * The `vision_calls` quota gate on design extraction (worker/quota.ts F3).
 *
 * Exercised through `backfillSpaceDesign` — the exported caller of
 * `extractDesignProfile` that takes injectable deps. The capture path in
 * handleItems runs the identical `consumeQuota(q, humanId, "vision_calls")`
 * check just before the same call.
 *
 * Guard under test: a quota refusal must never fail the surrounding operation.
 * The item is untouched; it just gets no design profile until the counter resets.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { backfillSpaceDesign, type DesignAiLike } from "./design";
import { quotaPeriod, VISION_CALLS_LIMIT } from "./quota";

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

const OWNER = "u1";
const SPACE = "s1";

/** A vision model that always returns a well-formed, in-vocabulary answer. */
const env: DesignAiLike = {
  AI: { run: async () => ({ response: { mood: ["editorial"], "layout.composition": "poster_split" } }) },
};
const getBlob = async () => new Uint8Array([1, 2, 3]);

function seedImage(q: Queries): string {
  const now = 1_000;
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: OWNER, kind: "personal", created_at: now });
  q.insertRegion({ id: "r1", space_id: SPACE, parent_id: null, name: "Work", slug: "work", created_at: now });
  const id = crypto.randomUUID();
  q.insertItem({
    id, space_id: SPACE, region_id: "r1", owner_id: OWNER, type: "image",
    title: "poster.png", source_url: null, content_ref: `${SPACE}/blob-1`,
    semantic_text: null, metadata: {}, authority_class: "human_authored",
    created_by: OWNER, created_at: now, updated_at: now,
  });
  return id;
}

test("over budget: extraction is skipped, the item is left intact, the counter is not touched", async () => {
  const q = makeQueries();
  const id = seedImage(q);
  const period = quotaPeriod();
  q.usageAdd(OWNER, period, "vision_calls", VISION_CALLS_LIMIT); // right at the limit

  const { extracted, morePending } = await backfillSpaceDesign(q, OWNER, env, SPACE, getBlob);

  expect(extracted).toBe(0);
  expect(morePending).toBe(false); // don't re-arm the alarm while over budget
  expect((q.getItem(id)!.metadata as { design?: unknown }).design).toBeUndefined();
  expect(q.usageGet(OWNER, period, "vision_calls")).toBe(VISION_CALLS_LIMIT);
});

test("a successful extraction increments vision_calls exactly once", async () => {
  const q = makeQueries();
  const id = seedImage(q);
  const period = quotaPeriod();

  const first = await backfillSpaceDesign(q, OWNER, env, SPACE, getBlob);
  expect(first.extracted).toBe(1);
  expect(q.usageGet(OWNER, period, "vision_calls")).toBe(1);
  expect((q.getItem(id)!.metadata as { design?: unknown }).design).toBeDefined();

  // Nothing left needing design → no further call, counter stays at 1.
  const second = await backfillSpaceDesign(q, OWNER, env, SPACE, getBlob);
  expect(second.extracted).toBe(0);
  expect(q.usageGet(OWNER, period, "vision_calls")).toBe(1);
});
