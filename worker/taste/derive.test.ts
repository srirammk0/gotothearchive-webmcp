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
}

function stubQ(
  open: Ann[],
  opts: { confirmed?: { dimensions: string[]; statement: string }[] } = {},
) {
  const signals: Signal[] = [];
  const evidence: { signal_id: string; annotation_id: string | null }[] = [];
  const events: { signal_id: string; kind: string; actor_type: string }[] = [];
  const q = {
    signals,
    evidence,
    events,
    openAnnotationsForSpace: () => open,
    confirmedTasteSignals: () => opts.confirmed ?? [],
    listTasteSignals: () => signals,
    listTasteEvidence: (id: string) => evidence.filter((e) => e.signal_id === id),
    getArtifactVersion: () => ({ artifact_id: "art1" }),
    getArtifact: () => ({ title: "Homepage" }),
    insertTasteSignal: (s: Signal) => signals.push(s),
    insertTasteEvidence: (e: { signal_id: string; annotation_id: string | null }) => evidence.push(e),
    insertTasteEvent: (e: { signal_id: string; kind: string; actor_type: string }) => events.push(e),
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

test("(f) confirmed signal already covering dimension+direction -> skipped", async () => {
  const q = stubQ(
    [
      ann({ id: "a1", comment: "muted palette everywhere" }),
      ann({ id: "a2", comment: "the palette feels too muted" }),
    ],
    { confirmed: [{ dimensions: ["color"], statement: "Leans away from muted palette for color on briefs." }] },
  );
  await deriveTasteSignals(q, "s1", 1000);
  expect(q.signals).toHaveLength(0);
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
