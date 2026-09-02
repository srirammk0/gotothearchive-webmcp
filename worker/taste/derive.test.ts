import { test, expect } from "bun:test";
import { deriveTasteSignals } from "./derive";

interface Ann {
  id: string;
  version_id: string;
  dimensions: string[];
  sentiment: "positive" | "negative" | "neutral";
  comment: string;
  author_id: string;
}

interface Signal {
  id: string;
  status: string;
  created_by: string;
  dimensions: string[];
  statement: string;
  confidence: number;
}

interface Evidence {
  id: string;
  signal_id: string;
  annotation_id: string | null;
  kind: "supports" | "contradicts";
}

function stubQ(
  open: Ann[],
  opts: { confirmed?: (Partial<Signal> & Pick<Signal, "dimensions" | "statement">)[] } = {},
) {
  const signals: Signal[] = [];
  const confirmed = (opts.confirmed ?? []).map((s, i) => ({
    id: `confirmed-${i}`,
    status: "confirmed",
    created_by: "human",
    confidence: 0.7,
    ...s,
  })) as Signal[];
  const evidence: Evidence[] = [];
  const events: { signal_id: string; kind: string; actor_type: string }[] = [];
  const q = {
    signals,
    confirmed,
    evidence,
    events,
    openAnnotationsForSpace: () => open,
    confirmedTasteSignals: () => confirmed,
    listTasteSignals: () => signals,
    listTasteEvidence: (id: string) => evidence.filter((e) => e.signal_id === id),
    getAnnotation: (id: string) => open.find((a) => a.id === id) ?? null,
    getArtifactVersion: () => ({ artifact_id: "art1" }),
    getArtifact: () => ({ title: "Homepage", kind: "webpage" }),
    insertTasteSignal: (s: Signal) => signals.push(s),
    insertTasteEvidence: (e: Evidence) => evidence.push(e),
    setTasteEvidenceKind: (id: string, kind: Evidence["kind"]) => {
      const row = evidence.find((e) => e.id === id);
      if (row) row.kind = kind;
    },
    deleteTasteEvidence: (id: string) => {
      const index = evidence.findIndex((e) => e.id === id);
      if (index >= 0) evidence.splice(index, 1);
    },
    insertTasteEvent: (e: { signal_id: string; kind: string; actor_type: string }) => events.push(e),
    tasteEvidenceCounts: (id: string) => ({
      supporting: evidence.filter((e) => e.signal_id === id && e.kind === "supports").length,
      contradicting: evidence.filter((e) => e.signal_id === id && e.kind === "contradicts").length,
    }),
    setTasteSignalConfidence: (id: string, confidence: number) => {
      const signal = [...signals, ...confirmed].find((s) => s.id === id);
      if (signal) signal.confidence = confidence;
    },
  };
  return q as unknown as Parameters<typeof deriveTasteSignals>[0] & typeof q;
}

const ann = (p: Partial<Ann> & { id: string }): Ann => ({
  version_id: "v1",
  dimensions: ["color"],
  sentiment: "negative",
  comment: "",
  author_id: "u1",
  ...p,
});

