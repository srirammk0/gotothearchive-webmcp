/**
 * Evidence reconciliation for taste signals.
 *
 * Taste signals are never created server-side. A signal is proposed only by
 * the agent via the `propose_taste_signal` WebMCP tool — a real model writes
 * the statement and cites the evidence — or by the human authoring one by hand
 * on the Taste page. Nothing here inserts a signal.
 *
 * This module's only job is to keep the evidence and confidence on existing
 * signals honest when the annotations they cite are edited, flipped, or
 * deleted. It runs on every annotation write/edit and every artifact decision,
 * so it must be idempotent.
 */
import { confidenceFrom } from "@shared/contract";
import type { Queries } from "../db/queries";

const STOP = new Set(
  ("the a an and or but for to of in on at is it its it's this that these those with from into as be are was" +
    " were not no nor do does did don't dont doesn't so if then than rather instead too very really just" +
    " should would could can will more less most least much many any all one two also feel feels look looks" +
    " make makes made keep keeps turn turns here there when what which who whom your you our their we they" +
    " i me my but about over under out up down left right thing things bit lot")
    .split(/\s+/),
);

function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}

/** Jaccard over content words. Used by routes.ts for the "same claim already confirmed" test. */
export function statementOverlap(a: string, b: string): number {
  const sa = new Set(words(a));
  const sb = new Set(words(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared);
}

/** Rough direction of an existing statement — we don't store sentiment on a signal. */
function directionOf(statement: string): "toward" | "away" {
  return /\b(rather than|away from|avoid|avoids|not |never|less |instead of|don't|dont)\b/i.test(statement)
    ? "away"
    : "toward";
}

/**
 * Reconcile the annotation-backed evidence on every signal in the space
 * (confirmed and proposed; agent-, human-, or system-created alike). An
 * annotation is editable, so a signal that cites one must not keep a stale
 * support row influencing its confidence forever.
 *
 * For each evidence row with an `annotation_id`:
 * - drop it when the annotation is gone, is now agent-authored, or is neutral;
 * - otherwise flip its `kind` to match the annotation's current sentiment
 *   against the signal's direction.
 *
 * The evidence was chosen deliberately by the agent or the human, so the
 * server never drops a row merely because the annotation's keyword dimension
 * no longer lines up with the signal's dimension.
 */
export function reconcileTasteEvidence(q: Queries, spaceId: string): void {
  for (const signal of q.listTasteSignals(spaceId)) {
    let changed = false;
    for (const evidence of q.listTasteEvidence(signal.id)) {
      if (!evidence.annotation_id) continue;
      const annotation = q.getAnnotation(evidence.annotation_id);
      const stale =
        annotation === null ||
        annotation.author_id.startsWith("agent:") ||
        annotation.sentiment === "neutral";
      if (stale) {
        q.deleteTasteEvidence(evidence.id);
        changed = true;
        continue;
      }
      const annotationDirection = annotation.sentiment === "positive" ? "toward" : "away";
      const expectedKind = directionOf(signal.statement) === annotationDirection ? "supports" : "contradicts";
      if (evidence.kind !== expectedKind) {
        q.setTasteEvidenceKind(evidence.id, expectedKind);
        changed = true;
      }
    }
    if (changed) {
      const counts = q.tasteEvidenceCounts(signal.id);
      q.setTasteSignalConfidence(signal.id, confidenceFrom(counts.supporting, counts.contradicting));
    }
  }
}
