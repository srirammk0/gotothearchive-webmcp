/**
 * The taste loop stores and classifies human annotations for dimension hints,
 * but never derives a signal from them: a signal is proposed only by the agent
 * (via `propose_taste_signal`) or authored by the human. This test walks two
 * plain-text human notes through inference and asserts NO signal appears, then
 * checks that `reconcileTasteEvidence` keeps an existing agent-proposed
 * signal's cited evidence honest when those notes change.
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "../db/queries";
import { migrate } from "../db/migrate";
import { reconcileTasteEvidence } from "./derive";
import { classifyAnnotationDimensions } from "./classifier";
import { confidenceFrom } from "@shared/contract";

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

function seed(q: Queries): void {
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
  q.insertInfluence({ id: "inf1", version_id: "v1", item_id: "i_brief", role: "reference", strength: 1, note: null });
}

test("two plain-text human colour notes produce NO taste signal", async () => {
  const q = makeQueries();
  seed(q);

  await humanNote(q, "a1", "v1", "the colour palette feels flat and washed out");
  await humanNote(q, "a2", "v1", "these muted colours read cold, wanted a warmer palette");
  q.setArtifactVersionState("v1", "changes_requested");

  expect(q.getAnnotation("a1")?.dimensions).toContain("color");

  reconcileTasteEvidence(q, SPACE);

  expect(q.listTasteSignals(SPACE)).toHaveLength(0);
});

test("reconcile keeps an existing agent-proposed signal's evidence honest as its notes change", async () => {
  const q = makeQueries();
  seed(q);
  await humanNote(q, "a1", "v1", "the colour palette feels flat and washed out");
  await humanNote(q, "a2", "v1", "these muted colours read cold, wanted a warmer palette");

  // The agent named the pattern and cited both notes.
  q.insertTasteSignal({
    id: "sig1", space_id: SPACE, owner_id: HUMAN,
    statement: "Leans away from flat, washed-out colour on hero sections.",
    dimensions: ["color"], scope: "personal", project_id: null, status: "proposed",
    confidence: confidenceFrom(2, 0), created_by: "agent", approved_by: null,
    created_at: now + 3, supersedes: null,
  });
  for (const [id, aid] of [["e1", "a1"], ["e2", "a2"]] as const) {
    q.insertTasteEvidence({ id, signal_id: "sig1", kind: "supports", annotation_id: aid, version_id: "v1", item_id: null });
  }

  // a1 flips positive: it now contradicts an "away" signal.
  q.updateAnnotation("a1", { sentiment: "positive" });
  // a2 goes neutral: it drops out entirely.
  q.updateAnnotation("a2", { sentiment: "neutral" });

  reconcileTasteEvidence(q, SPACE);

  const evidence = q.listTasteEvidence("sig1");
  expect(evidence).toHaveLength(1);
  expect(evidence[0].annotation_id).toBe("a1");
  expect(evidence[0].kind).toBe("contradicts");
  expect(q.getTasteSignal("sig1")?.confidence).toBeCloseTo(confidenceFrom(0, 1), 5);
});
