/**
 * The capture → extract flow, end to end against a real schema:
 *  - a captured X/Twitter link becomes ONE item (no child cards for media/links)
 *  - the post text lands in semantic_text (so it reaches FTS / retrieval / memory)
 *  - the media + referenced links are kept on metadata.extracted
 *  - the item is queued to the external memory index with that text
 *
 * Mirrors the handleItems POST enrichment in worker/routes.ts. `extractUrl` is
 * stubbed with a canned cdn.syndication.twimg.com payload (the real network call
 * is covered by worker/extract.test.ts + a manual live check).
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { parseTweetResult } from "./extract";
import { deriveEdgesForItem } from "./graph-build";

function makeQueries(): { q: Queries; db: Database } {
  const db = new Database(":memory:");
  db.run(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  const sql = {
    exec: (query: string, ...b: unknown[]) => {
      const rows = db.query(query).all(...(b as never[]));
      return { toArray: () => rows };
    },
  } as unknown as ConstructorParameters<typeof Queries>[0];
  const q = new Queries(sql, { mirrorMemory: true });
  migrate(sql);
  return { q, db };
}

const TWEET = {
  text: "The design vs The image https://t.co/QPou8ubm07",
  display_text_range: [0, 23],
  user: { screen_name: "Palakonweb" },
  mediaDetails: [
    { media_url_https: "https://pbs.twimg.com/media/HQNrjNeaUAAOkNY.jpg" },
    { media_url_https: "https://pbs.twimg.com/media/HQNrj2qbAAAm_rv.jpg" },
  ],
  entities: { urls: [{ expanded_url: "https://example.com/case-study" }] },
};

test("a captured tweet becomes one item; media + links go to metadata, text to semantic_text + memory", () => {
  const { q, db } = makeQueries();
  q.insertSpace({ id: "s", name: "A", owner_id: "u", kind: "personal", created_at: 1 });
  q.insertRegion({ id: "r", space_id: "s", parent_id: null, name: "Work", slug: "work", created_at: 1 });

  const now = 1_000;
  const id = crypto.randomUUID();
  // 1. bare item (handleItems inserts first)
  q.insertItem({
    id, space_id: "s", region_id: "r", owner_id: "u", type: "link",
    title: "https://x.com/Palakonweb/status/2090632922659508367", source_url: "https://x.com/Palakonweb/status/2090632922659508367",
    content_ref: null, semantic_text: null, metadata: {}, authority_class: "human_authored",
    created_by: "u", created_at: now, updated_at: now,
  });

  // 2. enrichment (extractUrl stubbed by parseTweetResult on the canned payload)
  const ex = parseTweetResult(TWEET);
  const parent = q.getItem(id)!;
  const looksRaw = !parent.title.trim() || /^https?:\/\//i.test(parent.title.trim());
  q.updateItem({
    ...parent,
    title: ex.title && looksRaw ? ex.title.slice(0, 140) : parent.title,
    semantic_text: ex.text ?? parent.semantic_text,
    metadata: {
      extracted: { text: ex.text, images: ex.images, links: ex.links, author: ex.author, kind: ex.kind },
    },
    updated_at: now,
  });
  deriveEdgesForItem(q, q.getItem(id)!, now);

  // no child cards
  expect(q.listItemsBySpace("s")).toHaveLength(1);

  const item = q.getItem(id)!;
  expect(item.title).toBe("The design vs The image");
  expect(item.semantic_text).toBe("The design vs The image");
  const extracted = (item.metadata as { extracted: { images: string[]; links: string[]; author: string } }).extracted;
  expect(extracted.images).toEqual([
    "https://pbs.twimg.com/media/HQNrjNeaUAAOkNY.jpg",
    "https://pbs.twimg.com/media/HQNrj2qbAAAm_rv.jpg",
  ]);
  expect(extracted.links).toEqual(["https://example.com/case-study"]);
  expect(extracted.author).toBe("Palakonweb");

  // queued to the external memory index with the post text as content
  const jobs = db.query("SELECT op, payload, status FROM memory_outbox WHERE item_id = ? ORDER BY updated_at").all(id) as {
    op: string; payload: string; status: string;
  }[];
  expect(jobs.length).toBeGreaterThanOrEqual(1);
  const last = JSON.parse(jobs[jobs.length - 1].payload) as { title: string; semantic_text: string };
  expect(last.semantic_text).toBe("The design vs The image");
});
