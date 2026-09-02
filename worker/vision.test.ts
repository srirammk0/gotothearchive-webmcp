import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { captionImage, captionSpaceImages } from "./vision";

function makeQueries(): Queries {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...b: unknown[]) => {
      const rows = db.query(query).all(...(b as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql, {});
  migrate(sql);
  q.insertSpace({ id: "s", name: "A", owner_id: "u", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r", space_id: "s", parent_id: null, name: "w", slug: "w", created_at: 1 });
  return q;
}

function seedImage(q: Queries, id: string, semanticText: string | null): void {
  q.insertItem({
    id, space_id: "s", region_id: "r", owner_id: "u", type: "image", title: `Image ${id}`,
    source_url: null, content_ref: `s/${id}`, semantic_text: semanticText, metadata: {},
    authority_class: "human_authored", created_by: "u", created_at: 1, updated_at: 1,
  });
}

const bytes = new Uint8Array([1, 2, 3]);
const fakeGetBlob = () => Promise.resolve(bytes);

test("no AI binding -> null, so the item is left title-only same as today", async () => {
  expect(await captionImage(undefined, bytes)).toBeNull();
  expect(await captionImage({}, bytes)).toBeNull();
});

test("a description response is trimmed and returned", async () => {
  const env = { AI: { run: () => Promise.resolve({ description: "  A minimal poster, high contrast.  " }) } };
  expect(await captionImage(env, bytes)).toBe("A minimal poster, high contrast.");
});

test("falls back to a response field when description is absent", async () => {
  const env = { AI: { run: () => Promise.resolve({ response: "Dense editorial layout." }) } };
  expect(await captionImage(env, bytes)).toBe("Dense editorial layout.");
});

test("an unexpected response shape -> null", async () => {
  const env = { AI: { run: () => Promise.resolve({ unrelated: true }) } };
  expect(await captionImage(env, bytes)).toBeNull();
});

test("empty text -> null", async () => {
  const env = { AI: { run: () => Promise.resolve({ description: "   " }) } };
  expect(await captionImage(env, bytes)).toBeNull();
});

test("a thrown call -> null, never propagates", async () => {
  const env = { AI: { run: () => Promise.reject(new Error("model unavailable")) } };
  expect(await captionImage(env, bytes)).toBeNull();
});

test("an over-long description is capped", async () => {
  const long = "x".repeat(1000);
  const env = { AI: { run: () => Promise.resolve({ description: long }) } };
  const caption = await captionImage(env, bytes);
  expect(caption?.length).toBe(601);
  expect(caption?.endsWith("…")).toBe(true);
});

test("captionSpaceImages captions items missing a description, leaves the rest untouched", async () => {
  const q = makeQueries();
  seedImage(q, "a", null);
  seedImage(q, "b", "already has a human caption");

  const env = { AI: { run: () => Promise.resolve({ description: "A dense grid of product cards." }) } };
  const { captioned, morePending } = await captionSpaceImages(q, env, "s", fakeGetBlob);

  expect(captioned).toBe(1);
  expect(morePending).toBe(false);
  expect(q.getItem("a")?.semantic_text).toBe("A dense grid of product cards.");
  expect(q.getItem("b")?.semantic_text).toBe("already has a human caption");
});

test("captionSpaceImages reports morePending when the batch doesn't clear the backlog", async () => {
  const q = makeQueries();
  for (let i = 0; i < 7; i++) seedImage(q, `img${i}`, null);

  const env = { AI: { run: () => Promise.resolve({ description: "A landing page hero." }) } };
  const { captioned, morePending } = await captionSpaceImages(q, env, "s", fakeGetBlob);

  expect(captioned).toBe(5); // BACKFILL_BATCH
  expect(morePending).toBe(true);
});

test("a blob that fails to fetch is skipped, not captioned, still retryable next drain", async () => {
  const q = makeQueries();
  seedImage(q, "a", null);

  const env = { AI: { run: () => Promise.resolve({ description: "Should never be called" }) } };
  const { captioned, morePending } = await captionSpaceImages(q, env, "s", () => Promise.resolve(null));

  expect(captioned).toBe(0);
  expect(morePending).toBe(true);
  expect(q.getItem("a")?.semantic_text).toBeNull();
});
