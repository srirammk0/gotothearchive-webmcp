/**
 * DELETE /api/artifacts refunds the "artifacts" quota units the deleted
 * artifact's versions spent this period — same arithmetic the route runs,
 * exercised directly against Queries (handleArtifacts itself is a thin,
 * untested wrapper around this).
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { quotaPeriod } from "./quota";

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

const HUMAN = "u1";
const SPACE = "s1";

/** Same refund logic as handleArtifacts' DELETE branch. */
function deleteAndRefund(q: Queries, humanId: string, artifactId: string, now: number) {
  const period = quotaPeriod(now);
  const refund = q.listArtifactVersions(artifactId).filter((v) => quotaPeriod(v.created_at) === period).length;
  if (refund > 0) {
    const used = q.usageGet(humanId, period, "artifacts");
    q.usageAdd(humanId, period, "artifacts", -Math.min(refund, used));
  }
  q.deleteArtifact(artifactId);
}

function seedArtifact(q: Queries, versions: number, at: number) {
  q.insertSpace({ id: SPACE, name: "Archive", owner_id: HUMAN, kind: "personal", created_at: at });
  q.insertTask({ id: "t1", space_id: SPACE, human_id: HUMAN, title: "Task", instruction: "", status: "open", created_at: at, expires_at: null });
  const artifactId = "art1";
  q.insertArtifact({ id: artifactId, space_id: SPACE, task_id: "t1", kind: "visual_brief", title: "Brief", region_id: null, created_at: at });
  for (let i = 0; i < versions; i++) {
    q.insertArtifactVersion({
      id: `v${i + 1}`, artifact_id: artifactId, version_no: i + 1, parent_version_id: null,
      content_html: "<p>x</p>", agent_session_id: "sess1", state: "ready_for_review", created_at: at,
    });
    q.usageAdd(HUMAN, quotaPeriod(at), "artifacts", 1); // what record_artifact would have spent
  }
  return artifactId;
}

test("deleting an artifact refunds one quota unit per version spent this period", () => {
  const q = makeQueries();
  const now = Date.now();
  const artifactId = seedArtifact(q, 3, now);
  const period = quotaPeriod(now);
  expect(q.usageGet(HUMAN, period, "artifacts")).toBe(3);

  // Some unrelated usage this period too — must not be touched.
  q.usageAdd(HUMAN, period, "agent_calls", 5);

  deleteAndRefund(q, HUMAN, artifactId, now);

  expect(q.usageGet(HUMAN, period, "artifacts")).toBe(0);
  expect(q.usageGet(HUMAN, period, "agent_calls")).toBe(5);
  expect(q.getArtifact(artifactId)).toBeNull();
});

test("refund never drives usage negative, even if the counter is already lower", () => {
  const q = makeQueries();
  const now = Date.now();
  const artifactId = seedArtifact(q, 2, now);
  const period = quotaPeriod(now);
  // Simulate the counter having been reduced by some other means already.
  q.usageAdd(HUMAN, period, "artifacts", -1);
  expect(q.usageGet(HUMAN, period, "artifacts")).toBe(1);

  deleteAndRefund(q, HUMAN, artifactId, now);

  expect(q.usageGet(HUMAN, period, "artifacts")).toBe(0);
});

test("versions from a prior quota period are not refunded — that counter is gone", () => {
  const q = makeQueries();
  const lastMonth = Date.parse("2026-07-15T00:00:00Z");
  const now = Date.parse("2026-08-15T00:00:00Z");
  const artifactId = seedArtifact(q, 2, lastMonth);
  // This period's counter never saw those spends — nothing to refund into.
  expect(q.usageGet(HUMAN, quotaPeriod(now), "artifacts")).toBe(0);

  deleteAndRefund(q, HUMAN, artifactId, now);

  expect(q.usageGet(HUMAN, quotaPeriod(now), "artifacts")).toBe(0);
  expect(q.getArtifact(artifactId)).toBeNull();
});