test("(a) two negative color notes sharing a word -> one proposed signal, clean statement", async () => {
  const q = stubQ([
    ann({ id: "a1", comment: "muted palette everywhere" }),
    ann({ id: "a2", comment: "the palette feels too muted" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(1);
  expect(q.signals[0].status).toBe("proposed");
  expect(q.signals[0].statement).not.toMatch(/from \d+ notes/);
  expect(q.signals[0].statement).toMatch(/muted|palette/);
  expect(q.evidence).toHaveLength(2);
  expect(q.events.filter((e) => e.kind === "proposed")).toHaveLength(1);
});

test("(b) idempotent - second run inserts nothing", async () => {
  const rows = [
    ann({ id: "a1", comment: "muted palette everywhere" }),
    ann({ id: "a2", comment: "the palette feels too muted" }),
  ];
  const q = stubQ(rows);
  await deriveTasteSignals(q, "s1", 1000);
  await deriveTasteSignals(q, "s1", 2000);
  expect(q.signals).toHaveLength(1);
  expect(q.evidence).toHaveLength(2);
});

test("(b2) later matching evidence extends the proposal instead of duplicating it", async () => {
  const rows = [
    ann({ id: "a1", comment: "muted palette everywhere" }),
    ann({ id: "a2", comment: "the palette feels too muted" }),
  ];
  const q = stubQ(rows);
  await deriveTasteSignals(q, "s1", 1000);
  rows.push(ann({ id: "a3", comment: "muted palette still feels flat" }));
  await deriveTasteSignals(q, "s1", 2000);
  expect(q.signals).toHaveLength(1);
  expect(q.evidence).toHaveLength(3);
});

test("(b3) editing sentiment reconciles old evidence before deriving the new direction", async () => {
  const rows = [
    ann({ id: "a1", comment: "muted palette everywhere" }),
    ann({ id: "a2", comment: "the palette feels too muted" }),
  ];
  const q = stubQ(rows);
  await deriveTasteSignals(q, "s1", 1000);
  const oldSignal = q.signals[0];
  rows[0].sentiment = "positive";
  rows[1].sentiment = "positive";
  await deriveTasteSignals(q, "s1", 2000);
  expect(q.evidence.filter((e) => e.signal_id === oldSignal.id).every((e) => e.kind === "contradicts")).toBe(true);
  expect(q.signals).toHaveLength(2);
  expect(oldSignal.confidence).toBe(0.05);
});

test("(c) neutral sentiment ignored", async () => {
  const q = stubQ([
    ann({ id: "a1", sentiment: "neutral", comment: "muted palette here" }),
    ann({ id: "a2", sentiment: "neutral", comment: "muted palette there" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
});

test("(d) untagged notes ignored", async () => {
  const q = stubQ([
    ann({ id: "a1", dimensions: [], comment: "muted palette here" }),
    ann({ id: "a2", dimensions: [], comment: "muted palette there" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
});

test("(d2) a note tagged with two dimensions feeds both groups", async () => {
  const q = stubQ([
    ann({ id: "a1", dimensions: ["color", "typography"], comment: "flat palette, weak headline" }),
    ann({ id: "a2", dimensions: ["color", "typography"], comment: "flat palette, weak headline weight" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  const dims = q.signals.flatMap((s) => s.dimensions);
  expect(dims).toContain("color");
  expect(dims).toContain("typography");
});

test("(e) group of one ignored", async () => {
  const q = stubQ([ann({ id: "a1", comment: "muted palette here" })]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
});

test("(f) matching reviews strengthen an existing confirmed signal", async () => {
  const q = stubQ(
    [
      ann({ id: "a1", comment: "muted palette everywhere" }),
      ann({ id: "a2", comment: "the palette feels too muted" }),
    ],
    { confirmed: [{ dimensions: ["color"], statement: "Leans away from muted palette for color on briefs." }] },
  );
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
  expect(q.evidence.filter((e) => e.kind === "supports")).toHaveLength(2);
});

test("(f2) opposing reviews become contradicting evidence and a reviewable proposal", async () => {
  const q = stubQ(
    [
      ann({ id: "a1", comment: "the saturated palette feels overwhelming" }),
      ann({ id: "a2", comment: "too much saturated color competes with the content" }),
    ],
    { confirmed: [{ dimensions: ["color"], statement: "Leans toward saturated color on webpages." }] },
  );
  const before = q.confirmed[0].confidence;
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.evidence.filter((e) => e.kind === "contradicts")).toHaveLength(2);
  expect(q.confirmed[0].confidence).toBeLessThan(before);
  expect(q.signals).toHaveLength(1);
});

test("(f3) agent-authored annotations never become personal taste evidence", async () => {
  const q = stubQ([
    ann({ id: "a1", author_id: "agent:s1", comment: "muted palette everywhere" }),
    ann({ id: "a2", author_id: "agent:s1", comment: "the palette feels too muted" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
  expect(q.evidence).toHaveLength(0);
});

test("(g) relaxed gate - two notes with no shared word still produce a signal", async () => {
  const q = stubQ([
    ann({ id: "a1", comment: "the red is aggressive" }),
    ann({ id: "a2", comment: "cyan dominates unpleasantly" }),
  ]);
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(1);
  expect(q.signals[0].statement).toContain("color");
});
