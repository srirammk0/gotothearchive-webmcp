/**
 * Regression: the manual dimension picker was removed from the UI, which left
 * `handleAnnotations` writing `dimensions: []` and `deriveTasteSignals` — which
 * groups by dimension — deriving nothing from human feedback. `resolveAnnotation
 * Dimensions` now infers them from the note text (keyword classifier). This test
 * walks two plain-text human notes through inference → derivation and asserts a
 * proposal appears, the way TESTING.md run 001 expected and did not get.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "../db/queries";
import { migrate } from "../db/migrate";
import { deriveTasteSignals } from "./derive";
import { classifyAnnotationDimensions } from "./classifier";

const HUMAN = "user_1";
const SPACE = "space-user_1";
const now = 1_000_000;

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

async function humanNote(q: Queries, id: string, versionId: string, comment: string): Promise<void> {
  // Mirrors handleAnnotations POST: no explicit dimensions → infer from text.
  const dimensions = await classifyAnnotationDimensions(undefined, {
    title: "Spring hero v1",
    comment,
    authorId: HUMAN,
    sentiment: "negative",
  });
  q.insertAnnotation({
    id, version_id: versionId, author_id: HUMAN, target: null,
    sentiment: "negative", dimensions, comment, status: "open", created_at: now + 2,
  });
}

test("two plain-text human colour notes produce a proposed taste signal", async () => {
  const q = makeQueries();
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: now });
  q.insertRegion({ id: "r_work", space_id: SPACE, parent_id: null, name: "Work", slug: "work", created_at: now });
  q.insertTask({
    id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "",
    status: "open", created_at: now, expires_at: null,
  });
  q.insertItem({
    id: "i_brief", space_id: SPACE, region_id: "r_work", owner_id: HUMAN, type: "note",
    title: "Brief", source_url: null, content_ref: null, semantic_text: "spring campaign",
    metadata: {}, authority_class: "human_authored", created_by: HUMAN, created_at: now, updated_at: now,
  });
  q.insertAgentSession({ id: "sess1", human_id: HUMAN, task_id: "t1", declared: null, created_at: now });
  q.insertArtifact({ id: "art1", space_id: SPACE, task_id: "t1", kind: "doc", title: "Spring hero v1", created_at: now });
  q.insertArtifactVersion({
    id: "v1", artifact_id: "art1", version_no: 1, parent_version_id: null,
    content_html: "<h1>Bloom</h1>", agent_session_id: "sess1", state: "ready_for_review", created_at: now,
  });
  // Taste only learns from feedback on reviewed, influence-citing agent work.
  q.insertInfluence({ id: "inf1", version_id: "v1", item_id: "i_brief", role: "reference", strength: 1, note: null });

  await humanNote(q, "a1", "v1", "the colour palette feels flat and washed out");
  await humanNote(q, "a2", "v1", "these muted colours read cold, wanted a warmer palette");

  q.setArtifactVersionState("v1", "changes_requested");

  // Both notes must have landed on the colour dimension for the group to form.
  expect(q.getAnnotation("a1")?.dimensions).toContain("color");
  expect(q.getAnnotation("a2")?.dimensions).toContain("color");

  await deriveTasteSignals(q, SPACE, now + 3);

  const proposed = q.listTasteSignals(SPACE).filter((s) => s.status === "proposed" && s.created_by === "system");
  expect(proposed.length).toBeGreaterThanOrEqual(1);
  const colorSignal = proposed.find((s) => s.dimensions.includes("color"));
  expect(colorSignal).toBeDefined();
  expect(q.listTasteEvidence(colorSignal!.id).length).toBeGreaterThanOrEqual(2);
});
