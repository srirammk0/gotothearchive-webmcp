/**
 * Step 5 of the continual taste loop (taste-learning.md §"Continual learning
 * loop", retrieval-architecture.md §3.1): turn a person's open annotations into
 * candidate `proposed` taste signals with cited evidence. The statement is
 * written by Workers AI from the grouped comments when the `AI` binding is
 * available (see statement.ts), with a deterministic template — shared dimension,
 * direction, and the words common to the grouped comments — as the fallback.
 * Never auto-confirms.
 *
 * Runs on every annotation write and every artifact decision, so it must be
 * idempotent: it never re-proposes a signal that already covers the same
 * (dimension, direction) with the same evidence.
 */
import { confidenceFrom, TASTE_DIMENSIONS } from "@shared/contract";
import type { TasteDimension, TasteSignal } from "@shared/contract";
import type { Queries } from "../db/queries";
import { refineStatement, type AiLike } from "./statement";

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

/** Jaccard over content words. Used for the "same claim already confirmed" test. */
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

const prettyDimension = (d: string) => d.replace(/_/g, " ");

export async function deriveTasteSignals(
  q: Queries,
  spaceId: string,
  now: number,
  env?: AiLike | undefined,
): Promise<void> {
  // Defense in depth: the query already excludes agent annotations, but taste
  // ownership is important enough to enforce again at the derivation boundary.
  const open = q.openAnnotationsForSpace(spaceId).filter((a) => !a.author_id.startsWith("agent:"));

  // Group by (dimension, sentiment); a note tagged with several dimensions feeds
  // each of its groups. Untagged notes and neutral sentiment are skipped.
  const groups = new Map<string, typeof open>();
  for (const a of open) {
    if (a.sentiment === "neutral") continue;
    for (const dim of a.dimensions) {
      const key = `${dim} ${a.sentiment}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(a);
      else groups.set(key, [a]);
    }
  }

  const confirmed = q.confirmedTasteSignals(spaceId);
  const proposed = q
    .listTasteSignals(spaceId)
    .filter((s) => s.status === "proposed" && s.created_by === "system");

  // An annotation is editable. Reconcile already-cited evidence before deriving
  // anything new so changing sentiment, labels, or authorship cannot leave a
  // stale support row influencing confidence forever.
  for (const signal of [...confirmed, ...proposed]) {
    let changed = false;
    for (const evidence of q.listTasteEvidence(signal.id)) {
      if (!evidence.annotation_id) continue;
      const annotation = q.getAnnotation(evidence.annotation_id);
      const stillRelevant =
        annotation !== null &&
        !annotation.author_id.startsWith("agent:") &&
        annotation.sentiment !== "neutral" &&
        annotation.dimensions.some((d) => signal.dimensions.includes(d));
      if (!stillRelevant) {
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

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const [dimension, sentiment] = key.split(" ") as [string, "positive" | "negative"];
    const direction: "toward" | "away" = sentiment === "positive" ? "toward" : "away";

    // Top ~3 shared content words across the grouped comments.
    const freq = new Map<string, number>();
    for (const a of group) for (const w of new Set(words(a.comment))) freq.set(w, (freq.get(w) ?? 0) + 1);
    const sharedWords = [...freq.entries()].filter(([, n]) => n >= 2);
    // oxlint-disable-next-line unicorn/no-array-sort -- sharedWords is a fresh local array
    sharedWords.sort((x, y) => y[1] - x[1]);
    const phrase = sharedWords
      .slice(0, 3)
      .map(([w]) => w)
      .join(" ");

    const candidateText = `${prettyDimension(dimension)} ${phrase}`;

    const related = (signals: TasteSignal[], wantedDirection: "toward" | "away") => {
      const matches = signals
        .filter(
          (s) =>
            s.dimensions.includes(dimension as TasteDimension) &&
            directionOf(s.statement) === wantedDirection,
        )
        .map((signal) => ({ signal, overlap: statementOverlap(signal.statement, candidateText) }))
        .filter((x) => x.overlap >= 0.15);
      // oxlint-disable-next-line unicorn/no-array-sort -- matches is a fresh local array
      matches.sort((a, b) => b.overlap - a.overlap);
      return matches[0]?.signal;
    };

    const addEvidence = (signal: TasteSignal, kind: "supports" | "contradicts"): number => {
      const existing = new Map(
        q.listTasteEvidence(signal.id)
          .filter((e) => !!e.annotation_id)
          .map((e) => [e.annotation_id as string, e]),
      );
      let inserted = 0;
      for (const a of group) {
        const prior = existing.get(a.id);
        if (prior) {
          if (prior.kind !== kind) {
            q.setTasteEvidenceKind(prior.id, kind);
            inserted++;
          }
          continue;
        }
        q.insertTasteEvidence({
          id: crypto.randomUUID(),
          signal_id: signal.id,
          kind,
          annotation_id: a.id,
          version_id: a.version_id,
          item_id: null,
        });
        existing.set(a.id, {
          id: "pending",
          signal_id: signal.id,
          kind,
          annotation_id: a.id,
          version_id: a.version_id,
          item_id: null,
        });
        inserted++;
      }
      if (inserted > 0) {
        const counts = q.tasteEvidenceCounts(signal.id);
        q.setTasteSignalConfidence(signal.id, confidenceFrom(counts.supporting, counts.contradicting));
      }
      return inserted;
    };

    // Supporting reviews strengthen an existing confirmed claim instead of
    // generating another proposal for the same preference.
    const confirmedMatch = related(confirmed, direction);
    if (confirmedMatch) {
      addEvidence(confirmedMatch, "supports");
      continue;
    }

    // Opposing reviews remain visible as contradicting evidence. They may also
    // form a new proposal below, leaving the human—not the system—to reconcile it.
    const opposite: "toward" | "away" = direction === "toward" ? "away" : "toward";
    const contradicted = related(confirmed, opposite);
    if (contradicted) addEvidence(contradicted, "contradicts");

    // New evidence extends a matching open proposal. This keeps a continual
    // stream of reviews from creating near-identical cards.
    const openProposal = related(proposed, direction);
    if (openProposal) {
      addEvidence(openProposal, "supports");
      continue;
    }

    const supporting = group.length;

    // refineStatement no-ops without an AI binding, so the caller keeps the fallback.
    const artifacts = [
      ...new Set(
        group
          .map((a) => {
            const v = q.getArtifactVersion(a.version_id);
            return v ? q.getArtifact(v.artifact_id) : undefined;
          })
          .filter((x) => x !== undefined && x !== null),
      ),
    ];
    const refined = await refineStatement(env, {
      dimension: prettyDimension(dimension),
      direction,
      comments: group.map((a) => a.comment),
      artifactTitles: artifacts.map((a) => a.title),
    });
    const artifactKinds = [...new Set(artifacts.map((a) => a.kind.replace(/_/g, " ")))];
    const context = artifactKinds.length === 1 ? artifactKinds[0] : "artifacts";
    const leans = direction === "toward" ? "toward" : "away from";
    const statement =
      refined ??
      (phrase
        ? `Leans ${leans} ${phrase} for ${prettyDimension(dimension)} on ${context}.`
        : `Leans ${leans} the current ${prettyDimension(dimension)} on ${context}.`);

    const signalId = crypto.randomUUID();
    q.insertTasteSignal({
      id: signalId,
      space_id: spaceId,
      owner_id: group[0].author_id,
      statement,
      dimensions: TASTE_DIMENSIONS.includes(dimension as TasteDimension)
        ? [dimension as TasteDimension]
        : [],
      scope: "project",
      status: "proposed",
      confidence: confidenceFrom(supporting, 0),
      created_by: "system",
      approved_by: null,
      created_at: now,
      supersedes: null,
    });

    for (const a of group) {
      q.insertTasteEvidence({
        id: crypto.randomUUID(),
        signal_id: signalId,
        kind: "supports",
        annotation_id: a.id,
        version_id: a.version_id,
        item_id: null,
      });
    }

    q.insertTasteEvent({
      id: crypto.randomUUID(),
      signal_id: signalId,
      kind: "proposed",
      actor_type: "system",
      actor_label: "System",
      agent_session_id: null,
      detail: `Derived from ${supporting} of your notes on ${prettyDimension(dimension)}`,
      version_id: null,
      at: now,
    });
  }
}
