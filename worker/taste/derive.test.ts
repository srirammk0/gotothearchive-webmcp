import { test, expect } from "bun:test";
import { reconcileTasteEvidence } from "./derive";

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

function stubQ(signals: Signal[], annotations: Ann[], evidence: Evidence[]) {
  const q = {
    signals,
    annotations,
    evidence,
    listTasteSignals: () => signals,
    listTasteEvidence: (id: string) => evidence.filter((e) => e.signal_id === id),
    getAnnotation: (id: string) => annotations.find((a) => a.id === id) ?? null,
    setTasteEvidenceKind: (id: string, kind: Evidence["kind"]) => {
      const row = evidence.find((e) => e.id === id);
      if (row) row.kind = kind;
    },
    deleteTasteEvidence: (id: string) => {
      const index = evidence.findIndex((e) => e.id === id);
      if (index >= 0) evidence.splice(index, 1);
    },
    tasteEvidenceCounts: (id: string) => ({
      supporting: evidence.filter((e) => e.signal_id === id && e.kind === "supports").length,
      contradicting: evidence.filter((e) => e.signal_id === id && e.kind === "contradicts").length,
    }),
    setTasteSignalConfidence: (id: string, confidence: number) => {
      const signal = signals.find((s) => s.id === id);
      if (signal) signal.confidence = confidence;
    },
  };
  return q as unknown as Parameters<typeof reconcileTasteEvidence>[0] & typeof q;
}

const ann = (p: Partial<Ann> & { id: string }): Ann => ({
  version_id: "v1",
  dimensions: ["color"],
  sentiment: "negative",
  comment: "muted palette everywhere",
  author_id: "u1",
  ...p,
});

const sig = (p: Partial<Signal> & { id: string }): Signal => ({
  status: "proposed",
  created_by: "agent",
  dimensions: ["color"],
  statement: "Leans away from muted palettes on webpages.",
  confidence: 0.7,
  ...p,
});

test("no server-side signal creation: reconcile never inserts a signal", () => {
  const q = stubQ([], [ann({ id: "a1" }), ann({ id: "a2" })], []);
  reconcileTasteEvidence(q, "s1");
  expect(q.signals).toHaveLength(0);
});

test("a deleted annotation drops its evidence row and recomputes confidence", () => {
  const q = stubQ(
    [sig({ id: "sig1" })],
    [ann({ id: "a1" })],
    [
      { id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" },
      { id: "e2", signal_id: "sig1", annotation_id: "a2", kind: "supports" },
    ],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence.map((e) => e.id)).toEqual(["e1"]);
  expect(q.signals[0].confidence).toBeCloseTo(1 / 3, 5); // confidenceFrom(1, 0)
});

test("an annotation flipped to neutral is dropped as evidence", () => {
  const q = stubQ(
    [sig({ id: "sig1" })],
    [ann({ id: "a1", sentiment: "neutral" })],
    [{ id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(0);
});

test("an annotation that became agent-authored is dropped as evidence", () => {
  const q = stubQ(
    [sig({ id: "sig1" })],
    [ann({ id: "a1", author_id: "agent:s1" })],
    [{ id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(0);
});

test("flipping an annotation's sentiment flips its evidence kind", () => {
  const q = stubQ(
    [sig({ id: "sig1" })], // statement leans "away"
    [ann({ id: "a1", sentiment: "positive" })], // now toward → contradicts an "away" signal
    [{ id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence[0].kind).toBe("contradicts");
  expect(q.signals[0].confidence).toBeCloseTo(0.05, 5); // confidenceFrom(0, 1)
});

test("evidence is kept even when the annotation's keyword dimension no longer matches the signal", () => {
  const q = stubQ(
    [sig({ id: "sig1", dimensions: ["color"] })],
    [ann({ id: "a1", dimensions: ["typography"] })],
    [{ id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(1);
  expect(q.evidence[0].kind).toBe("supports");
});

test("signals are reconciled regardless of created_by", () => {
  const q = stubQ(
    [
      sig({ id: "agentSig", created_by: "agent" }),
      sig({ id: "humanSig", created_by: "human" }),
      sig({ id: "systemSig", created_by: "system", status: "confirmed" }),
    ],
    [], // every cited annotation is gone
    [
      { id: "e1", signal_id: "agentSig", annotation_id: "a1", kind: "supports" },
      { id: "e2", signal_id: "humanSig", annotation_id: "a2", kind: "supports" },
      { id: "e3", signal_id: "systemSig", annotation_id: "a3", kind: "supports" },
    ],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(0);
});

test("idempotent: a second pass with nothing changed leaves evidence and confidence alone", () => {
  const q = stubQ(
    [sig({ id: "sig1" })],
    [ann({ id: "a1" })],
    [{ id: "e1", signal_id: "sig1", annotation_id: "a1", kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(1);
  expect(q.evidence[0].kind).toBe("supports");
  expect(q.signals[0].confidence).toBe(0.7);
});

test("evidence rows with no annotation_id (item citations) are left untouched", () => {
  const q = stubQ(
    [sig({ id: "sig1" })],
    [],
    [{ id: "e1", signal_id: "sig1", annotation_id: null, kind: "supports" }],
  );
  reconcileTasteEvidence(q, "s1");
  expect(q.evidence).toHaveLength(1);
});
